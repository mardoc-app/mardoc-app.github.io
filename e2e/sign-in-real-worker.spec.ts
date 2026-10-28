/**
 * T-32 (WP-8): the real Auth Worker module under `wrangler dev`, behind the
 * development wrapper `dev/local-auth/worker.ts` with `STUB_GITHUB=1`. The
 * app (the built `out/`) and the Worker share one origin, as on mardoc.app.
 *
 * Real here: the product Worker code, the browser's handling of the
 * `__Secure-` attempt cookie on http://localhost, the pop-up, the real
 * callback page with its CSP, and `postMessage` back to the tab.
 * Simulated: GitHub. The consent screen is the wrapper's stub authorize
 * route (it approves at once, same origin, so the Lax cookie's cross-site
 * top-level case is not exercised), the code exchange and revoke are the
 * wrapper's in-process stub, and the browser's `api.github.com` calls are
 * Playwright routes below. Nothing reaches github.com: it is blocked.
 *
 * Run: `REAL_WORKER=1 npx playwright test` (the config starts the harness),
 * or start `STUB_GITHUB=1 npm run dev:auth` yourself first.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { waitForHydration } from "./fixtures/helpers";

const RETURN_TEXT = "Return to MarDoc and try again.";
const INSTALLED_TEXT = "MarDoc is installed. Go back to the MarDoc tab and press Refresh.";
const STATIC_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const COOKIE_PREFIX = "__Secure-mardoc_auth_";
const STUB_TOKEN = /^ghu_stub[0-9a-f]{32}$/;

type Seen = { path: string; status: number; headers: Record<string, string> };

/**
 * Records every /api/auth/* response the context sees (all headers, Set-Cookie
 * included; no bodies). `settle()` waits for the header reads to finish.
 */
function recordAuthResponses(context: BrowserContext) {
  const pending: Promise<Seen | null>[] = [];
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/auth/")) return;
    pending.push(
      response
        .allHeaders()
        .then((headers) => ({ path: url.pathname, status: response.status(), headers }))
        .catch(() => null),
    );
  });
  return { settle: async () => (await Promise.all(pending)).filter((s): s is Seen => s !== null) };
}

/** GitHub as the tab sees it: github.com blocked, api.github.com answered here. */
async function mockGitHubForTab(context: BrowserContext) {
  const calls: { path: string; authorization: string | null }[] = [];
  await context.route("https://github.com/**", (route) => route.abort("blockedbyclient"));
  await context.route("https://raw.githubusercontent.com/**", (route) => route.abort("blockedbyclient"));
  await context.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push({ path: url.pathname, authorization: (await route.request().allHeaders())["authorization"] ?? null });
    const body =
      url.pathname === "/user"
        ? { login: "octo", id: 1, type: "User" }
        : url.pathname === "/user/installations"
          ? { total_count: 0, installations: [] }
          : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return calls;
}

/** A same-origin link click: what the Worker's /login checks require (Sec-Fetch-Site, -Dest). */
async function followLink(page: Page, href: string) {
  await page.evaluate((h) => {
    const a = document.createElement("a");
    a.id = "e2e-link";
    a.href = h;
    a.textContent = "go";
    a.style.cssText = "position:fixed;left:0;bottom:0;z-index:2147483647";
    document.body.appendChild(a);
  }, href);
  await page.locator("#e2e-link").click();
}

type Session = { status: string; sessionKey: string | null; lastError: string | null };
const session = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mardocAuth: { getSession(): Session } }).__mardocAuth.getSession());

test.beforeAll(async ({ request }) => {
  // Refuse to run against a harness that would send the browser to real GitHub.
  const probe = await request.get("/api/auth/__stub-github/authorize");
  expect(probe.status(), "the harness must run with STUB_GITHUB=1").toBe(400);
  expect(await probe.text()).toContain("stub:");
});

test("t32_real_worker_callback_posts_to_tab", async ({ page, context }) => {
  // T-32, F-14, F-23, F-61, NF-19, I-10
  const recorder = recordAuthResponses(context);
  const urls: string[] = [];
  context.on("request", (r) => urls.push(r.url()));
  const tabCalls = await mockGitHubForTab(context);
  await page.addInitScript(() => {
    (window as unknown as { __MARDOC_E2E__: boolean }).__MARDOC_E2E__ = true;
  });
  await page.goto("/");
  await waitForHydration(page);
  await page.getByTitle("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "GitHub Connection" }).click();

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with GitHub" }).click();
  const popup = await popupPromise;

  await expect(page.getByText("Signed in with GitHub as octo")).toBeVisible({ timeout: 15_000 });
  expect(await session(page)).toMatchObject({ status: "signed-in", sessionKey: "sign-in:octo", lastError: null });
  await expect.poll(() => popup.isClosed(), { timeout: 5_000 }).toBe(true);

  const seen = await recorder.settle();
  // The real /login set the __Secure- attempt cookie and sent the pop-up to the (stub) consent screen.
  const login = seen.find((s) => s.path === "/api/auth/login");
  expect(login?.status).toBe(302);
  expect(login?.headers["set-cookie"]).toMatch(
    new RegExp(`^${COOKIE_PREFIX}[A-Za-z0-9_-]{22}=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`),
  );
  expect(login?.headers["location"]).toMatch(/\/api\/auth\/__stub-github\/authorize\?client_id=/);
  expect(login?.headers["location"]).toContain("code_challenge_method=S256");

  // The real callback found the cookie (else: state_mismatch), exchanged the
  // code with the PKCE verifier, cleared the cookie and served its nonce CSP.
  const callback = seen.find((s) => s.path === "/api/auth/callback");
  expect(callback?.status).toBe(200);
  expect(callback?.headers["content-security-policy"]).toMatch(
    /^default-src 'none'; script-src 'nonce-[A-Za-z0-9_-]{22}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/,
  );
  expect(callback?.headers["set-cookie"]).toMatch(new RegExp(`^${COOKIE_PREFIX}[A-Za-z0-9_-]{22}=; .*Max-Age=0$`));
  expect(callback?.headers["cache-control"]).toBe("no-store");
  for (const s of seen) expect(Object.keys(s.headers).some((k) => k.startsWith("access-control-"))).toBe(false);
  const cookies = await context.cookies();
  expect(cookies.filter((c) => c.name.startsWith(COOKIE_PREFIX))).toEqual([]);

  // The token the stub issued reached the tab, which used it for /user.
  const userCall = tabCalls.find((c) => c.path === "/user");
  const token = userCall?.authorization?.replace(/^token /, "") ?? "";
  expect(token).toMatch(STUB_TOKEN);

  // I-10, NF-11: no web storage, readable cookie, URL or entry name holds it.
  const traces = await page.evaluate(() => {
    const parts = [document.cookie, location.href, ...performance.getEntries().map((e) => e.name)];
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) parts.push(store.key(i)!, store.getItem(store.key(i)!) ?? "");
    }
    return parts.join("\n");
  });
  expect(traces).not.toContain(token);
  // NF-11 with the real Worker: no URL the browser requested (login, the stub
  // consent hop, callback with code and state) and no Location header carries it.
  expect(urls.some((u) => u.includes("/api/auth/callback?code="))).toBe(true);
  for (const u of urls) expect(u).not.toContain(token);
  for (const s of seen) expect(s.headers["location"] ?? "").not.toContain(token);

  // F-61: Disconnect revokes through the real /revoke and the stub GitHub.
  const revoked = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/revoke");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  expect((await revoked).status()).toBe(204);
  await expect(page.getByText("Signed in with GitHub as octo")).toHaveCount(0);
});

test("t32_real_callback_page_csp_allows_only_its_nonce_script", async ({ page, context }) => {
  // T-32, F-23, F-24, I-13, I-17: the same journey without an opener, so the page stays to be read.
  await mockGitHubForTab(context);
  await page.goto("/");
  await waitForHydration(page);
  const callbackResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/callback");
  await followLink(page, "/api/auth/login?n=" + "N".repeat(22));
  const response = await callbackResponse;
  // The nonce script ran under the CSP: with no opener it writes the return text.
  await expect(page.locator("#msg")).toHaveText(RETURN_TEXT);

  const body = await response.text();
  const result = JSON.parse(body.match(/<script type="application\/json" id="result">(.*?)<\/script>/)![1]);
  expect(result).toMatchObject({ type: "mardoc-sign-in-result", v: 1, nonce: "N".repeat(22), ok: true, expiresIn: 28800 });
  expect(result.token).toMatch(STUB_TOKEN);
  // The stub's answer carried a refresh token; the Worker dropped it (I-13).
  expect(body).not.toContain("ghr_");
  expect(body).not.toContain("refresh");
  const cspNonce = (await response.allHeaders())["content-security-policy"].match(/'nonce-([^']+)'/)![1];
  expect(body).toContain(`<script nonce="${cspNonce}">`);
  expect(body.match(/<script/g)).toHaveLength(2); // the JSON data block and the nonce script

  // Any other script is refused: an injected inline script does not run.
  const outcome = await page.evaluate(
    () =>
      new Promise<{ ran: boolean; violated: string | null }>((resolve) => {
        let violated: string | null = null;
        document.addEventListener("securitypolicyviolation", (e) => {
          violated = e.violatedDirective;
        });
        const s = document.createElement("script");
        s.textContent = "window.__injected = true";
        document.body.appendChild(s);
        setTimeout(() => resolve({ ran: (window as unknown as { __injected?: boolean }).__injected === true, violated }), 300);
      }),
  );
  expect(outcome.ran).toBe(false);
  expect(outcome.violated).toMatch(/^script-src/);
});

test("t32_real_install_return_page_runs_no_script", async ({ page, context }) => {
  // T-32, F-29: GitHub's install return (no state) gets the static page, no exchange.
  await mockGitHubForTab(context);
  await page.goto("/");
  await waitForHydration(page);
  const callbackResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/callback");
  await followLink(page, "/api/auth/__stub-github/install");
  const response = await callbackResponse;
  await expect(page.locator("body")).toHaveText(INSTALLED_TEXT);
  expect((await response.allHeaders())["content-security-policy"]).toBe(STATIC_CSP);
  expect(await response.text()).not.toContain("<script");
});

test("t32_real_worker_health_ok_refresh_404_login_refuses_cross_site", async ({ request }) => {
  // T-32, F-25, F-27, F-21
  const health = await request.get("/api/auth/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true, version: "dev" });
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/api/auth/refresh")).status()).toBe(404);
  // A request that is not a same-origin document navigation cannot start an attempt.
  const login = await request.get("/api/auth/login?n=" + "N".repeat(22), { maxRedirects: 0 });
  expect(login.status()).toBe(403);
  expect(login.headers()["set-cookie"]).toBeUndefined();
});
