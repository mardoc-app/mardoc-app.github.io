"use client";

export type HtmlDiffMode = "diff" | "head" | "base";
export interface HtmlDiffToolbarProps {
  mode: HtmlDiffMode;
  onModeChange: (mode: HtmlDiffMode) => void;
  changes: Array<{ id: string; kind: "added" | "removed" | "modified"; summary: string }>;
  activeChange: number;
  onNavigate: (direction: "previous" | "next") => void;
}

/** Place inside the document scroller so controls stay close to the review. */
export default function HtmlDiffToolbar({
  mode, onModeChange, changes, activeChange, onNavigate,
}: HtmlDiffToolbarProps) {
  const canNavigate = mode === "diff" && changes.length > 0;
  const hasActive = canNavigate && activeChange >= 0 && activeChange < changes.length;
  const buttonClass = "min-h-11 sm:min-h-8 rounded px-2 text-xs whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40";

  return <section aria-label="HTML diff review controls"
    className="sticky bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-primary)]">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div role="group" aria-label="HTML preview version" className="flex shrink-0 gap-0.5">
        {([['diff', 'Inline Diff'], ['head', 'Head (new)'], ['base', 'Base (old)']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value}
            className={`${buttonClass} ${mode === value ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--surface-hover)]"}`}
            onClick={() => onModeChange(value)}>{label}</button>)}
      </div>
      {mode === "diff" && <div role="group" aria-label="Change legend" className="hidden sm:flex items-center gap-2 text-xs">
        <span className="rounded bg-green-100 px-1 text-green-900">added</span>
        <span className="rounded bg-red-100 px-1 text-red-900 line-through">removed</span>
      </div>}
      <p role="status" aria-live="polite" aria-atomic="true"
        aria-label={hasActive ? `Change ${activeChange + 1} of ${changes.length}` : `${changes.length} changes`}
        className="sm:ml-auto shrink-0 whitespace-nowrap text-xs text-[var(--text-muted)]">
        {hasActive ? `${activeChange + 1} of ${changes.length}` : `${changes.length} changes`}
      </p>
      <div role="group" aria-label="Navigate HTML changes" className="flex shrink-0 gap-0.5">
        <button type="button" className={buttonClass} disabled={!canNavigate} aria-label="Previous change"
          onClick={() => onNavigate("previous")}><span aria-hidden="true">↑ </span>Prev</button>
        <button type="button" className={buttonClass} disabled={!canNavigate} aria-label="Next change"
          onClick={() => onNavigate("next")}>Next<span aria-hidden="true"> ↓</span></button>
      </div>
    </div>
  </section>;
}
