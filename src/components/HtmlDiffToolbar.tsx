"use client";

import { useId, useState } from "react";

export type HtmlDiffMode = "diff" | "head" | "base";
export interface HtmlDiffToolbarProps {
  mode: HtmlDiffMode;
  onModeChange: (mode: HtmlDiffMode) => void;
  changes: Array<{ id: string; kind: "added" | "removed" | "modified"; summary: string }>;
  activeChange: number;
  onNavigate: (direction: "previous" | "next") => void;
  changedPages?: Array<{ path: string; href: string }>;
  onNavigatePage?: (path: string) => void;
}

/** Place inside the document scroller so controls stay close to the review. */
export default function HtmlDiffToolbar({
  mode, onModeChange, changes, activeChange, onNavigate, changedPages, onNavigatePage,
}: HtmlDiffToolbarProps) {
  const [pagesOpen, setPagesOpen] = useState(false);
  const pagesId = useId();
  const canNavigate = mode === "diff" && changes.length > 0;
  const active = activeChange >= 0 && activeChange < changes.length ? changes[activeChange] : undefined;
  const buttonClass = "min-h-11 rounded px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40";

  return <section aria-label="HTML diff review controls"
    className="sticky bottom-0 z-20 mx-2 mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-primary)] shadow-lg sm:mx-4">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="group" aria-label="HTML preview version" className="flex flex-wrap gap-1">
        {([['diff', 'Inline Diff'], ['head', 'Head (new)'], ['base', 'Base (old)']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value}
            className={`${buttonClass} ${mode === value ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--surface-hover)]"}`}
            onClick={() => onModeChange(value)}>{label}</button>)}
      </div>
      {mode === "diff" && <div role="group" aria-label="Change legend" className="flex items-center gap-2 text-xs">
        <span className="rounded bg-green-100 px-1 text-green-900">added</span>
        <span className="rounded bg-red-100 px-1 text-red-900 line-through">removed</span>
      </div>}
      <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-[var(--text-muted)]">
        {changes.length} changed {changes.length === 1 ? "spot" : "spots"}
        {canNavigate && active && <span> · Change {activeChange + 1} of {changes.length}: {active.summary}</span>}
      </p>
      <div role="group" aria-label="Navigate HTML changes" className="flex gap-1">
        <button type="button" className={buttonClass} disabled={!canNavigate} aria-label="Previous change"
          onClick={() => onNavigate("previous")}><span aria-hidden="true">↑ </span>Prev</button>
        <button type="button" className={buttonClass} disabled={!canNavigate} aria-label="Next change"
          onClick={() => onNavigate("next")}>Next<span aria-hidden="true"> ↓</span></button>
      </div>
      {!!changedPages?.length && <button type="button" className={`${buttonClass} text-[var(--accent)]`}
        aria-expanded={pagesOpen} aria-controls={pagesId} onClick={() => setPagesOpen(open => !open)}>
        All changed pages ({changedPages.length})</button>}
    </div>
    {pagesOpen && !!changedPages?.length && <nav id={pagesId} aria-label="All changed HTML pages"
      className="mt-2 max-h-48 overflow-y-auto border-t border-[var(--border)] pt-2">
      <ul className="space-y-1">
        {changedPages.map(page => <li key={page.path}>
          <a href={page.href} className="block min-h-11 content-center break-all rounded px-2 text-sm text-[var(--accent)] hover:underline"
            onClick={event => {
              if (onNavigatePage && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                event.preventDefault();
                setPagesOpen(false);
                onNavigatePage(page.path);
              }
            }}>{page.path}</a>
        </li>)}
      </ul>
    </nav>}
  </section>;
}
