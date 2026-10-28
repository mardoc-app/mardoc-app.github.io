/**
 * A host page that stands in for the VS Code webview (mardoc-vscode
 * `src/extension.ts`, `getWebviewHtml`). MarDoc sits in
 * `<iframe id="mardoc" src="/?embed=true">` and the host posts `init` with
 * `iframe.contentWindow.postMessage(payload, '*')`, the only sender F-16
 * trusts. A sibling iframe (`name="sibling"`) stands in for a hostile
 * document next to MarDoc.
 *
 * Simulated, not real: the host is a Playwright route on the app's own
 * origin; the real webview has a `vscode-webview://` origin.
 */
import type { Page, FrameLocator } from "@playwright/test";

export const EMBED_HOST_PATH = "/__host.html";

const HOST_HTML = `<!doctype html>
<html><head><title>VS Code webview stand-in</title>
<style>html,body{margin:0;height:100%}iframe{border:0}</style></head>
<body>
<iframe id="mardoc" src="/?embed=true" style="width:100%;height:85vh"></iframe>
<iframe id="sibling" name="sibling" srcdoc="<!doctype html><p>sibling</p>" style="width:100%;height:10vh"></iframe>
<script>
  window.__mardocReady = 0;
  var mardoc = document.getElementById("mardoc");
  window.addEventListener("message", function (e) {
    if (e.source === mardoc.contentWindow && e.data && e.data.type === "ready") window.__mardocReady++;
  });
  window.sendInit = function (payload) { mardoc.contentWindow.postMessage(payload, "*"); };
</script>
</body></html>`;

/**
 * Open the host page and wait until MarDoc has posted `ready`, so its
 * `init` listener is live. Returns a locator for the MarDoc frame.
 */
export async function openEmbedHost(page: Page): Promise<FrameLocator> {
  await page.route(`**${EMBED_HOST_PATH}`, route =>
    route.fulfill({ contentType: "text/html", body: HOST_HTML }));
  await page.goto(EMBED_HOST_PATH);
  await page.waitForFunction(() => (window as any).__mardocReady > 0, null, { timeout: 20_000 });
  return page.frameLocator("#mardoc");
}

/** Post a message to MarDoc from its parent, as the VS Code webview does. */
export async function sendInitFromHost(page: Page, payload: unknown): Promise<void> {
  await page.evaluate(p => (window as any).sendInit(p), payload);
}
