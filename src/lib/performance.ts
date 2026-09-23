import { getItem } from "./safe-storage";

export type PerformanceOperation = "document-fetch" | "pr-manifest" | "pr-comments" | "mermaid-prepare" | "mermaid-render";

/** Opt-in, bounded User Timing entries. No URLs, paths, content, or telemetry. */
export async function measureOperation<T>(name: PerformanceOperation, work: () => Promise<T>): Promise<T> {
  if (getItem("mardoc_profile") !== "1" || typeof performance === "undefined") return work();
  const start = performance.now();
  try { return await work(); }
  finally {
    try {
      const label = `mardoc:${name}`;
      if (performance.getEntriesByName(label, "measure").length >= 50) performance.clearMeasures(label);
      performance.measure(label, { start, end: performance.now() });
    } catch { /* Diagnostics must never change document behavior. */ }
  }
}
