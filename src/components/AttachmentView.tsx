/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileThumbnail } from "@/components/FileThumbnail";
import { nairobiTime } from "@/lib/time";

export type ReviewAttachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; position: number; uploadedAt: string };
type PreviewState = "loading" | "ready" | "missing" | "session" | "temporary";

function fileType(mimeType: string) { return mimeType === "application/pdf" ? "PDF" : mimeType.split("/")[1]?.toUpperCase() ?? "File"; }
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function AttachmentView({ attachments, context = "portfolio" }: { attachments: ReviewAttachment[]; context?: "portfolio" | "management" }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<PreviewState>("loading");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const viewerHeading = useRef<HTMLHeadingElement>(null);
  const attachment = attachments[activeIndex];

  useEffect(() => {
    if (!attachment) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(`/api/files/${attachment.id}`, { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { setState("session"); return; }
      if (response.status === 404) { setState("missing"); return; }
      if (!response.ok) { setState("temporary"); return; }
      const blob = await response.blob();
      if (attachment.mimeType === "application/pdf" && blob.type !== "application/pdf") { setState("temporary"); return; }
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
      setState("ready");
    }).catch((error) => { if (error.name !== "AbortError") setState("temporary"); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment, retry]);

  function select(index: number, focusViewer = true) {
    setZoom(1); setState("loading"); setPreviewUrl(null); setActiveIndex(index);
    if (focusViewer) requestAnimationFrame(() => viewerHeading.current?.focus());
  }
  function previous() { if (activeIndex > 0) select(activeIndex - 1); }
  function next() { if (activeIndex < attachments.length - 1) select(activeIndex + 1); }

  if (!attachment) return <div className="review-empty" role="status">No files are attached to this publication.</div>;
  const original = `/api/files/${attachment.id}`;
  const isImage = attachment.mimeType.startsWith("image/");
  const backHref = context === "management" ? "/manage" : "/portfolio#assignments";
  const backLabel = context === "management" ? "Back to assignments" : "Back to portfolio";

  return <section className="review-workspace" aria-label="Assignment attachments" onKeyDown={(event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("a,button")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
    if (event.key === "ArrowRight") { event.preventDefault(); next(); }
    if (isImage && (event.key === "+" || event.key === "=")) { event.preventDefault(); setZoom((value) => Math.min(3, value + .25)); }
    if (isImage && event.key === "-") { event.preventDefault(); setZoom((value) => Math.max(.5, value - .25)); }
    if (isImage && event.key === "0") { event.preventDefault(); setZoom(1); }
  }}>
    <aside className="attachment-selector" aria-label="Files in publication"><div className="selector-heading"><h2>Files</h2><span>{attachments.length}</span></div><ol>{attachments.map((item, index) => <li key={item.id}><button type="button" className={index === activeIndex ? "active" : ""} aria-current={index === activeIndex ? "true" : undefined} onClick={() => select(index)}><span className="file-number">{index + 1}</span>{item.mimeType.startsWith("image/") ? <FileThumbnail attachmentId={item.id} alt=""/> : <span className="selector-pdf" aria-hidden="true">PDF</span>}<span className="selector-copy"><strong>{item.originalName}</strong></span></button></li>)}</ol></aside>
    <div className="active-review"><header className="review-toolbar"><div><p className="review-position">File {activeIndex + 1} of {attachments.length}</p><h2 ref={viewerHeading} tabIndex={-1}>{attachment.originalName}</h2><p className="file-metadata"><span>{fileType(attachment.mimeType)}</span><span>{fileSize(attachment.sizeBytes)}</span><span>Uploaded <time dateTime={attachment.uploadedAt}>{nairobiTime(attachment.uploadedAt, true)}</time></span><span>Africa/Nairobi</span></p></div>{state === "ready" && <div className="review-actions"><a className="button secondary" href={original} target="_blank" rel="noopener noreferrer">Open original<span className="visually-hidden"> in a new tab</span></a><a className="button secondary" href={`${original}?download=1`} download>Download</a></div>}</header>
      <div className={`preview-stage ${isImage ? "image-stage" : "pdf-stage"}`} aria-busy={state === "loading"}>
        {state === "loading" && <div className="preview-state" role="status">Loading preview…</div>}
        {state === "missing" && <div className="preview-state preview-error" role="alert"><strong>File not found</strong><span>This file has been removed or is no longer available.</span><Link className="button" href={backHref}>{backLabel}</Link></div>}
        {state === "session" && <div className="preview-state preview-error" role="alert"><strong>Session expired</strong><span>Your access session is no longer valid. Open your current access link again.</span><Link className="button" href="/">Return to access page</Link></div>}
        {state === "temporary" && <div className="preview-state preview-error" role="alert"><strong>Preview temporarily unavailable</strong><span>The file could not be loaded. Check your connection and try again.</span><button className="button" type="button" onClick={() => { setState("loading"); setPreviewUrl(null); setRetry((value) => value + 1); }}>Try again</button></div>}
        {state === "ready" && previewUrl && (isImage ? <img src={previewUrl} alt={`File ${activeIndex + 1}: ${attachment.originalName}`} style={{ transform: `scale(${zoom})` }}/> : <iframe key={previewUrl} src={`${previewUrl}#toolbar=1&view=FitH`} title={`PDF preview: ${attachment.originalName}`}/>)}
      </div>
      {!isImage && state === "ready" && <p className="pdf-fallback">Inline PDF support varies by browser, especially on mobile. If the preview stays blank or opens externally, use <a href={original} target="_blank" rel="noopener noreferrer">Open original</a> or <a href={`${original}?download=1`} download>Download</a>.</p>}
      <footer className="review-footer"><div className="pager"><button className="button secondary" type="button" onClick={previous} disabled={activeIndex === 0} aria-label="Show previous file">← Previous</button><button className="button secondary" type="button" onClick={next} disabled={activeIndex === attachments.length - 1} aria-label="Show next file">Next →</button></div>{isImage && state === "ready" && <div className="zoom-controls" aria-label="Image zoom controls"><button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .25))} disabled={zoom <= .5} aria-label="Zoom out">−</button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .25))} disabled={zoom >= 3} aria-label="Zoom in">+</button><button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>Reset</button></div>}</footer>
    </div>
  </section>;
}
