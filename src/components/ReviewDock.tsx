"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronUp, X } from "lucide-react";

interface ReviewDockProps {
  path: string;
  returnPath?: string;
  onReturn?: () => void;
  controls: ReactNode;
  actions?: ReactNode;
  children: (close: () => void) => ReactNode;
}

/** A nonmodal tools tray: opening it never resizes or remounts the document. */
export default function ReviewDock({ path, returnPath, onReturn, controls, actions, children }: ReviewDockProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); toggle.current?.focus(); };
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const button = "inline-flex min-h-11 sm:min-h-8 shrink-0 items-center justify-center gap-1 rounded px-2 text-xs hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

  return <div className="relative z-30 shrink-0 bg-[var(--surface)] text-[var(--text-primary)]" data-review-dock>
    {open && <div id={panelId} ref={panel} role="region" aria-label="Review tools" tabIndex={-1}
      className="absolute inset-x-0 bottom-full max-h-[min(55dvh,32rem)] overflow-y-auto border border-[var(--border)] bg-[var(--surface)] shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.25)] focus:outline-none">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
        <h2 className="text-sm font-semibold">Review tools</h2>
        <button type="button" onClick={close} className={button} aria-label="Close review tools"><X size={16} /></button>
      </div>
      {children(close)}
    </div>}
    <nav aria-label="Document review" className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-[var(--border)] px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      {onReturn && <button type="button" onClick={onReturn} className={button + " text-[var(--accent)]"}
        title={returnPath ? `Return to ${returnPath}` : "Back to review"} aria-label="Back to review">
        <ArrowLeft size={14} /><span className="hidden lg:inline">Back to review</span>
      </button>}
      <span className="block max-w-[6rem] lg:max-w-[9rem] truncate px-1 font-mono text-xs text-[var(--text-secondary)]" title={path}>{path.split("/").pop()}</span>
      <div className="order-2 flex basis-full min-w-0 flex-wrap items-center gap-1 sm:order-none sm:basis-auto sm:flex-1 sm:min-w-[22rem]">{controls}</div>
      {actions}
      <button ref={toggle} type="button" onClick={() => setOpen(value => !value)} className={button + (open ? " bg-[var(--accent-muted)] text-[var(--accent)]" : "")}
        aria-expanded={open} aria-controls={panelId}>
        <ChevronUp size={14} className={open ? "rotate-180" : ""} /><span>Review tools</span>
      </button>
    </nav>
  </div>;
}
