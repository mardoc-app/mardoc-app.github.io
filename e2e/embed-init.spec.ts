/**
 * F-16 (T-15): the embed `init` message is applied only in embed mode
 * and only when it comes from MarDoc's own parent window.
 *
 * The host page mirrors the VS Code webview (mardoc-vscode `src/extension.ts`):
 * MarDoc sits in `<iframe id="mardoc" src="/?embed=true">` and the host posts
 * with `iframe.contentWindow.postMessage(payload, '*')`. A sibling iframe
 * stands in for a hostile document next to MarDoc.
 *
 * Simulated, not real: the host page is a Playwright route on the app's own
 * origin (the real webview is a `vscode-webview://` origin), and GitHub is a
 * mocked `api.github.com`. The credential is observed through the mocked
 * GitHub calls (the `authorization` header each request carries) and the UI,
 * never through storage: `init` tokens are not stored. The real extension is
 * checked by the owner (WP-2 increment 3).
 */
import { test, expect, type Page, type FrameLocator } from "@playwright/test";
import { waitForHydration } from "./fixtures/helpers";

const TRUSTED_TOKEN = "e2e-trusted-init-token";
const ATTACKER_TOKEN = "e2e-attacker-init-token";
const PWNED = "PWNED-by-untrusted-init";

/** A forged init: it would swap the credential, load a repo and show a file. */
const forgedInit = {
  type: "init",
  token: ATTACKER_TOKEN,
  owner: "attacker",
  repo: "exfil",
  branch: "main",
  fileName: "pwned.md",
  filePath: "pwned.md",
  fileContent: `# ${PWNED}\n`,
};

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

const POPUP_HTML = (payload: unknown) => `<!doctype html><title>popup</title>
<script>
  window.opener.postMessage(${JSON.stringify(payload)}, "*");
  document.title = "posted";
</script>`;

/** Mock GitHub and record the authorization header of every call. */
async function mockGitHub(page: Page): Promise<string[]> {
  const auth: string[] = [];
  const sha = "a".repeat(40);
  await page.route("https://raw.githubusercontent.com/**", route => route.abort());
  await page.route("https://api.github.com/**", async route => {
    auth.push(route.request().headers()["authorization"] ?? "");
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data: unknown = {};
    if (path.includes("/git/trees/")) data = { tree: [] };
    else if (path.includes("/commits/")) data = { sha };
    else if (path.endsWith("/branches") || path.endsWith("/pulls")) data = [];
    else if (path === "/graphql") data = { data: {} };
    else if (path === "/user") data = { login: "e2e" };
    else data = { default_branch: "main" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  return auth;
}

async function serveHost(page: Page) {
  await page.route("**/__host.html", route =>
    route.fulfill({ contentType: "text/html", body: HOST_HTML }));
}

/** Open the host page and wait until MarDoc has posted `ready` (its listener is live). */
async function openHost(page: Page): Promise<FrameLocator> {
  await serveHost(page);
  await page.goto("/__host.html");
  await page.waitForFunction(() => (window as any).__mardocReady > 0, null, { timeout: 20_000 });
  return page.frameLocator("#mardoc");
}

async function sendFromHost(page: Page, payload: unknown) {
  await page.evaluate(p => (window as any).sendInit(p), payload);
}

/** Give a posted message time to be handled before asserting nothing changed. */
async function settle(page: Page) {
  await page.waitForTimeout(750);
}

function usedToken(auth: string[], token: string) {
  return auth.filter(h => h.includes(token)).length;
}

/**
 * Positive control: a trusted init from the host still applies afterwards,
 * which shows the listener was live when the forged message arrived.
 */
async function expectTrustedInitStillApplies(page: Page, mardoc: FrameLocator) {
  const control = `control-${Date.now()}`;
  await sendFromHost(page, {
    type: "init",
    fileName: "control.md",
    filePath: "control.md",
    fileContent: `# Control ${control}\n`,
  });
  await expect(mardoc.locator(".ProseMirror").getByText(control)).toBeVisible({ timeout: 10_000 });
}

test.describe("Embed init trust (F-16, T-15)", () => {
  test("f16_init_from_parent_in_embed_mode_is_applied", async ({ page }) => {
    const auth = await mockGitHub(page);
    const mardoc = await openHost(page);
    const sentinel = `trusted-${Date.now()}`;
    await sendFromHost(page, {
      type: "init",
      token: TRUSTED_TOKEN,
      owner: "acme",
      repo: "docs",
      branch: "main",
      fileName: "trusted.md",
      filePath: "trusted.md",
      fileContent: `# Trusted ${sentinel}\n`,
    });
    // The file shows, and GitHub is called with the token the host sent.
    await expect(mardoc.locator(".ProseMirror").getByText(sentinel)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => usedToken(auth, TRUSTED_TOKEN), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test("f16_init_from_sibling_iframe_is_ignored", async ({ page }) => {
    const auth = await mockGitHub(page);
    const mardoc = await openHost(page);
    const sibling = page.frame({ name: "sibling" });
    expect(sibling).not.toBeNull();
    // The sibling reaches MarDoc through the shared parent (MarDoc is frames[0]).
    await sibling!.evaluate(p => { (window.parent.frames[0] as Window).postMessage(p, "*"); }, forgedInit);
    await settle(page);

    // Still the empty embed welcome screen: no file, no credential.
    await expect(mardoc.getByText(/Select a pull request from the sidebar/)).toBeVisible();
    await expect(mardoc.getByText(PWNED)).toHaveCount(0);
    expect(auth).toEqual([]);

    await expectTrustedInitStillApplies(page, mardoc);
    await expect(mardoc.getByText(PWNED)).toHaveCount(0);
    expect(usedToken(auth, ATTACKER_TOKEN)).toBe(0);
  });

  test("f16_init_from_rendered_document_is_ignored", async ({ page }) => {
    const auth = await mockGitHub(page);
    const mardoc = await openHost(page);
    // The host opens a local HTML file whose script attacks MarDoc through
    // window.parent once HtmlViewer renders it (sandbox allow-scripts
    // allow-same-origin).
    const evil = `<!doctype html><html><body><h1>Untrusted report</h1>
<script>
  window.parent.postMessage(${JSON.stringify(forgedInit)}, "*");
  document.body.setAttribute("data-attacked", "yes");
</script></body></html>`;
    await sendFromHost(page, {
      type: "init",
      fileName: "report.html",
      filePath: "report.html",
      fileContent: evil,
    });
    const rendered = mardoc.frameLocator('iframe[title="report.html"]');
    await expect(rendered.getByRole("heading", { name: "Untrusted report" })).toBeVisible({ timeout: 10_000 });
    await expect(rendered.locator('body[data-attacked="yes"]')).toHaveCount(1);
    await settle(page);

    // The HTML document is still shown, the forged file is not, and no
    // GitHub call carries the attacker's token (none is made at all).
    await expect(mardoc.locator('iframe[title="report.html"]')).toBeVisible();
    await expect(mardoc.getByText(PWNED)).toHaveCount(0);
    expect(auth).toEqual([]);

    await expectTrustedInitStillApplies(page, mardoc);
    await expect(mardoc.getByText(PWNED)).toHaveCount(0);
    expect(usedToken(auth, ATTACKER_TOKEN)).toBe(0);
  });

  test("f16_init_outside_embed_mode_is_ignored", async ({ page }) => {
    const auth = await mockGitHub(page);
    // Context-level route: page.route does not cover the opened window.
    await page.context().route("**/__popup.html", route =>
      route.fulfill({ contentType: "text/html", body: POPUP_HTML(forgedInit) }));
    await page.goto("/");
    await waitForHydration(page);

    // 1. The top-level page posts init to itself (parent === self).
    await page.evaluate(p => window.postMessage(p, "*"), forgedInit);
    // 2. A window it opened posts init to its opener.
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.evaluate(() => { window.open("/__popup.html", "_blank"); }),
    ]);
    await expect(popup).toHaveTitle("posted");
    await settle(page);

    // Still demo mode, and embed mode was not turned on: the non-embed demo
    // welcome and its Connect GitHub button remain.
    await expect(page.getByText(/You're in demo mode with sample data/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
    await expect(page.getByText(PWNED)).toHaveCount(0);
    expect(auth).toEqual([]);
  });
});
