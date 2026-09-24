"use client";

import { ArrowLeft } from "lucide-react";

/** A persistent return destination while exploring a linked document. */
export default function ReviewReturnBar({ path, onReturn }: { path?: string; onReturn: () => void }) {
  return <nav aria-label="Return to review" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] bg-[var(--accent-muted)] px-4 py-2">
    <button type="button" onClick={onReturn}
      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
      <ArrowLeft size={18} aria-hidden="true" />
      Back to review
    </button>
    {path && <div className="min-w-0 flex-1 basis-40 text-xs text-[var(--text-secondary)]">
      <span>Return to</span>
      <div className="truncate text-sm font-medium text-[var(--text-primary)]" title={path}>{path.split("/").pop()}</div>
    </div>}
  </nav>;
}
