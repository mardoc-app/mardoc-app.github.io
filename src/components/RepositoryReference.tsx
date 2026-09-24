"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchFileContent, loadAuthenticatedImages, rewriteImageUrls } from "@/lib/github-api";
import { rewriteHtmlAssetUrls } from "@/lib/html-assets";
import { isHtmlFile, isDocumentFile } from "@/lib/file-types";
import { blockToHtml } from "@/lib/diff-blocks";
import { resolveReviewLink, scrollToDocumentAnchor } from "@/lib/review-links";
import { useHtmlReviewLinks } from "@/lib/use-html-review-links";
import { buildFileHash } from "@/lib/hash-router";
import { useApp } from "@/lib/app-context";
import ReviewReturnBar from "./ReviewReturnBar";
import { openExternal } from "@/lib/open-external";

export interface ReferenceTarget { repo: string; ref: string; path: string; anchor: string; label: string }

/** Repository context only: no editing, suggestion or PR-comment controls. */
export default function RepositoryReference({target, returnPath, onClose}: {target: ReferenceTarget; returnPath?: string; onClose: () => void}) {
  const { isEmbedded } = useApp();
  const [current, setCurrent] = useState(target);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const iframe = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setContent(null); setError("");
    if (!isDocumentFile(current.path)) { setError("This link is not a supported Markdown or HTML document."); return; }
    void fetchFileContent(current.repo, current.path, current.ref, controller.signal).then(text => {
      if (!cancelled) setContent(text);
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reference."); });
    return () => { cancelled = true; controller.abort(); };
  }, [current]);
  const navigate = (href: string) => {
    const link = resolveReviewLink(current.path, href);
    if (link.type === "external") openExternal(link.href, isEmbedded);
    if (link.type === "document") setCurrent({...current, path:link.path, anchor:link.anchor, label:"Repository reference"});
  };
  const onLoad = useHtmlReviewLinks(iframe, navigate, href => {
    const link = resolveReviewLink(current.path, href);
    return link.type === "document" ? new URL(buildFileHash(current.repo, current.ref, link.path), window.location.href).href : undefined;
  });
  const srcdoc = useMemo(() => {
    if (content === null) return "";
    if (isHtmlFile(current.path)) return rewriteHtmlAssetUrls(content, current.repo, current.ref, current.path);
    return '<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;margin:32px;overflow-wrap:anywhere}img{max-width:100%}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}</style>'
      + rewriteImageUrls(blockToHtml(content), current.repo, current.ref, current.path);
  }, [content, current]);
  return <section className="absolute inset-0 z-20 bg-[var(--bg-primary)] flex flex-col" aria-label="Repository reference">
    <ReviewReturnBar path={returnPath} onReturn={onClose}/>
    <div className="shrink-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
      <span className="text-xs text-[var(--text-secondary)]">{current.label} · Read-only · {current.ref.slice(0,7)}</span>
      <div className="truncate text-sm font-mono" title={current.path}>{current.path}</div>
    </div>
    {error ? <p role="alert" className="p-4">{error}</p> : content === null ? <p role="status" className="p-4">Loading reference…</p> :
      <iframe title="Read-only repository document" className="flex-1 w-full border-0 bg-white" ref={iframe} srcDoc={srcdoc}
        sandbox="allow-scripts allow-same-origin" onLoad={() => {
          onLoad();
          const doc = iframe.current?.contentDocument;
          if (doc) { void loadAuthenticatedImages(doc.body); scrollToDocumentAnchor(doc, current.anchor); }
        }}/>
    }
  </section>;
}
