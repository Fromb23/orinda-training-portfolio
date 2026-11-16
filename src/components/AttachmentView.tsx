/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { nairobiTime } from "@/lib/time";

export type ReviewAttachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; position: number; uploadedAt: string };

function fileType(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  return mimeType.split("/")[1]?.toUpperCase() ?? "File";
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function AttachmentView({ attachments }: { attachments: ReviewAttachment[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const viewerHeading = useRef<HTMLHeadingElement>(null);
  const attachment = attachments[activeIndex];

  useEffect(() => {
    if (!attachment || attachment.mimeType !== "application/pdf") return;
    let disposed = false;
    let objectUrl: string | null = null;
    fetch(`/api/files/${attachment.id}`).then(async (response) => {
      if (!response.ok) throw new Error("PDF unavailable");
      const blob = await response.blob();
      if (blob.type !== "application/pdf") throw new Error("Unexpected PDF response");
      objectUrl = URL.createObjectURL(blob);
      if (!disposed) setPdfUrl(objectUrl);
    }).catch(() => { if (!disposed) setState("error"); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment]);

  function select(index: number, focusViewer = true) {
    setZoom(1);
    setState("loading");
    setPdfUrl(null);
    setActiveIndex(index);
    if (focusViewer) requestAnimationFrame(() => viewerHeading.current?.focus());
  }

  function previous() { if (activeIndex > 0) select(activeIndex - 1); }
  function next() { if (activeIndex < attachments.length - 1) select(activeIndex + 1); }

  if (!attachment) return <div className="review-empty" role="status">No files are attached to this publication.</div>;
  const original = `/api/files/${attachment.id}`;
  const isImage = attachment.mimeType.startsWith("image/");

  return <section className="review-workspace" aria-label="Assignment attachments" onKeyDown={(event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("a,button")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
    if (event.key === "ArrowRight") { event.preventDefault(); next(); }
    if (isImage && (event.key === "+" || event.key === "=")) { event.preventDefault(); setZoom((value) => Math.min(3, value + .25)); }
    if (isImage && event.key === "-") { event.preventDefault(); setZoom((value) => Math.max(.5, value - .25)); }
    if (isImage && event.key === "0") { event.preventDefault(); setZoom(1); }
  }}>
    <aside className="attachment-selector" aria-label="Files in publication"><div className="selector-heading"><h2>Files</h2><span>{attachments.length}</span></div><ol>{attachments.map((item, index) => <li key={item.id}><button type="button" className={index === activeIndex ? "active" : ""} aria-current={index === activeIndex ? "true" : undefined} onClick={() => select(index)}><span className="file-number">{index + 1}</span>{item.mimeType.startsWith("image/") ? <img src={`/api/files/${item.id}?variant=thumbnail`} alt="" loading="lazy"/> : <span className="selector-pdf" aria-hidden="true">PDF</span>}<span className="selector-copy"><strong>{item.originalName}</strong></span></button></li>)}</ol></aside>
    <div className="active-review"><header className="review-toolbar"><div><p className="review-position">File {activeIndex + 1} of {attachments.length}</p><h2 ref={viewerHeading} tabIndex={-1}>{attachment.originalName}</h2><p className="file-metadata"><span>{fileType(attachment.mimeType)}</span><span>{fileSize(attachment.sizeBytes)}</span><span>Uploaded <time dateTime={attachment.uploadedAt}>{nairobiTime(attachment.uploadedAt, true)}</time></span><span>Africa/Nairobi</span></p></div><div className="review-actions"><a className="button secondary" href={original} target="_blank" rel="noopener noreferrer">Open original<span className="visually-hidden"> in a new tab</span></a><a className="button secondary" href={`${original}?download=1`} download>Download</a></div></header>
      <div className={`preview-stage ${isImage ? "image-stage" : "pdf-stage"}`} aria-busy={state === "loading"}>{state === "loading" && <div className="preview-state" role="status">Loading preview…</div>}{state === "error" && <div className="preview-state preview-error" role="alert"><strong>Preview unavailable</strong><span>The file may be missing or this browser may not support the preview. Open or download the original instead.</span></div>}{isImage ? <img src={original} alt={`File ${activeIndex + 1}: ${attachment.originalName}`} style={{ transform: `scale(${zoom})` }} onLoad={() => setState("ready")} onError={() => setState("error")}/> : pdfUrl ? <iframe key={attachment.id} src={`${pdfUrl}#toolbar=1&view=FitH`} title={`PDF preview: ${attachment.originalName}`} onLoad={() => setState("ready")}/> : null}</div>
      {!isImage && <p className="pdf-fallback">Inline PDF support varies by browser, especially on mobile. If the preview stays blank or opens externally, use <a href={original} target="_blank" rel="noopener noreferrer">Open original</a> or <a href={`${original}?download=1`} download>Download</a>.</p>}
      <footer className="review-footer"><div className="pager"><button className="button secondary" type="button" onClick={previous} disabled={activeIndex === 0} aria-label="Show previous file">← Previous</button><button className="button secondary" type="button" onClick={next} disabled={activeIndex === attachments.length - 1} aria-label="Show next file">Next →</button></div>{isImage && <div className="zoom-controls" aria-label="Image zoom controls"><button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .25))} disabled={zoom <= .5} aria-label="Zoom out">−</button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .25))} disabled={zoom >= 3} aria-label="Zoom in">+</button><button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>Reset</button></div>}</footer>
    </div>
  </section>;
}
