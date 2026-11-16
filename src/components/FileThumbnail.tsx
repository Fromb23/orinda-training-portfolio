/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";

type ThumbnailState = "loading" | "thumbnail" | "original" | "missing" | "session" | "error";

export function FileThumbnail({ attachmentId, alt, className = "" }: { attachmentId: string; alt: string; className?: string }) {
  const [state, setState] = useState<ThumbnailState>("loading");
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    async function load() {
      try {
        let response = await fetch(`/api/files/${attachmentId}?variant=thumbnail`, { signal: controller.signal });
        let nextState: ThumbnailState = "thumbnail";
        if (response.status === 404) {
          response = await fetch(`/api/files/${attachmentId}`, { signal: controller.signal });
          nextState = "original";
        }
        if (response.status === 401) { setState("session"); return; }
        if (response.status === 404) { setState("missing"); return; }
        if (!response.ok) { setState("error"); return; }
        objectUrl = URL.createObjectURL(await response.blob());
        setSource(objectUrl);
        setState(nextState);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState("error");
      }
    }
    load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachmentId]);

  return <span className={`file-thumbnail ${className}`} data-state={state}>
    {source ? <img src={source} alt={alt}/> : <span className="thumbnail-placeholder" aria-label={alt}>{state === "loading" ? "Loading" : state === "session" ? "Session expired" : state === "missing" ? "File not found" : "Preview unavailable"}</span>}
    {state === "original" && <span className="thumbnail-fallback">Original preview</span>}
  </span>;
}
