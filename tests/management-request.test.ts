import { beforeEach, describe, expect, it, vi } from "vitest";

describe("shared management request lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("document", { cookie: "" });
  });

  it("recovers a missing token and retries a JSON mutation exactly once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid CSRF token.", code: "CSRF_INVALID" }), { status: 403 }))
      .mockImplementationOnce(async () => { document.cookie = "orinda_management_csrf=recovered"; return Response.json({ ok: true }); })
      .mockResolvedValueOnce(Response.json({ id: "assignment-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const { managementMutation } = await import("../src/lib/management-request");

    await expect(managementMutation("/api/manage/assignments", "POST", { title: "Unsaved title" })).resolves.toEqual({ id: "assignment-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/manage/csrf");
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[2][1].body);
    expect(fetchMock.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("recovered");
  });

  it("does not retry arbitrary failures or describe expired authentication as CSRF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Authorisation required." }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { managementMutation } = await import("../src/lib/management-request");
    await expect(managementMutation("/api/manage/assignments", "POST", { title: "Keep me" })).rejects.toThrow(/reopen your saved management access link/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the saved-link instruction for an expired authenticated management read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Authorisation required." }), { status: 401 })));
    const { managementQuery } = await import("../src/lib/management-request");
    await expect(managementQuery("/api/manage/share-link")).rejects.toThrow(/reopen your saved management access link/i);
  });

  it("coalesces concurrent recovery calls so they cannot rotate each other", async () => {
    let recoveryCalls = 0;
    const mutationAttempts = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/manage/csrf") {
        recoveryCalls++;
        await Promise.resolve();
        document.cookie = "orinda_management_csrf=shared";
        return Response.json({ ok: true });
      }
      const count = mutationAttempts.get(url) ?? 0;
      mutationAttempts.set(url, count + 1);
      return count === 0
        ? new Response(JSON.stringify({ error: "Invalid CSRF token.", code: "CSRF_INVALID" }), { status: 403 })
        : Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { managementMutation } = await import("../src/lib/management-request");
    await Promise.all([managementMutation("/mutation/a"), managementMutation("/mutation/b")]);
    expect(recoveryCalls).toBe(1);
    expect(mutationAttempts.get("/mutation/a")).toBe(2);
    expect(mutationAttempts.get("/mutation/b")).toBe(2);
  });

  it("retries an upload only for explicit pre-body CSRF rejection with the same file and upload id", async () => {
    const sends: Array<{ body: File; headers: Record<string, string> }> = [];
    let attempt = 0;
    class FakeXhr {
      status = 0; responseText = ""; withCredentials = false;
      upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      headers: Record<string, string> = {};
      open() {}
      setRequestHeader(name: string, value: string) { this.headers[name] = value; }
      send(body: File) {
        sends.push({ body, headers: { ...this.headers } });
        attempt++;
        this.status = attempt === 1 ? 403 : 201;
        this.responseText = attempt === 1 ? JSON.stringify({ error: "Invalid CSRF token.", code: "CSRF_INVALID" }) : JSON.stringify({ id: "file-1" });
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal("fetch", vi.fn(async () => { document.cookie = "orinda_management_csrf=upload-token"; return Response.json({ ok: true }); }));
    const { managementUpload } = await import("../src/lib/management-request");
    const file = new File(["content"], "lesson.pdf", { type: "application/pdf" });
    await expect(managementUpload("/upload", file, "stable-upload-id-123456", vi.fn())).resolves.toEqual({ id: "file-1" });
    expect(sends).toHaveLength(2);
    expect(sends[0].body).toBe(file);
    expect(sends[1].body).toBe(file);
    expect(sends.map((send) => send.headers["X-Upload-Id"])).toEqual(["stable-upload-id-123456", "stable-upload-id-123456"]);
  });
});
