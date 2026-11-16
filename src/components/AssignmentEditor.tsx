/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { nairobiTime } from "@/lib/time";
import { managementMutation, managementUpload } from "@/lib/management-request";

type Attachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; position: number; uploadedAt: string };
type Revision = { id: string; title: string; description: string | null; createdAt: string; updatedAt: string; publishedAt: string | null; attachments: Attachment[] };
type Assignment = { id: string; createdAt: string; updatedAt: string; draft: Revision; published: Revision | null };
type Pending = { id: string; file: File; progress: number; state: "queued" | "uploading" | "failed"; error?: string };

export default function AssignmentEditor({ assignment }: { assignment: Assignment }) {
  const router = useRouter();
  const [title, setTitle] = useState(assignment.draft.title);
  const [description, setDescription] = useState(assignment.draft.description ?? "");
  const [attachments, setAttachments] = useState(assignment.draft.attachments);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastServerState, setLastServerState] = useState(`${assignment.draft.id}:${assignment.draft.updatedAt}`);
  const nextServerState = `${assignment.draft.id}:${assignment.draft.updatedAt}`;
  if (lastServerState !== nextServerState) {
    setLastServerState(nextServerState);
    if (!dirty) {
      setTitle(assignment.draft.title);
      setDescription(assignment.draft.description ?? "");
    }
    if (!busy && !pending.some((item) => item.state === "uploading")) {
      setAttachments(assignment.draft.attachments);
    }
  }

  useEffect(() => {
    const hasUnsaved = () => dirty || pending.length > 0;
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsaved()) { event.preventDefault(); event.returnValue = ""; } };
    const warnLink = (event: MouseEvent) => {
      if (hasUnsaved() && (event.target as Element).closest("a") && !confirm("Leave without saving the draft or finishing uploads?")) event.preventDefault();
    };
    addEventListener("beforeunload", warn);
    document.addEventListener("click", warnLink);
    return () => { removeEventListener("beforeunload", warn); document.removeEventListener("click", warnLink); };
  }, [dirty, pending]);

  function startOperation() { setMessage(""); setError(""); setBusy(true); }
  function select(files: FileList | null) {
    if (!files || busy) return;
    const added = Array.from(files).map((file) => ({ id: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().slice(0, 8), file, progress: 0, state: "queued" as const }));
    setPending((current) => [...current, ...added]);
    setMessage(""); setError("");
  }

  async function uploadOne(item: Pending) {
    setPending((current) => current.map((value) => value.id === item.id ? { ...value, state: "uploading" } : value));
    try {
      const result = await managementUpload<Attachment>(
        `/api/manage/assignments/${assignment.id}/attachments`,
        item.file,
        item.id,
        (progress) => setPending((current) => current.map((value) => value.id === item.id ? { ...value, progress } : value)),
      );
      setAttachments((current) => current.some((value) => value.id === result.id) ? current : [...current, result]);
      setPending((current) => current.filter((value) => value.id !== item.id));
    } catch (cause) {
      setPending((current) => current.map((value) => value.id === item.id ? { ...value, state: "failed", error: (cause as Error).message } : value));
    }
  }

  async function uploadAll() {
    if (busy) return;
    startOperation();
    try {
      for (const item of pending.filter((value) => value.state !== "uploading")) await uploadOne(item);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function save() {
    if (busy) return;
    startOperation();
    try {
      await managementMutation(`/api/manage/assignments/${assignment.id}`, "PATCH", { title, description });
      setDirty(false); setMessage("Draft saved."); router.refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function act(action: "publish" | "unpublish") {
    if (busy) return;
    setMessage(""); setError("");
    if (action === "publish" && dirty) { setError("Save the draft before publishing."); return; }
    if (action === "publish" && pending.length) { setError("Upload or remove every queued or failed file before publishing."); return; }
    setBusy(true);
    try {
      await managementMutation(`/api/manage/assignments/${assignment.id}/${action}`);
      if (action === "publish") {
        router.push("/manage?published=1");
        router.refresh();
        return;
      }
      setMessage("Assignment unpublished. Supervisors can no longer view it."); router.refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (busy || !confirm("Remove this attachment from the working draft?")) return;
    startOperation();
    try {
      await managementMutation(`/api/manage/assignments/${assignment.id}/attachments/${id}`, "DELETE");
      setAttachments((current) => current.filter((value) => value.id !== id)); setMessage("Attachment removed from draft."); router.refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function move(index: number, delta: number) {
    if (busy) return;
    const copy = [...attachments]; const target = index + delta;
    if (target < 0 || target >= copy.length) return;
    [copy[index], copy[target]] = [copy[target], copy[index]];
    startOperation(); setAttachments(copy);
    try {
      await managementMutation(`/api/manage/assignments/${assignment.id}`, "PATCH", { attachmentOrder: copy.map((value) => value.id) });
      setMessage("Attachment order saved."); router.refresh();
    } catch (cause) { setAttachments(attachments); setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function destroy() {
    if (busy || !confirm("Permanently delete this assignment and all of its revisions? This cannot be undone.")) return;
    startOperation();
    try { await managementMutation(`/api/manage/assignments/${assignment.id}`, "DELETE"); router.push("/manage"); router.refresh(); }
    catch (cause) { setError((cause as Error).message); setBusy(false); }
  }

  const publicationBlocked = busy || dirty || pending.length > 0 || attachments.length === 0;
  return <main className="manage-page"><div className="editor-shell"><Link className="back" href="/manage">← All assignments</Link><header className="editor-header"><div><span className={`status ${assignment.published ? "published" : "draft"}`}>{assignment.published ? "Published — edits remain private until republished" : "Draft"}</span><h1>Edit assignment</h1></div><button className="danger-link" onClick={destroy} disabled={busy}>Delete assignment</button></header>{message && <p className="notice success" role="status">{message}</p>}{error && <p className="notice error" role="alert">{error}</p>}<section className="editor-panel"><label>Title<input value={title} maxLength={200} disabled={busy} onChange={(event) => { setTitle(event.target.value); setDirty(true); setMessage(""); setError(""); }}/></label><label>Description (optional, plain text)<textarea rows={6} maxLength={20000} value={description} disabled={busy} onChange={(event) => { setDescription(event.target.value); setDirty(true); setMessage(""); setError(""); }}/></label><button className="button" onClick={save} disabled={busy || !dirty}>{busy ? "Working…" : "Save draft"}</button></section><section className="editor-panel"><div className="section-title"><div><h2>Attachments</h2><p>JPEG, PNG, WebP or PDF. Order pages before publishing.</p></div><span>{attachments.length} stored</span></div><div className="file-buttons"><label className="button secondary">Choose files<input className="visually-hidden" type="file" multiple disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => select(event.target.files)}/></label><label className="button secondary">Use camera<input className="visually-hidden" type="file" disabled={busy} accept="image/*" capture="environment" onChange={(event) => select(event.target.files)}/></label></div>{pending.length > 0 && <div className="pending-list">{pending.map((item) => <div key={item.id}><strong>{item.file.name}</strong><span>{item.state === "failed" ? item.error : `${item.progress}% ${item.state}`}</span><progress value={item.progress} max="100"/></div>)}<div className="pending-actions"><button className="button" disabled={busy} onClick={uploadAll}>{pending.some((item) => item.state === "failed") ? "Retry failed / upload queued" : "Upload selected files"}</button><button className="button secondary" disabled={busy} onClick={() => { setPending([]); setError(""); setMessage(""); }}>Remove queued files</button></div></div>}<div className="edit-attachments">{attachments.map((item, index) => <article key={item.id}>{item.mimeType.startsWith("image/") ? <img src={`/api/files/${item.id}?variant=thumbnail`} alt={`Preview of ${item.originalName}`}/> : <div className="pdf-mark">PDF</div>}<div><span>#{index + 1}</span><strong>{item.originalName}</strong><small>Uploaded {nairobiTime(item.uploadedAt, true)} (Africa/Nairobi)</small></div><div className="order-buttons"><button onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move ${item.originalName} earlier`}>↑</button><button onClick={() => move(index, 1)} disabled={busy || index === attachments.length - 1} aria-label={`Move ${item.originalName} later`}>↓</button><button className="remove" disabled={busy} onClick={() => remove(item.id)}>Remove</button></div></article>)}</div></section><section className="publish-panel"><div><h2>Publication</h2><p>Publishing requires a saved title, no queued or failed uploads, and at least one stored attachment. A complete snapshot replaces the current supervisor version atomically.</p>{assignment.published && <p><strong>Current publication:</strong> {nairobiTime(assignment.published.publishedAt, true)} (Africa/Nairobi), {assignment.published.attachments.length} attachment{assignment.published.attachments.length === 1 ? "" : "s"}.</p>}</div><div>{assignment.published && <button className="button secondary" onClick={() => act("unpublish")} disabled={busy}>Unpublish</button>}<button className="button" onClick={() => act("publish")} disabled={publicationBlocked}>{assignment.published ? "Publish replacement" : "Publish assignment"}</button></div></section><dl className="timestamp-list"><div><dt>Assignment created</dt><dd>{nairobiTime(assignment.createdAt, true)} (Africa/Nairobi)</dd></div><div><dt>Draft last updated</dt><dd>{nairobiTime(assignment.draft.updatedAt, true)} (Africa/Nairobi)</dd></div></dl></div></main>;
}
