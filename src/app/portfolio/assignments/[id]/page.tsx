import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { nairobiTime } from "@/lib/time";
import { AttachmentView, type ReviewAttachment } from "@/components/AttachmentView";
import { PortfolioHeader } from "@/components/PortfolioHeader";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getSession("SUPERVISOR")) redirect("/?access=session&role=supervisor");
  const item = await db.assignment.findUnique({ where: { id: (await params).id }, include: { publishedRevision: { include: { attachments: { orderBy: { position: "asc" } } } } } });
  if (!item?.publishedRevision) notFound();
  const revision = item.publishedRevision;
  const attachments: ReviewAttachment[] = revision.attachments.map((attachment) => ({ ...attachment, sizeBytes: Number(attachment.sizeBytes), uploadedAt: attachment.uploadedAt.toISOString() }));
  return <><a className="skip-link" href="#review">Skip to assignment review</a><PortfolioHeader/><main className="detail-page" id="review"><div className="container"><Link className="back" href="/portfolio#assignments">← All assignments</Link><header className="assignment-intro"><p className="eyebrow">Published assignment</p><h1>{revision.title}</h1><p className="publication-date"><span>Published</span><time dateTime={revision.publishedAt?.toISOString()}>{nairobiTime(revision.publishedAt, true)}</time><span>Africa/Nairobi</span></p>{revision.description && <p className="detail-description">{revision.description}</p>}</header><AttachmentView attachments={attachments}/></div></main></>;
}
