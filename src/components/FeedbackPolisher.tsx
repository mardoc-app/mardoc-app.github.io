"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { getFeedbackConnection, isFeedbackAIEnabled, polishFeedback, type PolishStyle } from "@/lib/feedback-ai";
import FeedbackAISettings from "./FeedbackAISettings";

interface Rewrite { original: string; text: string }
export default function FeedbackPolisher({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<PolishStyle>("clearer");
  const [rewrite, setRewrite] = useState<Rewrite | null>(null), [error, setError] = useState("");
  const [connection, setConnection] = useState(getFeedbackConnection);
  const [enabled, setEnabled] = useState(isFeedbackAIEnabled);
  const request = useRef<AbortController | null>(null);
  const currentValue = useRef(value); currentValue.current = value;
  useEffect(() => {
    const update = () => {
      request.current?.abort(); request.current = null;
      setBusy(false); setRewrite(null); setError(""); setConnection(getFeedbackConnection()); setEnabled(isFeedbackAIEnabled()); if (!isFeedbackAIEnabled()) setOpen(false);
    };
    window.addEventListener("mardoc-feedback-ai-change", update);
    return () => { request.current?.abort(); window.removeEventListener("mardoc-feedback-ai-change", update); };
  }, []);
  // A response for an old draft must never overwrite subsequent typing.
  useEffect(() => { request.current?.abort(); setBusy(false); setRewrite(null); }, [value]);
  const close = () => { request.current?.abort(); request.current = null; setBusy(false); setOpen(false); setRewrite(null); setError(""); };
  const generate = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const original = value;
    setBusy(true); setError(""); setRewrite(null);
    try {
      const text = await polishFeedback(original, style, connection, controller.signal);
      if (!controller.signal.aborted && currentValue.current === original) setRewrite({ original, text });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not polish feedback.");
    } finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  };
  const button = "min-h-9 rounded border border-[var(--border)] px-2 text-xs disabled:opacity-40";
  if (!enabled) return null;
  return <div className="mt-2">
    <button type="button" disabled={!value.trim()} onClick={() => open ? close() : setOpen(true)}
      aria-expanded={open} className="inline-flex min-h-9 items-center gap-1 text-xs text-[var(--accent)] disabled:opacity-40">
      <Sparkles size={12} />Polish feedback
    </button>
    {open && <section aria-label="Polish feedback" className="mt-1 space-y-3 rounded border border-[var(--border)] bg-[var(--surface)] p-3"
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      {!connection.endpoint || !connection.model ? <FeedbackAISettings /> : <>
        <p className="break-all text-xs text-[var(--text-muted)]">Only this draft will be sent to {new URL(connection.endpoint).origin}, using {connection.model}.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs">Rewrite style <select value={style} disabled={busy} onChange={e => { setStyle(e.target.value as PolishStyle); setRewrite(null); }}
            className="rounded border border-[var(--border)] bg-[var(--surface)] p-1">
            <option value="clearer">Clearer</option><option value="concise">More concise</option><option value="constructive">More constructive</option>
          </select></label>
          <button type="button" disabled={busy || !value.trim() || value.length > 10_000} onClick={() => void generate()} className={button}>
            {busy ? "Rewriting…" : "Generate rewrite"}
          </button>
          <button type="button" onClick={close} className={button}>Cancel polishing</button>
        </div>
        {value.length > 10_000 && <p className="text-xs">Shorten this draft to 10,000 characters to polish it.</p>}
        {rewrite && <>
          <div><h4 className="text-xs font-semibold">Original</h4><p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-sm">{rewrite.original}</p></div>
          <div><h4 className="text-xs font-semibold">Proposed rewrite</h4><p className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">{rewrite.text}</p></div>
          <button type="button" disabled={value !== rewrite.original} className={button + " text-[var(--accent)]"}
            onClick={() => { if (currentValue.current === rewrite.original) { onChange(rewrite.text); close(); } }}>Use rewrite</button>
        </>}
        <details><summary className="cursor-pointer text-xs">AI connection settings</summary><div className="mt-2"><FeedbackAISettings /></div></details>
      </>}
      {error && <p role="alert" className="text-xs">{error}</p>}
      {busy && <p role="status" className="text-xs">Preparing a rewrite. Your draft is unchanged.</p>}
      {(!connection.endpoint || !connection.model) && <button type="button" onClick={close} className={button}>Cancel polishing</button>}
    </section>}
  </div>;
}
