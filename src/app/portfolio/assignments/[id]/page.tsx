import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { nairobiTime } from "@/lib/time";
import { AttachmentView, type ReviewAttachment } from "@/components/AttachmentView";
import { PortfolioHeader } from "@/components/PortfolioHeader";

export const dynamic = "force-dynamic";

function fileSize(bytes: number) {
  const total = bytes / 1024 ** 2;
  return total < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${total.toFixed(1)} MB`;
}

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getSession("SUPERVISOR")) redirect("/?access=session&role=supervisor");
  const item = await db.assignment.findUnique({ where: { id: (await params).id }, include: { publishedRevision: { include: { attachments: { orderBy: { position: "asc" } } } } } });
  if (!item?.publishedRevision) notFound();
  const revision = item.publishedRevision;
  const attachments: ReviewAttachment[] = revision.attachments.map((attachment) => ({ ...attachment, sizeBytes: Number(attachment.sizeBytes), uploadedAt: attachment.uploadedAt.toISOString() }));
  const types = [...new Set(attachments.map((attachment) => attachment.mimeType === "application/pdf" ? "PDF" : attachment.mimeType.split("/")[1]?.toUpperCase()))].filter(Boolean).join(", ");
  const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  const latestUpload = attachments.reduce<Date | null>((latest, attachment) => { const value = new Date(attachment.uploadedAt); return !latest || value > latest ? value : latest; }, null);

  return <><a className="skip-link" href="#review">Skip to assignment review</a><PortfolioHeader/><main className="detail-page" id="review"><div className="container"><Link className="back" href="/portfolio#assignments">← All assignments</Link><header className="assignment-intro"><div><p className="eyebrow">Published assignment</p><h1>{revision.title}</h1>{revision.description && <p className="detail-description">{revision.description}</p>}</div><dl className="assignment-facts"><div><dt>Published</dt><dd>{nairobiTime(revision.publishedAt, true)}<small>Africa/Nairobi</small></dd></div><div><dt>Latest file upload</dt><dd>{latestUpload ? nairobiTime(latestUpload, true) : "—"}<small>{latestUpload ? "Africa/Nairobi" : "No files"}</small></dd></div><div><dt>Files</dt><dd>{attachments.length}<small>{types || "None"}</small></dd></div><div><dt>Total size</dt><dd>{fileSize(totalBytes)}<small>Original files</small></dd></div></dl></header><AttachmentView attachments={attachments}/></div></main></>;
}
