/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nairobiTime } from "@/lib/time";
import { managementMutation, managementUpload } from "@/lib/management-request";

type Attachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; position: number; uploadedAt: string };
type Revision = { id: string; title: string; description: string | null; createdAt: string; updatedAt: string; publishedAt: string | null; attachments: Attachment[] };
type Assignment = { id: string; createdAt: string; updatedAt: string; draft: Revision; published: Revision | null };
type EditorFile = { localId: string; file?: File; attachment?: Attachment; progress: number; state: "queued" | "uploading" | "complete" | "failed"; error?: string };

const uploadLimit = 1;

export default function AssignmentEditor({ assignment }: { assignment: Assignment | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(assignment?.draft.title ?? "");
  const [description, setDescription] = useState(assignment?.draft.description ?? "");
  const [files, setFiles] = useState<EditorFile[]>(() => (assignment?.draft.attachments ?? []).map((attachment) => ({ localId: attachment.id, attachment, progress: 100, state: "complete" })));
  const [assignmentId, setAssignmentId] = useState(assignment?.id ?? "");
  const [temporary, setTemporary] = useState(!assignment);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const createPromise = useRef<Promise<string> | null>(null);
  const publishAttempt = useRef<string | null>(null);
  const activeUploads = useRef(new Set<string>());

  const ensureAssignment = useCallback(async () => {
    if (assignmentId) return assignmentId;
    if (!createPromise.current) {
      createPromise.current = managementMutation<{ id: string }>("/api/manage/assignments", "POST", { title: "", temporary: true })
        .then((result) => { setAssignmentId(result.id); return result.id; })
        .catch((cause) => { createPromise.current = null; throw cause; });
    }
    return createPromise.current;
  }, [assignmentId]);

  const uploadOne = useCallback(async (item: EditorFile) => {
    if (!item.file || activeUploads.current.has(item.localId)) return;
    activeUploads.current.add(item.localId);
    setFiles((current) => current.map((value) => value.localId === item.localId ? { ...value, state: "uploading", error: undefined } : value));
    try {
      const id = await ensureAssignment();
      const attachment = await managementUpload<Attachment>(`/api/manage/assignments/${id}/attachments`, item.file, item.localId,
        (progress) => setFiles((current) => current.map((value) => value.localId === item.localId ? { ...value, progress } : value)));
      setFiles((current) => current.map((value) => value.localId === item.localId ? { ...value, file: undefined, attachment, progress: 100, state: "complete" } : value));
    } catch (cause) {
      setFiles((current) => current.map((value) => value.localId === item.localId ? { ...value, state: "failed", error: (cause as Error).message } : value));
    } finally { activeUploads.current.delete(item.localId); }
  }, [ensureAssignment]);

  useEffect(() => {
    const available = uploadLimit - files.filter((item) => item.state === "uploading").length;
    files.filter((item) => item.state === "queued" && !activeUploads.current.has(item.localId)).slice(0, Math.max(0, available)).forEach((item) => { void uploadOne(item); });
  }, [files, uploadOne]);

  const unfinished = dirty || files.some((item) => item.state !== "complete") || (temporary && Boolean(assignmentId));
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unfinished) { event.preventDefault(); event.returnValue = ""; } };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [unfinished]);

  function select(input: HTMLInputElement) {
    const selected = Array.from(input.files ?? []);
    input.value = "";
    if (!selected.length || busy) return;
    publishAttempt.current = null;
    setFiles((current) => [...current, ...selected.map((file) => ({ localId: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 8), file, progress: 0, state: "queued" as const }))]);
    setMessage(""); setError("");
  }

  async function leave(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (unfinished && !confirm("Leave this unfinished assignment?")) return;
    if (temporary && assignmentId) await managementMutation(`/api/manage/assignments/${assignmentId}?temporary=1`, "DELETE").catch(() => undefined);
    router.push("/manage");
  }

  async function remove(item: EditorFile) {
    if (busy || item.state === "uploading") return;
    if (item.state !== "complete") { publishAttempt.current = null; setFiles((current) => current.filter((value) => value.localId !== item.localId)); return; }
    if (!item.attachment || !confirm("Remove this attachment?")) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const id = await ensureAssignment();
      await managementMutation(`/api/manage/assignments/${id}/attachments/${item.attachment.id}`, "DELETE");
      setFiles((current) => current.filter((value) => value.localId !== item.localId));
      setDirty(true);
      publishAttempt.current = null;
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  function retry(localId: string) {
    publishAttempt.current = null;
    setFiles((current) => current.map((item) => item.localId === localId ? { ...item, state: "queued", progress: 0, error: undefined } : item));
    setError(""); setMessage("");
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= files.length || busy) return;
    setFiles((current) => { const copy = [...current]; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy; });
    publishAttempt.current = null;
    setDirty(true); setMessage("");
  }

  async function finish(action: "save" | "publish") {
    if (busy) return;
    setMessage(""); setError("");
    if (files.some((item) => item.state === "queued" || item.state === "uploading")) { setError("Wait for every upload to finish before continuing."); return; }
    if (files.some((item) => item.state === "failed")) { setError("Retry or remove every failed file before continuing."); return; }
    if (action === "publish" && !title.trim()) { setError("Add a title before publishing."); return; }
    if (action === "publish" && !files.some((item) => item.attachment)) { setError("Add at least one attachment before publishing."); return; }
    setBusy(true);
    let saved = false;
    try {
      const id = await ensureAssignment();
      if (action === "save" || !publishAttempt.current) {
        const result = await managementMutation<{ draftRevisionId: string }>(`/api/manage/assignments/${id}`, "PATCH", { title, description, attachmentOrder: files.map((item) => item.attachment!.id) });
        saved = true; setDirty(false); setTemporary(false);
        publishAttempt.current = action === "publish" ? result.draftRevisionId : null;
      } else { saved = true; }
      if (action === "publish") await managementMutation(`/api/manage/assignments/${id}/publish`, "POST", { draftRevisionId: publishAttempt.current });
      router.push(action === "publish" ? "/manage?published=1" : "/manage?saved=1");
      router.refresh();
    } catch (cause) {
      setError(saved && action === "publish" ? `Your draft was saved, but it was not published. ${(cause as Error).message}` : (cause as Error).message);
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!assignmentId || busy || !confirm("Remove this assignment from supervisor view?")) return;
    setBusy(true); setError(""); setMessage("");
    try { await managementMutation(`/api/manage/assignments/${assignmentId}/unpublish`); setMessage("Assignment is no longer visible to supervisors."); router.refresh(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function destroy() {
    if (!assignmentId || busy || !confirm("Permanently delete this assignment? This cannot be undone.")) return;
    setBusy(true);
    try { await managementMutation(`/api/manage/assignments/${assignmentId}`, "DELETE"); router.push("/manage"); router.refresh(); }
    catch (cause) { setError((cause as Error).message); setBusy(false); }
  }

  const uploading = files.some((item) => item.state === "queued" || item.state === "uploading");
  const failed = files.some((item) => item.state === "failed");
  const completed = files.filter((item) => item.attachment).length;
  const finalBlocked = busy || uploading || failed;

  return <main className="manage-page"><div className="editor-shell"><Link className="back" href="/manage" onClick={leave}>← All assignments</Link><header className="editor-header"><div><span className={`status ${assignment?.published ? "published" : "draft"}`}>{assignment?.published ? "Published — changes stay private until you publish again" : "Draft"}</span><h1>{assignment ? "Edit assignment" : "New assignment"}</h1></div>{assignmentId && <button className="danger-link" onClick={destroy} disabled={busy}>Delete assignment</button>}</header>{message && <p className="notice success" role="status">{message}</p>}{error && <p className="notice error" role="alert">{error}</p>}<section className="editor-panel assignment-fields"><label>Title<input value={title} maxLength={200} disabled={busy} onChange={(event) => { setTitle(event.target.value); setDirty(true); publishAttempt.current = null; setMessage(""); setError(""); }} placeholder="e.g. Classroom management reflection"/></label><label>Description (optional)<textarea rows={6} maxLength={20000} value={description} disabled={busy} onChange={(event) => { setDescription(event.target.value); setDirty(true); publishAttempt.current = null; setMessage(""); setError(""); }}/></label><div className="section-title"><div><h2>Attachments</h2><p>JPEG, PNG, WebP or PDF. Uploading starts as soon as you choose files.</p></div><span>{completed} uploaded</span></div><div className="file-buttons"><label className="button secondary">Choose files<input className="visually-hidden" type="file" multiple disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => select(event.currentTarget)}/></label><label className="button secondary">Use camera<input className="visually-hidden" type="file" disabled={busy} accept="image/*" capture="environment" onChange={(event) => select(event.currentTarget)}/></label></div><div className="edit-attachments">{files.map((item, index) => <article key={item.localId} className={item.state !== "complete" ? "upload-row" : undefined}>{item.attachment?.mimeType.startsWith("image/") ? <img src={`/api/files/${item.attachment.id}?variant=thumbnail`} alt={`Preview of ${item.attachment.originalName}`}/> : item.attachment ? <div className="pdf-mark">PDF</div> : <div className="upload-mark">{item.state === "failed" ? "!" : "…"}</div>}<div><span>#{index + 1}</span><strong>{item.attachment?.originalName ?? item.file?.name}</strong>{item.state === "complete" && item.attachment ? <small>Uploaded {nairobiTime(item.attachment.uploadedAt, true)} (Africa/Nairobi)</small> : <><small>{item.state === "failed" ? item.error : `${item.progress}% ${item.state === "queued" ? "waiting" : "uploading"}`}</small><progress value={item.progress} max="100"/></>}</div><div className="order-buttons"><button onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move ${(item.attachment?.originalName ?? item.file?.name)} earlier`}>↑</button><button onClick={() => move(index, 1)} disabled={busy || index === files.length - 1} aria-label={`Move ${(item.attachment?.originalName ?? item.file?.name)} later`}>↓</button>{item.state === "failed" && <button disabled={busy} onClick={() => retry(item.localId)}>Retry</button>}<button className="remove" disabled={busy || item.state === "uploading"} onClick={() => remove(item)}>Remove</button></div></article>)}</div></section><section className="publish-panel final-actions"><div><h2>Ready?</h2><p>Save your work to continue later, or publish it for supervisor review.</p>{assignment?.published && <p><strong>Currently visible:</strong> {nairobiTime(assignment.published.publishedAt, true)} (Africa/Nairobi).</p>}</div><div>{assignment?.published && <button className="button secondary" onClick={unpublish} disabled={busy}>Unpublish</button>}<button className="button secondary" onClick={() => finish("save")} disabled={finalBlocked}>Save draft</button><button className="button" onClick={() => finish("publish")} disabled={finalBlocked || !title.trim() || completed === 0}>{assignment?.published ? "Publish changes" : "Publish"}</button></div></section>{assignment && <dl className="timestamp-list"><div><dt>Assignment created</dt><dd>{nairobiTime(assignment.createdAt, true)} (Africa/Nairobi)</dd></div><div><dt>Draft last updated</dt><dd>{nairobiTime(assignment.draft.updatedAt, true)} (Africa/Nairobi)</dd></div></dl>}</div></main>;
}
