"use client";

const CSRF_COOKIE = "orinda_management_csrf";
const CSRF_REJECTION = "CSRF_INVALID";
const SESSION_MESSAGE = "Your management session has expired or is no longer valid. Reopen your saved management access link to continue.";

type ErrorBody = { error?: string; code?: string };
type UploadProgress = (percent: number) => void;

let recovery: Promise<void> | null = null;

function cookieValue(name: string) {
  const prefix = `${name}=`;
  const encoded = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
  if (!encoded) return "";
  try { return decodeURIComponent(encoded); } catch { return ""; }
}

async function responseBody(response: Response): Promise<ErrorBody & Record<string, unknown>> {
  try { return await response.json(); } catch { return { error: "Invalid server response." }; }
}

function requestError(status: number, body: ErrorBody) {
  return new Error(status === 401 ? SESSION_MESSAGE : body.error || "The request could not be completed.");
}

async function recoverCsrf() {
  if (!recovery) {
    recovery = (async () => {
      const response = await fetch("/api/manage/csrf", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = await responseBody(response);
      if (!response.ok) throw requestError(response.status, body);
      if (!cookieValue(CSRF_COOKIE)) throw new Error("CSRF recovery did not set the required security cookie.");
    })().finally(() => { recovery = null; });
  }
  return recovery;
}

export async function managementMutation<T = Record<string, unknown>>(url: string, method = "POST", body?: unknown): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": cookieValue(CSRF_COOKIE) },
      body: payload,
    });
    const result = await responseBody(response);
    if (response.ok) return result as T;
    if (attempt === 0 && response.status === 403 && result.code === CSRF_REJECTION) {
      await recoverCsrf();
      continue;
    }
    throw requestError(response.status, result);
  }
  throw new Error("The request could not be completed.");
}

export async function managementQuery<T = Record<string, unknown>>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const result = await responseBody(response);
  if (!response.ok) throw requestError(response.status, result);
  return result as T;
}

function uploadAttempt(url: string, file: File, uploadId: string, onProgress: UploadProgress) {
  return new Promise<{ status: number; body: ErrorBody & Record<string, unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", cookieValue(CSRF_COOKIE));
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-Upload-Id", uploadId);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      let body: ErrorBody & Record<string, unknown>;
      try { body = JSON.parse(xhr.responseText); } catch { body = { error: "Invalid server response." }; }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Network error. Retry this file."));
    xhr.send(file);
  });
}

export async function managementUpload<T = Record<string, unknown>>(url: string, file: File, uploadId: string, onProgress: UploadProgress): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await uploadAttempt(url, file, uploadId, onProgress);
    if (result.status >= 200 && result.status < 300) return result.body as T;
    if (attempt === 0 && result.status === 403 && result.body.code === CSRF_REJECTION) {
      await recoverCsrf();
      continue;
    }
    throw requestError(result.status, result.body);
  }
  throw new Error("The upload could not be completed.");
}
