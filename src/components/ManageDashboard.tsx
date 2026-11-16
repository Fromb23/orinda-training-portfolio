"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { nairobiTime } from "@/lib/time";

type Item = { id: string; createdAt: string; updatedAt: string; draft: { title: string; attachments: unknown[] }; publishedAt: string | null };

function csrf() {
  return decodeURIComponent(document.cookie.split("; ").find((value) => value.startsWith("orinda_management_csrf="))?.split("=")[1] ?? "");
}

export default function ManageDashboard({ initial, published }: { initial: Item[]; published: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  async function create() {
    setBusy(true); setError(""); setLink("");
    try {
      const response = await fetch("/api/manage/assignments", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ title }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(`/manage/assignments/${result.id}`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function copyLink() {
    setError(""); setLink("");
    try {
      const response = await fetch("/api/manage/share-link"); const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!result.link) throw new Error("The supervisor share link is not configured on the server.");
      await navigator.clipboard.writeText(result.link); setLink("Full supervisor access link copied.");
    } catch (cause) { setError((cause as Error).message); }
  }

  return <main className="manage-page"><header className="manage-header"><div><p className="eyebrow">Private management</p><h1>Training assignments</h1></div><button className="button secondary" onClick={copyLink}>Copy supervisor link</button></header><div className="manage-shell">{published && <p className="notice success" role="status">Assignment published successfully. The current supervisor version and dates are shown below.</p>}{link && <p className="notice success" role="status">{link}</p>}{error && <p className="notice error" role="alert">{error}</p>}<section className="create-panel"><h2>Create an assignment</h2><label>Title<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Classroom management reflection"/></label><button className="button" disabled={busy || !title.trim()} onClick={create}>{busy ? "Creating…" : "Create draft"}</button></section><section><h2>Your assignments</h2>{initial.length ? <div className="manage-list">{initial.map((item) => <Link href={`/manage/assignments/${item.id}`} key={item.id} className="manage-card"><div><span className={`status ${item.publishedAt ? "published" : "draft"}`}>{item.publishedAt ? "Published" : "Draft"}</span><h3>{item.draft.title}</h3><p>{item.draft.attachments.length} attachment{item.draft.attachments.length === 1 ? "" : "s"}</p></div><dl><div><dt>Created</dt><dd>{nairobiTime(item.createdAt, true)}</dd></div><div><dt>Last updated</dt><dd>{nairobiTime(item.updatedAt, true)}</dd></div>{item.publishedAt && <div><dt>Published</dt><dd>{nairobiTime(item.publishedAt, true)}</dd></div>}</dl></Link>)}</div> : <div className="empty">No assignments yet. Create your first draft above.</div>}</section></div></main>;
}
