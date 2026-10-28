/**
 * WP-5: the pop-up hand-off in a real browser, with the Auth Worker and
 * GitHub mocked (e2e/fixtures/auth-mocks.ts). The mocked `/api/auth/login`
 * page posts a result to `window.opener` and closes, as the real callback
 * page does. This proves the tab's logic only: the real Worker, GitHub's
 * pages and whether `window.opener` survives them are SP-3 and T-32.
 *
 * Sign-in starts from a click on a button the test adds, which calls the
 * Playwright-only hook `window.__mardocAuth.startSignIn()` (enabled by
 * `window.__MARDOC_E2E__`). WP-6's Settings button replaces it.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mockAuth, MOCK_SIGN_IN_TOKEN, type AuthMockOptions } from "./fixtures/auth-mocks";

const PAT = "ghp_seeded_personal_token_e2e";
const FILE = "docs/spec.md";
const DEEP_LINK = `/#/acme/docs/blob/main/${FILE}`;

type Session = {
  status: string;
  sessionKey: string | null;
  lastLogin: string | null;
  lastError: string | null;
};

/** GitHub repository reads for the deep-linked file, recording the auth header. */
async function mockRepo(page: Page) {
  const reads: { path: string; authorization: string | null }[] = [];
  await page.route("https://raw.githubusercontent.com/**", (route) => route.abort());
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    // `/user` and installations belong to the auth mocks on the context.
    if (path === "/user" || path.startsWith("/user/")) return route.fallback();
    reads.push({ path, authorization: (await route.request().allHeaders())["authorization"] ?? null });
    let data: unknown;
    if (path.includes("/commits/")) data = { sha: "a".repeat(40) };
    else if (path.includes("/contents/")) {
      data = { encoding: "base64", content: Buffer.from("# Spec under review\n\nBody text.").toString("base64") };
    } else if (path.includes("/git/trees/")) {
      data = { tree: [{ path: "docs", type: "tree", sha: "dir" }, { path: FILE, type: "blob", sha: "blob" }] };
    } else if (path.endsWith("/branches")) data = [{ name: "main" }];
    else if (path.endsWith("/pulls")) data = [];
    else if (path === "/repos/acme/docs") data = { default_branch: "main" };
    else {
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: `Unexpected: ${path}` }) });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  return reads;
}

async function setUp(page: Page, context: BrowserContext, options: AuthMockOptions = {}, opts: { pat?: boolean } = {}) {
  const pat = opts.pat ?? true;
  await page.addInitScript((token) => {
    (window as unknown as { __MARDOC_E2E__: boolean }).__MARDOC_E2E__ = true;
    if (token && window === window.top && !window.opener) localStorage.setItem("mardoc_github_token", token);
  }, pat ? PAT : null);
  const auth = await mockAuth(context, options);
  const reads = await mockRepo(page);
  await page.goto(DEEP_LINK);
  await expect(page.locator(".ProseMirror h1")).toHaveText("Spec under review");
  await page.waitForFunction(() => !!(window as unknown as { __mardocAuth?: unknown }).__mardocAuth);
  return { auth, reads };
}

const session = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mardocAuth: { getSession(): Session } }).__mardocAuth.getSession());

async function waitForSession(page: Page, check: Partial<Session>, timeout = 10_000) {
  await page.waitForFunction(
    (want) => {
      const s = (window as unknown as { __mardocAuth: { getSession(): Record<string, unknown> } }).__mardocAuth.getSession();
      return Object.entries(want).every(([k, v]) => s[k] === v);
    },
    check,
    { timeout },
  );
  return session(page);
}

/** A real click on a button whose handler calls startSignIn(), so the pop-up opens inside the click. */
async function clickSignIn(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById("e2e-sign-in")) return;
    const b = document.createElement("button");
    b.id = "e2e-sign-in";
    b.textContent = "E2E sign in";
    b.style.cssText = "position:fixed;left:0;bottom:0;z-index:2147483647";
    b.addEventListener("click", () =>
      (window as unknown as { __mardocAuth: { startSignIn(): void } }).__mardocAuth.startSignIn(),
    );
    document.body.appendChild(b);
  });
  await page.locator("#e2e-sign-in").click();
}

async function signInWithPopup(page: Page) {
  const popup = page.waitForEvent("popup");
  await clickSignIn(page);
  return popup;
}

/** Every place web storage or the page could keep a token (F-30, NF-11). */
async function tokenTraces(page: Page) {
  return page.evaluate(() => {
    const parts = [document.cookie, location.href, ...performance.getEntries().map((e) => e.name)];
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)!;
        parts.push(k, store.getItem(k) ?? "");
      }
    }
    return parts.join("\n");
  });
}

/** The seeded PAT is still the active credential: a GitHub read carries it. */
async function expectPatStillActive(page: Page, reads: { authorization: string | null }[]) {
  const s = await session(page);
  expect(s.sessionKey).toBe("pat");
  expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBe(PAT);
  const before = reads.length;
  await page.getByRole("button", { name: "Refresh document", exact: true }).click();
  await expect.poll(() => reads.length).toBeGreaterThan(before);
  expect(reads.slice(before).every((r) => r.authorization === `token ${PAT}`)).toBe(true);
  await expect(page.locator(".ProseMirror h1")).toHaveText("Spec under review");
}

test.describe("increment 2: a mocked sign-in completes", () => {
  test("f11_mocked_sign_in_completes and f12_deep_link_survives_sign_in", async ({ page, context }) => {
    const { auth, reads } = await setUp(page, context);
    const hashBefore = await page.evaluate(() => location.hash);
    expect(reads.every((r) => r.authorization === `token ${PAT}`)).toBe(true);
    const readsBefore = reads.length;

    const popup = await signInWithPopup(page);
    expect(auth.requests.login).toHaveLength(1);
    expect(auth.requests.login[0]).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(new URL(popup.url()).pathname).toBe("/api/auth/login");

    const s = await waitForSession(page, { status: "signed-in" });
    expect(s).toMatchObject({ sessionKey: "sign-in:octo", lastLogin: "octo", lastError: null });
    expect(auth.requests.health).toBe(1);
    expect(auth.requests.github).toContainEqual({ path: "/user", authorization: `token ${MOCK_SIGN_IN_TOKEN}` });

    // F-12: the route and the open document survive.
    expect(await page.evaluate(() => location.hash)).toBe(hashBefore);
    await expect(page.locator(".ProseMirror h1")).toHaveText("Spec under review");
    // GitHub reads after sign-in carry the new token.
    await expect.poll(() => reads.length).toBeGreaterThan(readsBefore);
    expect(reads.slice(readsBefore).every((r) => r.authorization === `token ${MOCK_SIGN_IN_TOKEN}`)).toBe(true);

    // I-10, NF-11, F-53: no storage, URL or entry name holds it; the PAT stays saved.
    const traces = await tokenTraces(page);
    expect(traces).not.toContain(MOCK_SIGN_IN_TOKEN);
    expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBe(PAT);
    expect(await page.evaluate(() => localStorage.getItem("mardoc_auth_method"))).toBe("github-app");
  });

  test("f61_disconnect_posts_revoke_with_origin_and_restores_the_pat", async ({ page, context }) => {
    const { auth, reads } = await setUp(page, context);
    await signInWithPopup(page);
    await waitForSession(page, { status: "signed-in" });
    await page.evaluate(() => (window as unknown as { __mardocAuth: { disconnect(): void } }).__mardocAuth.disconnect());
    await expect.poll(() => auth.requests.revoke.length).toBe(1);
    const origin = await page.evaluate(() => location.origin);
    expect(auth.requests.revoke[0]).toEqual({ origin, contentType: "application/json", body: { token: MOCK_SIGN_IN_TOKEN } });
    await expect(page.locator(".ProseMirror h1")).toHaveText("Spec under review");
    await expectPatStillActive(page, reads);
  });

  test("t12_result_from_iframe_with_copied_nonce_ignored", async ({ page, context }) => {
    const { auth } = await setUp(page, context, { login: { stay: true } });
    const popup = await signInWithPopup(page);
    await expect.poll(() => auth.requests.login.length).toBe(1);
    const nonce = auth.requests.login[0];
    // A same-origin iframe (as a rendered HTML document is) posts a
    // well-formed result carrying the copied nonce.
    await page.evaluate((n) => {
      const frame = document.createElement("iframe");
      frame.srcdoc = `<script>parent.postMessage(${JSON.stringify({
        type: "mardoc-sign-in-result", v: 1, nonce: n, ok: true, token: "ghu_forged_by_iframe", expiresIn: 28800,
      })}, "*")</script>`;
      document.body.appendChild(frame);
    }, nonce);
    await page.waitForTimeout(500);
    expect((await session(page)).status).toBe("signing-in");
    expect(auth.requests.github.some((r) => r.authorization?.includes("ghu_forged_by_iframe"))).toBe(false);
    // A wrong nonce from the pop-up itself is ignored too.
    await popup.evaluate(() => window.opener.postMessage({
      type: "mardoc-sign-in-result", v: 1, nonce: "B".repeat(22), ok: true, token: "ghu_wrong_nonce", expiresIn: 28800,
    }, location.origin));
    await page.waitForTimeout(300);
    expect((await session(page)).status).toBe("signing-in");
    // The pop-up's real result is still accepted.
    await popup.evaluate((n) => window.opener.postMessage({
      type: "mardoc-sign-in-result", v: 1, nonce: n, ok: true, token: "ghu_mock_sign_in_token_0123456789", expiresIn: 28800,
    }, location.origin), nonce);
    await waitForSession(page, { status: "signed-in", sessionKey: "sign-in:octo" });
    expect(auth.requests.github.filter((r) => r.path === "/user").map((r) => r.authorization)).toEqual([`token ${MOCK_SIGN_IN_TOKEN}`]);
  });
});

test.describe("increment 3: every failure ends the attempt and keeps the PAT", () => {
  for (const health of [404, 503, "network"] as const) {
    test(`f51_worker_unavailable_within_5s_${health}`, async ({ page, context }) => {
      const { reads } = await setUp(page, context, { health, login: { stay: true } });
      const started = Date.now();
      const popup = await signInWithPopup(page);
      const s = await waitForSession(page, { lastError: "worker_unavailable" }, 5_000);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(s).toMatchObject({ status: "signed-out", sessionKey: "pat" });
      await expect.poll(() => popup.isClosed()).toBe(true);
      await expectPatStillActive(page, reads);
    });
  }

  test("f51_worker_unavailable_within_5s_no_answer", async ({ page, context }) => {
    const { reads } = await setUp(page, context, { health: "hang", login: { stay: true } });
    const started = Date.now();
    await signInWithPopup(page);
    await waitForSession(page, { lastError: "worker_unavailable" }, 7_000);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(4_500);
    expect(elapsed).toBeLessThan(6_500);
    await expectPatStillActive(page, reads);
  });

  test("f52_failure_codes_keep_credential_popup_blocked", async ({ page, context }) => {
    // Simulated: Playwright's browsers don't block pop-ups, so window.open is
    // replaced to return null, as a blocker does.
    await page.addInitScript(() => { window.open = () => null; });
    const { auth, reads } = await setUp(page, context);
    await clickSignIn(page);
    const s = await waitForSession(page, { lastError: "popup_blocked" });
    expect(s).toMatchObject({ status: "signed-out", sessionKey: "pat" });
    expect(auth.requests.health).toBe(0);
    await expectPatStillActive(page, reads);
  });

  test("f52_failure_codes_keep_credential_window_closed", async ({ page, context }) => {
    const { reads } = await setUp(page, context, { login: { close: true } });
    await signInWithPopup(page);
    const s = await waitForSession(page, { lastError: "window_closed" }, 5_000);
    expect(s).toMatchObject({ status: "signed-out", sessionKey: "pat" });
    await expectPatStillActive(page, reads);
  });

  test("f52_failure_codes_keep_credential_timeout", async ({ page, context }) => {
    await page.clock.install();
    const { auth, reads } = await setUp(page, context, { login: { stay: true } });
    const popup = await signInWithPopup(page);
    await waitForSession(page, { status: "signing-in" });
    // Let the health answer land before jumping past its 5 s timeout.
    await expect.poll(() => auth.requests.health).toBe(1);
    await page.waitForTimeout(300);
    await page.clock.fastForward("09:59");
    expect((await session(page)).status).toBe("signing-in");
    await page.clock.fastForward("00:02");
    const s = await waitForSession(page, { lastError: "timeout" });
    expect(s).toMatchObject({ status: "signed-out", sessionKey: "pat" });
    await expect.poll(() => popup.isClosed()).toBe(true);
    await expectPatStillActive(page, reads);
  });

  for (const code of ["access_denied", "state_mismatch", "bad_verification_code", "exchange_failed", "non_expiring_token", "redirect_uri_mismatch"]) {
    test(`f52_failure_codes_keep_credential_${code}`, async ({ page, context }) => {
      const { auth, reads } = await setUp(page, context, { login: { ok: false, error: code } });
      await signInWithPopup(page);
      const s = await waitForSession(page, { lastError: code });
      expect(s).toMatchObject({ status: "signed-out", sessionKey: "pat" });
      expect(auth.requests.github.some((r) => r.path === "/user")).toBe(false);
      await expectPatStillActive(page, reads);
    });
  }

  test("f52_failure_codes_keep_credential_user_401", async ({ page, context }) => {
    const { auth, reads } = await setUp(page, context, { user: { status: 401 } });
    await signInWithPopup(page);
    const s = await waitForSession(page, { lastError: "exchange_failed" });
    expect(s).toMatchObject({ status: "signed-out", sessionKey: "pat" });
    expect(auth.requests.github).toContainEqual({ path: "/user", authorization: `token ${MOCK_SIGN_IN_TOKEN}` });
    expect(await tokenTraces(page)).not.toContain(MOCK_SIGN_IN_TOKEN);
    await expectPatStillActive(page, reads);
  });
});

