/** One visible-tab refresh at a time; dispose also fences in-flight results. */
export function createBackgroundRefresh(
  refresh: (isActive: () => boolean) => Promise<void>,
  visible = () => document.visibilityState !== "hidden",
) {
  let disposed = false;
  let pending = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const run = async () => {
    if (disposed || pending || !visible()) return;
    pending = true;
    try { await refresh(() => !disposed); }
    catch { /* Refresh is best effort; the caller handles API errors. */ }
    finally { pending = false; }
  };
  const interval = setInterval(() => { void run(); }, 30_000);
  const onVisible = () => { void run(); };
  document.addEventListener("visibilitychange", onVisible);
  return {
    refresh: run,
    afterWrite() {
      if (disposed) return;
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      for (const delay of [1500, 4000, 8000]) {
        const timer = setTimeout(() => { timers.delete(timer); void run(); }, delay);
        timers.add(timer);
      }
    },
    dispose() {
      disposed = true;
      clearInterval(interval);
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
