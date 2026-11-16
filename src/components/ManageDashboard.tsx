"use client";

import Link from "next/link";
import { useState } from "react";
import { nairobiTime } from "@/lib/time";
import { managementQuery } from "@/lib/management-request";

type Item = { id: string; createdAt: string; updatedAt: string; draft: { title: string; attachments: unknown[] }; publishedAt: string | null };

export default function ManageDashboard({ initial, published, saved }: { initial: Item[]; published: boolean; saved: boolean }) {
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  async function copyLink() {
    setError(""); setLink("");
    try {
      const result = await managementQuery<{ link: string | null }>("/api/manage/share-link");
      if (!result.link) throw new Error("The supervisor share link is not configured on the server.");
      await navigator.clipboard.writeText(result.link); setLink("Full supervisor access link copied.");
    } catch (cause) { setError((cause as Error).message); }
  }

  return <main className="manage-page"><header className="manage-header"><div><p className="eyebrow">Private management</p><h1>Training assignments</h1></div><button className="button secondary" onClick={copyLink}>Copy supervisor link</button></header><div className="manage-shell">{published && <p className="notice success" role="status">Assignment published successfully. The current supervisor version and dates are shown below.</p>}{saved && <p className="notice success" role="status">Draft saved successfully.</p>}{link && <p className="notice success" role="status">{link}</p>}{error && <p className="notice error" role="alert">{error}</p>}<section className="create-panel new-assignment-panel"><div><h2>Start an assignment</h2><p>Add the details and files together in one editor.</p></div><Link className="button" href="/manage/assignments/new">New assignment</Link></section><section><h2>Your assignments</h2>{initial.length ? <div className="manage-list">{initial.map((item) => <Link href={`/manage/assignments/${item.id}`} key={item.id} className="manage-card"><div><span className={`status ${item.publishedAt ? "published" : "draft"}`}>{item.publishedAt ? "Published" : "Draft"}</span><h3>{item.draft.title || "Untitled assignment"}</h3><p>{item.draft.attachments.length} attachment{item.draft.attachments.length === 1 ? "" : "s"}</p></div><dl><div><dt>Created</dt><dd>{nairobiTime(item.createdAt, true)}</dd></div><div><dt>Last updated</dt><dd>{nairobiTime(item.updatedAt, true)}</dd></div>{item.publishedAt && <div><dt>Published</dt><dd>{nairobiTime(item.publishedAt, true)}</dd></div>}</dl></Link>)}</div> : <div className="empty">No assignments yet. Start your first assignment above.</div>}</section></div></main>;
}
