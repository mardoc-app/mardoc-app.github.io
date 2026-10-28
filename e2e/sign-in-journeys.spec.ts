/**
 * T-31 (WP-8, NF-19): every sign-in journey, end to end in the browser, with
 * the Auth Worker and GitHub mocked (e2e/fixtures/auth-mocks.ts). Journeys
 * from requirements.md § Use-case stories and the owner's S-26 list: first
 * sign-in, an org install request, token expiry, Worker down to PAT, reload
 * to Sign in again, and Disconnect with revoke. Then the Settings states that
 * need a live session (backlog M1-4), which WP-6 covered with component tests.
 *
 * Simulated: GitHub's consent screen, the code exchange and the Worker. The
 * real Worker is T-32; real GitHub is the owner's demo (demos/m1.md Part B).
 */
import { test, expect } from "@playwright/test";
import { MOCK_SIGN_IN_TOKEN } from "./fixtures/auth-mocks";
import {
  PAT,
  closeSettings,
  expectHeading,
  fileRoute,
  openSettings,
  pickerRepo,
  session,
  setUp,
  signIn,
  signInFromSettings,
  waitForSession,
} from "./fixtures/sign-in-session";

const INSTALL_URL = "https://github.com/apps/mardoc/installations/new";
const connection = (page: import("@playwright/test").Page) => page.locator("div.fixed.inset-0");

test.describe("T-31 journeys", () => {
  test("t31_first_sign_in_from_a_shared_link", async ({ page, context }) => {
    // F-10, F-11, F-12, F-13, F-40, NF-16: no token, a shared link, one click, consent, done.
    const { auth, repos } = await setUp(page, context);
    const hashBefore = await page.evaluate(() => location.hash);
    const popup = await signInFromSettings(page);
    expect(new URL(popup.url()).pathname).toBe("/api/auth/login");
    await expect(connection(page).getByText("Signed in with GitHub as octo")).toBeVisible();
    await expect.poll(() => popup.isClosed()).toBe(true);
    await closeSettings(page);
    // The document from the link opens with the new token; the route is kept.
    await expectHeading(page);
    expect(await page.evaluate(() => location.hash)).toBe(hashBefore);
    expect(repos.reads.length).toBeGreaterThan(0);
    expect(repos.reads.every((r) => r.authorization === `token ${MOCK_SIGN_IN_TOKEN}`)).toBe(true);
    // F-40: the picker lists installed repositories, not everything the user can see.
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/docs")).toBeVisible();
    await expect(pickerRepo(page, "acme/not-installed")).toHaveCount(0);
    expect(auth.requests.github.map((r) => r.path)).toContain("/user/installations");
    expect(repos.reads.some((r) => r.path === "/user/repos")).toBe(false);
  });

  test("t31_first_sign_in_consent_denied_offers_the_token", async ({ page, context }) => {
    // Story "first sign-in", when it goes wrong: F-52.
    await setUp(page, context, { login: { ok: false, error: "access_denied" } });
    await signInFromSettings(page);
    await expect(connection(page).getByTestId("sign-in-error")).toHaveText("Sign-in was cancelled.");
    await expect(connection(page).getByRole("button", { name: "Use a personal access token" })).toBeVisible();
    expect(await session(page)).toMatchObject({ status: "signed-out", lastError: "access_denied" });
  });

  test("t31_org_install_request_message_then_refresh_shows_the_repo", async ({ page, context }) => {
    // F-41, F-42, F-43 (app side): the repo is not installed; after the org owner approves,
    // Refresh in the repository list shows it with no new sign-in.
    const route = fileRoute("acme/private");
    const { auth, repos } = await setUp(page, context, { route });
    await signIn(page);
    await closeSettings(page);
    const notice = page.getByTestId("no-access-notice");
    await expect(notice).toContainText("MarDoc may not be installed on acme/private");
    const install = notice.getByRole("link", { name: "Install MarDoc on this repository" });
    await expect(install).toHaveAttribute("href", INSTALL_URL);
    await expect(install).toHaveAttribute("target", "_blank");
    await expect(install).toHaveAttribute("rel", /noopener/);
    await expect(notice.getByRole("button", { name: "use a personal access token" })).toBeVisible();
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/docs")).toBeVisible();
    await expect(pickerRepo(page, "acme/private")).toHaveCount(0);

    // The org owner approves the request on GitHub (simulated).
    auth.set({ installations: [{ id: 7, account: "acme", repositories: ["acme/docs", "acme/private"] }] });
    repos.allow("acme/private");
    await connection(page).getByTitle("Refresh").click();
    await expect(pickerRepo(page, "acme/private")).toBeVisible();
    expect(auth.requests.login).toHaveLength(1); // no new sign-in
    await pickerRepo(page, "acme/private").click();
    await expect(page.getByTestId("no-access-notice")).toHaveCount(0);
  });

  test("t31_org_install_request_no_installations_message", async ({ page, context }) => {
    // F-44: installations cover no repository.
    await setUp(page, context, { installations: [], route: "/" });
    await signIn(page);
    await openSettings(page, "Repository");
    const empty = connection(page).getByTestId("no-installations");
    await expect(empty).toContainText("MarDoc isn’t installed on any repository you can reach.");
    await expect(empty).toContainText("or ask a repository owner to install it.");
    await expect(empty.getByRole("link", { name: "Install MarDoc on a repository" })).toHaveAttribute("href", INSTALL_URL);
    await expect(empty.getByRole("button", { name: "Use a personal access token" })).toBeVisible();
  });

  // M1-5: while signed in, the token option in the F-44 and F-42 messages opens the token form.
  for (const where of ["no-installations", "no-access-notice"] as const) {
    test(`t31_token_option_from_${where.replace(/-/g, "_")}_opens_the_token_form`, async ({ page, context }) => {
      const route = where === "no-access-notice" ? fileRoute("acme/private") : "/";
      await setUp(page, context, where === "no-installations" ? { installations: [], route } : { route });
      await signIn(page);
      if (where === "no-installations") {
        await openSettings(page, "Repository");
        await connection(page).getByTestId(where).getByRole("button", { name: "Use a personal access token" }).click();
      } else {
        await closeSettings(page);
        await page.getByTestId(where).getByRole("button", { name: "use a personal access token" }).click();
      }
      await expect(connection(page).getByPlaceholder("ghp_...")).toBeVisible({ timeout: 2_000 });
    });
  }

  test("t31_token_expiry_with_a_fake_clock", async ({ page, context }) => {
    // F-33, F-35, I-15, NF-12: expires_in 90 s; at the computed expiry the prompt shows and
    // no GitHub request carries the old token; signing in again keeps the document.
    await page.clock.install();
    const { auth, repos } = await setUp(page, context, { login: { ok: true, expiresIn: 90 } });
    await signIn(page, "octo", "expiring");
    await closeSettings(page);
    await expectHeading(page);
    // Under 10 minutes left: the warning shows at once.
    await expect(page.getByTestId("sign-in-banner")).toContainText("Your GitHub sign-in ends in 10 minutes");

    // expiresAt = 90 s minus the margin min(60 s, 90 × 100 ms) = 81 s.
    await page.clock.fastForward("01:20");
    expect((await session(page)).status).not.toBe("expired");
    await page.clock.fastForward("00:02");
    await waitForSession(page, { status: "expired" });
    await expect(page.getByTestId("sign-in-banner")).toContainText("Your GitHub sign-in has ended");
    const atExpiry = repos.reads.length;
    await page.clock.fastForward("05:00");
    expect(repos.reads.slice(atExpiry).some((r) => r.authorization?.includes(MOCK_SIGN_IN_TOKEN))).toBe(false);
    // The open document stays on screen.
    await expectHeading(page);

    // Sign in again from the banner as the same login: a fresh token; the open file is
    // not fetched again (F-35).
    auth.set({ login: { ok: true, token: "ghu_mock_second_token_0123456789", expiresIn: 28800 } });
    const beforeAgain = repos.reads.length;
    const popup = page.waitForEvent("popup");
    await page.getByTestId("sign-in-banner").getByRole("button", { name: "Sign in again" }).click();
    await popup;
    await waitForSession(page, { status: "signed-in", sessionKey: "sign-in:octo" });
    await expect(page.getByTestId("sign-in-banner")).toHaveCount(0);
    await expectHeading(page);
    expect(repos.reads.slice(beforeAgain).some((r) => r.path.includes("/contents/"))).toBe(false);
  });

  test("t31_worker_down_falls_back_to_the_token", async ({ page, context }) => {
    // F-51, NF-13: the Worker is down; within 5 s the message and the token form, which connects.
    const { repos } = await setUp(page, context, { health: 503, login: { stay: true } });
    const started = Date.now();
    await signInFromSettings(page);
    await expect(connection(page).getByTestId("sign-in-error")).toHaveText("Sign-in with GitHub is unavailable right now.");
    expect(Date.now() - started).toBeLessThan(5_000);
    await connection(page).getByRole("button", { name: "Use a personal access token" }).click();
    await connection(page).getByPlaceholder("ghp_...").fill(PAT);
    await connection(page).getByRole("button", { name: "Connect", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBe(PAT);
    await waitForSession(page, { sessionKey: "pat" });
    await expect.poll(() => repos.reads.some((r) => r.authorization === `token ${PAT}`)).toBe(true);
  });

  test("t31_reload_offers_sign_in_again_and_keeps_the_route", async ({ page, context }) => {
    // F-31, F-32, F-37: a reload ends the session; the route is kept and the file named.
    const { auth, repos } = await setUp(page, context);
    await signIn(page);
    await closeSettings(page);
    await expectHeading(page);
    const hash = await page.evaluate(() => location.hash);
    const before = repos.reads.length;
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __mardocAuth?: unknown }).__mardocAuth);
    const banner = page.getByTestId("sign-in-banner");
    await expect(banner).toContainText("Sign in again to open docs/spec.md");
    await expect(page.getByTestId("sign-in-again-pane")).toContainText("docs/spec.md");
    expect(await page.evaluate(() => location.hash)).toBe(hash);
    expect(repos.reads.slice(before).some((r) => r.authorization?.includes(MOCK_SIGN_IN_TOKEN))).toBe(false);

    const popup = page.waitForEvent("popup");
    await banner.getByRole("button", { name: "Sign in again" }).click();
    await popup;
    await waitForSession(page, { status: "signed-in", sessionKey: "sign-in:octo" });
    await expectHeading(page);
    expect(auth.requests.login).toHaveLength(2);
  });

  test("t31_disconnect_revokes_and_signs_out", async ({ page, context }) => {
    // F-60, F-61, F-32: Disconnect posts the revoke with the app origin and leaves no marker.
    const { auth } = await setUp(page, context);
    await signIn(page);
    await connection(page).getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect.poll(() => auth.requests.revoke.length).toBe(1);
    const origin = await page.evaluate(() => location.origin);
    expect(auth.requests.revoke[0]).toEqual({ origin, contentType: "application/json", body: { token: MOCK_SIGN_IN_TOKEN } });
    await expect(connection(page).getByText("Signed in with GitHub as octo")).toHaveCount(0);
    await expect(connection(page).getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("mardoc_auth_method"))).toBeNull();
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __mardocAuth?: unknown }).__mardocAuth);
    await expect(page.getByTestId("sign-in-banner")).toHaveCount(0);
  });
});

test.describe("M1-4 live-session Settings", () => {
  test("t16_settings_signed_in_view_with_install_link", async ({ page, context }) => {
    // F-13, F-18, F-41: the signed-in view.
    await setUp(page, context);
    await signIn(page);
    const view = connection(page);
    await expect(view.getByText("Signed in with GitHub as octo")).toBeVisible();
    await expect(view.getByText("Signed in through the MarDoc GitHub App")).toBeVisible();
    const install = view.getByRole("link", { name: "Install MarDoc on more repositories" });
    await expect(install).toHaveAttribute("href", INSTALL_URL);
    await expect(install).toHaveAttribute("target", "_blank");
    await expect(install).toHaveAttribute("rel", /noopener/);
    await expect(view.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
    await expect(view.getByRole("button", { name: "Use a personal access token" })).toHaveCount(0);
    await expect(view.getByText("A saved personal access token will be used after you disconnect.")).toHaveCount(0);
  });

  test("t16_settings_signing_in_status", async ({ page, context }) => {
    // NF-22: the attempt is announced in the live region.
    await setUp(page, context, { login: { stay: true } });
    await signInFromSettings(page);
    await expect(connection(page).getByTestId("sign-in-status")).toHaveText("Signing in with GitHub…");
    await expect(connection(page).getByTestId("sign-in-status")).toHaveAttribute("aria-live", "polite");
  });

  test("t13_saved_pat_kept_and_remove_saved_token", async ({ page, context }) => {
    // F-53, F-55: the sentence and Remove saved token.
    await setUp(page, context, { pat: true });
    await signIn(page);
    const view = connection(page);
    await expect(view.getByText("A saved personal access token will be used after you disconnect.")).toBeVisible();
    await view.getByRole("button", { name: "Remove saved token", exact: true }).click();
    await expect(view.getByText("A saved personal access token will be used after you disconnect.")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBeNull();
    expect((await session(page)).sessionKey).toBe("sign-in:octo");
  });

  test("t13_disconnect_restores_the_saved_pat", async ({ page, context }) => {
    // F-53, I-14: after Disconnect the PAT is active again.
    const { repos } = await setUp(page, context, { pat: true });
    await signIn(page);
    await connection(page).getByRole("button", { name: "Disconnect", exact: true }).click();
    await waitForSession(page, { sessionKey: "pat" });
    await expect(connection(page).getByText("Connected with a personal access token")).toBeVisible();
    await closeSettings(page);
    const before = repos.reads.length;
    await page.getByRole("button", { name: "Refresh document", exact: true }).click();
    await expect.poll(() => repos.reads.length).toBeGreaterThan(before);
    expect(repos.reads.slice(before).every((r) => r.authorization === `token ${PAT}`)).toBe(true);
  });

  test("t13_disconnect_and_remove_saved_token_leaves_no_credential", async ({ page, context }) => {
    // F-55, F-61
    const { auth } = await setUp(page, context, { pat: true });
    await signIn(page);
    await connection(page).getByRole("button", { name: "Disconnect and remove saved token" }).click();
    await expect.poll(() => auth.requests.revoke.length).toBe(1);
    await waitForSession(page, { sessionKey: null });
    expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBeNull();
    await expect(connection(page).getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  });

  test("t14_settings_expired_view_offers_sign_in_again_and_the_token", async ({ page, context }) => {
    // F-33, F-51: the ended sign-in in Settings.
    await page.clock.install();
    await setUp(page, context, { login: { ok: true, expiresIn: 90 } });
    await signIn(page, "octo", "expiring");
    await page.clock.fastForward("01:22");
    await waitForSession(page, { status: "expired" });
    const view = connection(page);
    await expect(view.getByText("This sign-in has ended.")).toBeVisible();
    await expect(view.getByRole("button", { name: "Sign in again" })).toBeVisible();
    await expect(view.getByRole("button", { name: "Use a personal access token" })).toBeVisible();
  });

  test("t14_expired_token_is_not_sent_and_refresh_says_sign_in_again", async ({ page, context }) => {
    // F-33, F-34, I-15: after expiry a read is refused in the tab, not sent with the old token.
    await page.clock.install();
    const { repos } = await setUp(page, context, { login: { ok: true, expiresIn: 90 } });
    await signIn(page, "octo", "expiring");
    await closeSettings(page);
    await expectHeading(page);
    await page.clock.fastForward("01:22");
    await waitForSession(page, { status: "expired" });
    const before = repos.reads.length;
    await page.getByRole("button", { name: "Refresh document", exact: true }).click();
    await expect(page.getByText("your GitHub sign-in has ended. Sign in again.", { exact: false })).toBeVisible();
    expect(repos.reads.slice(before).some((r) => r.authorization?.includes(MOCK_SIGN_IN_TOKEN))).toBe(false);
    await expect(page.getByText("Open Settings to re-authenticate")).toHaveCount(0);
  });

  test("t18_settings_failure_shows_message_and_token_option", async ({ page, context }) => {
    // F-52: a failed attempt keeps the PAT option in the signed-out view.
    await setUp(page, context, { login: { ok: false, error: "state_mismatch" } });
    await signInFromSettings(page);
    const view = connection(page);
    await expect(view.getByTestId("sign-in-error")).toHaveText(
      "Sign-in could not be verified. Check that cookies are allowed for mardoc.app, then try again.",
    );
    await expect(view.getByRole("button", { name: "Use a personal access token" })).toBeVisible();
    await expect(view.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  });
});

// WP-9: findings from the M1 code review (docs/reviews/2026-10-28-m1-code-review.md).
test.describe("WP-9 review fixes", () => {
  test("f40_picker_reloads_on_sign_in_cr1", async ({ page, context }) => {
    // CR-1: a saved PAT lists every repo from /user/repos. Signing in from the open
    // Settings must replace that list with the installed repositories only (F-40).
    await setUp(page, context, { pat: true, route: "/" });
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/not-installed")).toBeVisible();
    await signIn(page);
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/docs")).toBeVisible();
    await expect(pickerRepo(page, "acme/not-installed")).toHaveCount(0);
  });

  test("f44_empty_installations_reachable_after_sign_in_over_pat_cr1", async ({ page, context }) => {
    // CR-1: with no installations, F-44's message appears instead of the PAT's list.
    await setUp(page, context, { pat: true, route: "/", installations: [] });
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/not-installed")).toBeVisible();
    await signIn(page);
    await openSettings(page, "Repository");
    await expect(connection(page).getByTestId("no-installations")).toBeVisible();
    await expect(pickerRepo(page, "acme/not-installed")).toHaveCount(0);
  });

  test("f53_picker_refills_after_disconnect_restores_the_pat_cr1", async ({ page, context }) => {
    // CR-1: Disconnect makes the saved PAT active again (F-53); its list comes back.
    await setUp(page, context, { pat: true, route: "/" });
    await signIn(page);
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/docs")).toBeVisible();
    await openSettings(page, "GitHub Connection");
    await connection(page).getByRole("button", { name: "Disconnect", exact: true }).click();
    await waitForSession(page, { sessionKey: "pat" });
    await openSettings(page, "Repository");
    await expect(pickerRepo(page, "acme/not-installed")).toBeVisible();
    await expect(pickerRepo(page, "acme/docs")).toHaveCount(0);
  });

  test("f34_signed_in_401_shows_expired_view_with_sign_in_again_cr2", async ({ page, context }) => {
    // CR-2: a real 401 on a signed-in read (the App revoked on github.com) ends the
    // session: expired, the banner, Sign in again and the token form (F-34).
    await setUp(page, context);
    await signIn(page);
    await closeSettings(page);
    await expectHeading(page);
    await page.route("https://api.github.com/repos/**", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Bad credentials" }) }),
    );
    await page.getByRole("button", { name: "Refresh document", exact: true }).click();
    await waitForSession(page, { status: "expired", sessionKey: "sign-in:octo" });
    const banner = page.getByTestId("sign-in-banner");
    await expect(banner).toContainText("Your GitHub sign-in has ended");
    await expect(banner.getByRole("button", { name: "Sign in again" })).toBeVisible();
    await expect(page.getByText("Open Settings to re-authenticate")).toHaveCount(0);
    await openSettings(page);
    const view = connection(page);
    await expect(view.getByText("This sign-in has ended.")).toBeVisible();
    await expect(view.getByRole("button", { name: "Sign in again" })).toBeVisible();
    await view.getByRole("button", { name: "Use a personal access token" }).click();
    await expect(view.getByPlaceholder("ghp_...")).toBeVisible();
  });

  test("f51_unconfigured_worker_health_shows_unavailable_cr4", async ({ page, context }) => {
    // CR-4: a Worker deployed without CLIENT_ID or CLIENT_SECRET answers health with
    // 503 {"ok":false} (worker/test/routes.test.ts); the tab shows F-51's message
    // and the token option within 5 s, and closes the pop-up.
    await setUp(page, context, { login: { stay: true } });
    await page.route("**/api/auth/health", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
    );
    const started = Date.now();
    const popup = await signInFromSettings(page);
    await expect(connection(page).getByTestId("sign-in-error")).toHaveText("Sign-in with GitHub is unavailable right now.");
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(connection(page).getByRole("button", { name: "Use a personal access token" })).toBeVisible();
    await expect.poll(() => popup.isClosed()).toBe(true);
    expect((await session(page)).lastError).toBe("worker_unavailable");
  });

  test("f35_same_login_sign_in_again_keeps_dirty_editor_cr2", async ({ page, context }) => {
    // CR-2: F-35's acceptance. Make the editor dirty, expire the token, sign in again as
    // the same login: the edit and route stay and the open file is not fetched again.
    await page.clock.install();
    const { auth, repos } = await setUp(page, context, { login: { ok: true, expiresIn: 90 } });
    await signIn(page, "octo", "expiring");
    await closeSettings(page);
    await expectHeading(page);
    const edit = " Edited before expiry.";
    await page.locator(".ProseMirror p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(edit);
    await expect(page.locator(".ProseMirror")).toContainText(edit);
    const hash = await page.evaluate(() => location.hash);

    await page.clock.fastForward("01:22");
    await waitForSession(page, { status: "expired" });
    auth.set({ login: { ok: true, token: "ghu_mock_second_token_0123456789", expiresIn: 28800 } });
    const before = repos.reads.length;
    const popup = page.waitForEvent("popup");
    await page.getByTestId("sign-in-banner").getByRole("button", { name: "Sign in again" }).click();
    await popup;
    await waitForSession(page, { status: "signed-in", sessionKey: "sign-in:octo" });
    await expect(page.locator(".ProseMirror")).toContainText(edit);
    await expectHeading(page);
    expect(await page.evaluate(() => location.hash)).toBe(hash);
    expect(repos.reads.slice(before).some((r) => r.path.includes("/contents/"))).toBe(false);
  });
});
