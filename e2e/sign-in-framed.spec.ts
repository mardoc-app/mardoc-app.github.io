/**
 * T-34 (F-19, SR-1): a page on another origin frames MarDoc. Sign-in is not
 * offered there and cannot be started; Settings links to MarDoc in a new
 * tab instead, and the token option stays.
 *
 * Simulated: the framing site is a Playwright route on `127.0.0.1`, a
 * different origin from the app on `localhost`. The Auth Worker and GitHub
 * are mocked (e2e/fixtures/auth-mocks.ts), so a pop-up that opened would be
 * recorded as a `/api/auth/login` request.
 */
import { test, expect, type Frame, type Page } from "@playwright/test";
import { mockAuth } from "./fixtures/auth-mocks";
import { fileRoute, mockRepos } from "./fixtures/sign-in-session";
import { waitForHydration } from "./fixtures/helpers";

const FRAMER_PATH = "/__framer.html";

async function openFramed(page: Page, baseURL: string, route: string): Promise<Frame> {
  const app = new URL(route, baseURL).href;
  const framer = new URL(FRAMER_PATH, baseURL);
  framer.hostname = framer.hostname === "localhost" ? "127.0.0.1" : "localhost";
  await page.route(framer.href, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Another site</title><iframe id="mardoc" src="${app}" style="width:100%;height:90vh;border:0"></iframe>`,
    }),
  );
  await page.goto(framer.href);
  // The iframe starts on about:blank; wait until it has navigated to the app.
  const appOrigin = new URL(baseURL).origin;
  let found: Frame | undefined;
  await expect
    .poll(() => (found = page.frames().find((f) => f.url().startsWith(appOrigin))) !== undefined, { timeout: 20_000 })
    .toBe(true);
  const frame = found!;
  await frame.waitForFunction(() => !!(window as unknown as { __mardocAuth?: unknown }).__mardocAuth, null, {
    timeout: 20_000,
  });
  expect(new URL(page.url()).origin).not.toBe(new URL(frame.url()).origin);
  return frame;
}

test.describe("T-34 framed by another site", () => {
  test("f19_framed_app_offers_a_new_tab_not_sign_in_sr1", async ({ page, context, baseURL, browserName }) => {
    // Chromium's Local Network Access check blocks a routed (address-unknown)
    // page from framing localhost; the permission stands in for the user's
    // consent. A real attacker's public page framing mardoc.app is not affected.
    if (browserName === "chromium") await context.grantPermissions(["local-network-access"]);
    await page.addInitScript(() => {
      (window as unknown as { __MARDOC_E2E__: boolean }).__MARDOC_E2E__ = true;
    });
    const auth = await mockAuth(context);
    await mockRepos(page);
    const popups: string[] = [];
    context.on("page", (p) => popups.push(p.url()));

    const frame = await openFramed(page, baseURL!, fileRoute());
    await frame.getByTitle("Settings", { exact: true }).click();
    await frame.getByRole("button", { name: "GitHub Connection", exact: true }).click();
    const dialog = frame.locator("div.fixed.inset-0");

    await expect(dialog.getByRole("button", { name: /^Sign in/ })).toHaveCount(0);
    const link = dialog.getByRole("link", { name: "Open MarDoc in a new tab" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", frame.url());
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /\bnoopener\b/);
    await expect(dialog.getByRole("button", { name: "Use a personal access token" })).toBeVisible();

    // The adapter refuses too: a script in the frame that calls start opens
    // nothing. `start` dispatches synchronously, so the session read in the
    // same task shows whether an attempt began.
    const status = await frame.evaluate(() => {
      const auth = (window as unknown as {
        __mardocAuth: { startSignIn(): void; getSession(): { status: string } };
      }).__mardocAuth;
      auth.startSignIn();
      return auth.getSession().status;
    });
    expect(status).toBe("signed-out");
    expect(auth.requests.login).toEqual([]);
    expect(auth.requests.health).toBe(0);
    expect(popups.filter((u) => u.includes("/api/auth/"))).toEqual([]);
  });

  test("f19_top_level_app_still_offers_sign_in_sr1", async ({ page, context }) => {
    // The control: the same app, not framed, offers Sign in with GitHub.
    await mockAuth(context);
    await mockRepos(page);
    await page.goto(fileRoute());
    await waitForHydration(page);
    await page.getByTitle("Settings", { exact: true }).click();
    await page.getByRole("button", { name: "GitHub Connection", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open MarDoc in a new tab" })).toHaveCount(0);
  });
});
