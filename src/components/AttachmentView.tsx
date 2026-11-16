/* eslint-disable @next/next/no-img-element */
type Attachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; position: number };
export function AttachmentView({ attachment, index }: { attachment: Attachment; index: number }) {
  const base = `/api/files/${attachment.id}`;
  if (attachment.mimeType.startsWith("image/")) return <article className="attachment-card"><a href={base} target="_blank" rel="noopener noreferrer" aria-label={`Open ${attachment.originalName} full size in a new tab`}><img src={`${base}?variant=thumbnail`} alt={`Page ${index + 1}: ${attachment.originalName}`} loading="lazy" /></a><div><span>Image {index + 1}</span><strong>{attachment.originalName}</strong><a href={`${base}?download=1`}>Download</a></div></article>;
  return <article className="attachment-card attachment-pdf"><div className="pdf-mark" aria-hidden="true">PDF</div><div><span>Document {index + 1}</span><strong>{attachment.originalName}</strong><div className="inline-actions"><a href={base} target="_blank" rel="noopener noreferrer">View PDF</a><a href={`${base}?download=1`}>Download</a></div></div></article>;
}
