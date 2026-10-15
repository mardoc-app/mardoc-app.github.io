"use client";
import { useEffect, useState } from "react";
import { clearFeedbackConnection, getFeedbackConnection, saveFeedbackConnection } from "@/lib/feedback-ai";

export default function FeedbackAISettings() {
  const [connection, setConnection] = useState(getFeedbackConnection);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => setConnection(getFeedbackConnection());
    window.addEventListener("mardoc-feedback-ai-change", update);
    return () => window.removeEventListener("mardoc-feedback-ai-change", update);
  }, []);
  const field = "mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]";
  return <section aria-label="AI feedback connection" className="space-y-3">
    <h3 className="text-sm font-semibold">Feedback polishing</h3>
    <p className="text-xs text-[var(--text-muted)]">Use a browser-accessible, OpenAI-compatible chat completions endpoint. Only feedback you explicitly choose to rewrite is sent there.</p>
    <label className="block text-xs">Chat completions URL
      <input type="url" value={connection.endpoint} onChange={e => setConnection({ ...connection, endpoint: e.target.value })}
        placeholder="https://your-provider.example/v1/chat/completions" className={field} />
    </label>
    <label className="block text-xs">Model
      <input value={connection.model} onChange={e => setConnection({ ...connection, model: e.target.value })} className={field} />
    </label>
    <label className="block text-xs">API key (optional for local endpoints)
      <input type="password" autoComplete="off" value={connection.apiKey} onChange={e => setConnection({ ...connection, apiKey: e.target.value })} className={field} />
    </label>
    <p className="text-xs text-[var(--text-muted)]">The URL and model are remembered in this browser. The key stays in memory and must be entered again after a reload.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded bg-[var(--accent)] px-3 text-xs text-white" onClick={() => {
        try { saveFeedbackConnection(connection); setConnection(getFeedbackConnection()); setNotice("AI connection saved. No request has been sent."); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Could not save connection."); }
      }}>Save AI connection</button>
      <button type="button" className="min-h-11 rounded border border-[var(--border)] px-3 text-xs" onClick={() => {
        clearFeedbackConnection(); setConnection(getFeedbackConnection()); setNotice("AI connection cleared.");
      }}>Clear AI connection</button>
    </div>
    {notice && <p role="status" className="text-xs">{notice}</p>}
  </section>;
}
