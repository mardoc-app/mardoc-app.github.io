/**
 * The stage 1 release gate (WP-8; T-10, T-11; L0 proof 3): after sign-in the
 * token lives in memory only. No web storage or readable cookie holds it,
 * and neither does any URL, history entry or performance entry name. The
 * Auth Worker and GitHub are mocked (e2e/fixtures/auth-mocks.ts); the same
 * properties against the real Worker module are checked in T-32.
 */
import { test, expect, type Request } from "@playwright/test";
import { MOCK_SIGN_IN_TOKEN } from "./fixtures/auth-mocks";
import {
  closeSettings,
  expectHeading,
  openSettings,
  pickerRepo,
  setUp,
  signIn,
  tokenSentToUser,
  webStorageDump,
} from "./fixtures/sign-in-session";

test("t10_no_token_in_web_storage_after_sign_in", async ({ page, context }) => {
  // T-10, F-30, I-10
  const { auth } = await setUp(page, context);
  await signIn(page);
  await expectHeading(page);
  // Load the repository list too (it caches repo names in localStorage).
  await openSettings(page, "Repository");
  await expect(pickerRepo(page, "acme/docs")).toBeVisible();
  await closeSettings(page);

  const token = tokenSentToUser(auth);
  expect(token).toBe(MOCK_SIGN_IN_TOKEN); // the token is live in the tab

  const dump = await webStorageDump(page);
  expect(dump).not.toContain(token);
  // HttpOnly cookies, origin storage and IndexedDB as Playwright sees them.
  const state = JSON.stringify(await context.storageState({ indexedDB: true }));
  expect(state).not.toContain(token);
  expect((await context.cookies()).some((c) => c.value.includes(token))).toBe(false);
  // Only the marker says a sign-in happened, and it holds no token.
  expect(await page.evaluate(() => localStorage.getItem("mardoc_auth_method"))).toBe("github-app");
});

test("t10_no_token_in_web_storage_with_saved_pat", async ({ page, context }) => {
  // T-10, F-30, F-53: signing in over a saved PAT leaves the PAT key unchanged.
  const { auth } = await setUp(page, context, { pat: true });
  await signIn(page);
  await expectHeading(page);
  const token = tokenSentToUser(auth);
  expect(token).toBe(MOCK_SIGN_IN_TOKEN);
  expect(await webStorageDump(page)).not.toContain(token);
  expect(JSON.stringify(await context.storageState({ indexedDB: true }))).not.toContain(token);
  expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBe("ghp_seeded_personal_token_e2e");
});

test("t11_no_token_in_urls_history_or_entries", async ({ page, context }) => {
  // T-11, NF-11, I-10, F-23
  const urls: string[] = [];
  const headerValues: string[] = [];
  const record = (request: Request) => {
    urls.push(request.url());
    void request.allHeaders().then((h) => headerValues.push(h["referer"] ?? "", h["location"] ?? "")).catch(() => {});
  };
  context.on("request", record);
  context.on("response", (response) => {
    void response.allHeaders().then((h) => headerValues.push(h["location"] ?? "")).catch(() => {});
  });
  context.on("page", (p) => p.on("framenavigated", (f) => urls.push(f.url())));
  page.on("framenavigated", (f) => urls.push(f.url()));

  const { auth } = await setUp(page, context);
  const historyBefore = await page.evaluate(() => history.length);
  const popup = await signIn(page);
  urls.push(popup.url());
  await expectHeading(page);
  await openSettings(page, "Repository");
  await expect(pickerRepo(page, "acme/docs")).toBeVisible();
  await closeSettings(page);

  const token = tokenSentToUser(auth);
  expect(token).toBe(MOCK_SIGN_IN_TOKEN);
  const inPage = await page.evaluate(() => ({
    href: location.href,
    historyLength: history.length,
    historyState: JSON.stringify(history.state),
    entries: performance.getEntries().map((e) => e.name),
  }));
  // Sign-in adds no history entry to the tab, and nothing it can read names the token.
  expect(inPage.historyLength).toBe(historyBefore);
  for (const value of [inPage.href, inPage.historyState, ...inPage.entries, ...urls, ...headerValues]) {
    expect(value ?? "").not.toContain(token);
  }
  expect(urls.length).toBeGreaterThan(5);
  expect(inPage.entries.length).toBeGreaterThan(5);

  // Stage 1 has no refresh route: the tab never asks for one, and it is a 404
  // (the real Worker's 404 is checked in T-32 and the Worker tests).
  expect(urls.some((u) => new URL(u, "http://x").pathname === "/api/auth/refresh")).toBe(false);
  expect((await page.request.get("/api/auth/refresh")).status()).toBe(404);
});
