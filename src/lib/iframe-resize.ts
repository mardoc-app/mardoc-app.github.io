/** Runs inside srcdoc. Keep this function self-contained so it can be serialized. */
export function installIframeResize(win: Window & typeof globalThis = window): () => void {
  const doc = win.document;
  let frame: number | null = null;
  let lastHeight: number | null = null;
  let disposed = false;
  const measure = () => {
    frame = null;
    if (disposed) return;
    const height = doc.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    win.parent.postMessage({ type: "mardoc-iframe-resize", height }, "*");
  };
  const schedule = () => {
    if (!disposed && frame === null) frame = win.requestAnimationFrame(measure);
  };
  const observer = new win.MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true });
  // Resource loads and fonts can change geometry without a DOM mutation.
  doc.addEventListener("load", schedule, true);
  const timers = [win.setTimeout(schedule, 500), win.setTimeout(schedule, 2000)];
  const onLoad = () => { timers.push(win.setTimeout(schedule, 100)); };
  win.addEventListener("load", onLoad);
  doc.fonts?.addEventListener("loadingdone", schedule);
  void doc.fonts?.ready.then(schedule);
  // Preserve the existing delayed checks, but route all work through one frame.
  schedule();
  const dispose = () => {
    disposed = true;
    observer.disconnect();
    if (frame !== null) win.cancelAnimationFrame(frame);
    timers.forEach(timer => win.clearTimeout(timer));
    doc.removeEventListener("load", schedule, true);
    win.removeEventListener("load", onLoad);
    doc.fonts?.removeEventListener("loadingdone", schedule);
  };
  return dispose;
}

export function buildIframeResizeScript(): string {
  return `(${installIframeResize.toString()})();`;
}
