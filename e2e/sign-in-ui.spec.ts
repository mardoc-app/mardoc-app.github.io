import { test, expect, type Page } from "@playwright/test";
import { waitForHydration } from "./fixtures/helpers";

// WP-6. These specs drive the states the UI can reach before the sign-in
// window adapter (WP-5) exists: signed out, a saved PAT, embed mode, and the
// reload prompt (seeded through the sign-in marker). The states that need a
// live session (signed in, expiring, expired, each result code, installs) are
// proved by component tests in src/__tests__/sign-in-ui.test.tsx.

const MARKER = "mardoc_auth_method";

async function blockGitHub(page: Page) {
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

async function openSettings(page: Page) {
  await page.getByTitle("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "GitHub Connection" }).click();
}

test.describe("settings", () => {
  test("t16_settings_signed_out_offers_sign_in_first_and_hides_token_form", async ({ page }) => {
    // F-10, F-17, F-54, F-71, F-72
    await page.goto("/");
    await waitForHydration(page);
    await openSettings(page);
    const buttons = page.locator("div.fixed.inset-0 div.flex-1.overflow-y-auto button");
    await expect(buttons.first()).toHaveText("Sign in with GitHub");
    await expect(page.getByPlaceholder("ghp_...")).toBeHidden();
    await page.getByRole("button", { name: "Use a personal access token" }).click();
    await expect(page.getByPlaceholder("ghp_...")).toBeVisible();
    const guide = page.getByRole("link", { name: "personal access token guide" });
    await expect(guide).toHaveAttribute("href", /docs\/setup-github-pat\.md$/);
    const text = (await page.locator("[data-testid=pat-form]").innerText()).toLowerCase();
    expect(text).not.toContain("read:org");
    expect(text).not.toContain("there is no server");
    expect(text).not.toContain("no server");
  });

  test("t16_settings_pat_token_form_connects", async ({ page }) => {
    // F-17: the form still connects once opened.
    await blockGitHub(page);
    await page.goto("/");
    await waitForHydration(page);
    await openSettings(page);
    await page.getByRole("button", { name: "Use a personal access token" }).click();
    await page.getByPlaceholder("ghp_...").fill("ghp_fake");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBe("ghp_fake");
  });

  test("t16_settings_saved_pat_shows_connected_and_sign_in", async ({ page }) => {
    // F-18
    await blockGitHub(page);
    await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
    await page.goto("/");
    await waitForHydration(page);
    await openSettings(page);
    await expect(page.getByText("Connected with a personal access token")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  });

  test("t16_settings_embed_mode_has_no_sign_in_control", async ({ page }) => {
    // F-15
    await page.goto("/?embed=true");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Sign in with GitHub")).toHaveCount(0);
    await expect(page.getByTitle("Settings", { exact: true })).toHaveCount(0);
  });
});

test.describe("banner", () => {
  const route = "#/octo/docs/blob/main/guide/intro.md";
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((m) => {
      if (!sessionStorage.getItem("seeded")) { localStorage.setItem(m, "github-app"); sessionStorage.setItem("seeded", "1"); }
    }, MARKER);
  });

  test("f37_reload_prompt_names_file", async ({ page }) => {
    // F-32, F-37, NF-22
    await blockGitHub(page);
    await page.goto(`/${route}`);
    await waitForHydration(page);
    const banner = page.getByTestId("sign-in-banner");
    await expect(banner).toContainText("Sign in again to open guide/intro.md");
    await expect(banner.getByRole("button", { name: "Sign in again" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Continue without signing in" })).toBeVisible();
    await expect(page.getByTestId("sign-in-again-pane")).toContainText("guide/intro.md");
    // The route is kept and no demo data is shown.
    expect(new URL(page.url()).hash).toBe(route);
    await expect(page.getByText("sample data")).toHaveCount(0);
    // The banner lives inside an aria-live region (NF-22).
    const region = page.getByTestId("sign-in-banner-region");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region.getByTestId("sign-in-banner")).toBeVisible();
  });

  test("f38_continue_without_signing_in", async ({ page, isMobile }) => {
    // F-38
    await blockGitHub(page);
    await page.goto(`/${route}`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Continue without signing in" }).click();
    await expect(page.getByTestId("sign-in-banner")).toHaveCount(0);
    await expect(page.getByTestId("sign-in-again-pane")).toHaveCount(0);
    if (!isMobile) await expect(page.getByText("getting-started.md").first()).toBeVisible(); // demo data
    expect(await page.evaluate((m) => localStorage.getItem(m), MARKER)).toBeNull();
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByTestId("sign-in-banner")).toHaveCount(0);
    await expect(page.getByTestId("sign-in-again-pane")).toHaveCount(0);
  });

  test("t18_keyboard_reaches_sign_in_again_and_settings_sign_in", async ({ page, isMobile }) => {
    // NF-18: keyboard-only reach of Sign in again (banner) and Sign in (Settings).
    test.skip(isMobile, "keyboard focus order is a desktop concern");
    await blockGitHub(page);
    await page.goto(`/${route}`);
    await waitForHydration(page);
    const reach = async (name: string) => {
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        const label = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el ? (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim() : "";
        });
        if (label === name) return true;
      }
      return false;
    };
    expect(await reach("Sign in again")).toBe(true);
    expect(await reach("Continue without signing in")).toBe(true);
    expect(await reach("Settings")).toBe(true);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "GitHub Connection" }).focus();
    await page.keyboard.press("Enter");
    expect(await reach("Sign in with GitHub")).toBe(true);
  });
});

test.describe("worker down", () => {
  test("nf13_worker_down_pat_and_demo_unaffected", async ({ page }) => {
    // NF-13: /api/auth/* answering 503 does not affect demo mode or the PAT form.
    await page.route("**/api/auth/**", (route) => route.fulfill({ status: 503, body: "down" }));
    await blockGitHub(page);
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByText("demo mode with sample data")).toBeVisible();
    await openSettings(page);
    await page.getByRole("button", { name: "Use a personal access token" }).click();
    await page.getByPlaceholder("ghp_...").fill("ghp_fake");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("mardoc_github_token"))).toBe("ghp_fake");
  });
});
