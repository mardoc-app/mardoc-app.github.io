"use client";

import { useEffect, useRef, useState } from "react";
import { fetchReviewImage } from "@/lib/github-api";
import { imageMimeType } from "@/lib/file-types";
import SourceDiffViewer, { type SourceDiffViewerProps } from "./SourceDiffViewer";
import ReviewDock from "./ReviewDock";
import ReviewOnGitHub from "./ReviewOnGitHub";

type Preview = { identity: string; url?: string; error?: string };

/** SVG stays in an img resource context, never an inline DOM or iframe document. */
export default function ImageDiffViewer(props: SourceDiffViewerProps) {
  const { file, repoFullName, prNumber, returnPath, onReturn, reviewDetails } = props;
  const [revision, setRevision] = useState<"head" | "base">(file.status === "deleted" ? "base" : "head");
  const [source, setSource] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<Preview>({ identity: "" });
  const viewport = useRef<HTMLDivElement>(null);
  const side = file.status === "added" ? "head" : file.status === "deleted" ? "base" : revision;
  const path = side === "base" ? file.basePath || file.path : file.path;
  const repo = (side === "base" ? file.baseRepo : file.headRepo) || repoFullName;
  const ref = side === "base" ? file.baseRef : file.headRef;
  const identity = JSON.stringify([repo, ref, path, retry]);
  useEffect(() => {
    if (source) return;
    const controller = new AbortController();
    let url: string | undefined;
    setPreview({ identity }); setSize(null);
    void (async () => {
      try {
        const mime = imageMimeType(path);
        if (!ref || !mime) throw new Error("This revision is unavailable for image preview. Review it on GitHub.");
        const blob = await fetchReviewImage(repo, path, ref, mime, controller.signal);
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview({ identity, url });
      } catch {
        if (!controller.signal.aborted) setPreview({ identity, error: "Could not load this image. It may be unavailable or exceed the 10 MB preview limit. Try again or review it on GitHub." });
      }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [identity, repo, ref, path, source]);
  useEffect(() => { setZoom(null); if (viewport.current) viewport.current.scrollTo?.(0, 0); }, [identity]);
  const button = "min-h-11 sm:min-h-8 rounded px-2 text-xs whitespace-nowrap disabled:opacity-40 hover:bg-[var(--surface-hover)]";
  const viewControls = <>
    <button type="button" className={button} aria-pressed={!source} onClick={() => { setPreview({ identity: "" }); setSource(false); }}>Image preview</button>
    {file.path.toLowerCase().endsWith(".svg") && <button type="button" className={button} aria-pressed={source} onClick={() => setSource(true)}>Source Diff</button>}
  </>;
  if (source) return <SourceDiffViewer {...props} viewControls={viewControls} />;
  const current = preview.identity === identity ? preview : { identity };
  return <div className="flex h-full min-h-0 min-w-0 flex-col">
    <div ref={viewport} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--surface-secondary)]" aria-label="Image canvas" aria-busy={!current.url && !current.error}>
      {current.error ? <div role="alert" className="p-6 text-sm"><p>{current.error}</p>
        <button type="button" className={button} onClick={() => setRetry(value => value + 1)}>Retry image</button></div>
        : !current.url ? <p role="status" className="p-6 text-sm">Loading image…</p>
        : <div className={zoom === null ? "flex h-full w-full items-center justify-center p-4" : "w-max min-w-full p-4"}>
          {/* Image resource loading disables SVG scripts and external resource loading. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={current.url} src={current.url} alt={`${side === "head" ? "Head (new)" : "Base (old)"}: ${path}`}
            className="block bg-white" style={zoom === null ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" } : { width: size ? size.width * zoom : undefined, maxWidth: "none", height: "auto" }}
            onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setPreview({ identity, error: "This file could not be decoded as an image. Review it on GitHub." })} />
        </div>}
    </div>
    <ReviewDock path={file.path} returnPath={returnPath} onReturn={onReturn} controls={<>
      {viewControls}
      <button type="button" className={button} aria-pressed={side === "head"} disabled={file.status === "deleted"} onClick={() => setRevision("head")}>Head (new)</button>
      <button type="button" className={button} aria-pressed={side === "base"} disabled={file.status === "added"} onClick={() => setRevision("base")}>Base (old)</button>
    </>} actions={<ReviewOnGitHub repo={repoFullName} pr={prNumber} path={file.path} />}>
      {close => <>
        <p className="break-all px-4 py-3 font-mono text-xs">{path} · {file.changeType || file.status}{size ? ` · ${size.width} × ${size.height}` : ""}</p>
        <div className="flex flex-wrap items-center gap-1 px-4 pb-3" aria-label="Image zoom">
          <button type="button" className={button} aria-pressed={zoom === null} onClick={() => setZoom(null)}>Fit to view</button>
          <button type="button" className={button} aria-pressed={zoom === 1} onClick={() => setZoom(1)}>Actual size</button>
          <label className="text-xs">Zoom <select aria-label="Image zoom level" className="min-h-11 rounded bg-[var(--surface)] px-2" value={zoom === null ? "fit" : String(zoom)} onChange={event => setZoom(event.target.value === "fit" ? null : Number(event.target.value))}>
            <option value="fit">Fit</option>{[0.25, 0.5, 1, 1.5, 2, 3, 4].map(value => <option key={value} value={value}>{value * 100}%</option>)}
          </select></label>
        </div>
        {reviewDetails?.(close)}
      </>}
    </ReviewDock>
  </div>;
}
