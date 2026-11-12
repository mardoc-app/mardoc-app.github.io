/**
 * F-86, F-88, F-89: a link's `mode` opens a Markdown PR file in that view
 * when the screen can show it; a picked mode carries to the next file; a
 * link's mode is shown but not remembered.
 */
import { test, expect, type Page } from "@playwright/test";
import { openSidebar, clickVisibleText } from "./fixtures/helpers";

const FILES = ["docs/guide.md", "readme.md"];
const TITLES: Record<string, string> = { "docs/guide.md": "Linked guide", "readme.md": "Readme" };

async function mockPR(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  await page.route("https://api.github.com/**", async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data: unknown;
    if (path.endsWith("/pulls/12/files")) data = FILES.map(filename => ({ filename, status: "added", additions: 3, deletions: 0 }));
    else if (path.endsWith("/comments")) data = [];
    else if (path.includes("/commits/")) data = { sha: "c".repeat(40) };
    else if (path.includes("/git/trees/")) data = { tree: FILES.map(file => ({ path: file, type: "blob", sha: "blob" })) };
    else if (path.endsWith("/branches") || path.endsWith("/pulls")) data = [];
    else if (path === "/repos/acme/docs") data = { default_branch: "main" };
    else if (path === "/graphql") data = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };
    else if (path.includes("/contents/")) {
      const file = path.split("/contents/")[1];
      data = { encoding: "base64", content: Buffer.from(`# ${TITLES[file] ?? file}\n\nBody of ${file}.`).toString("base64") };
    } else if (path === "/repos/acme/docs/pulls/12") data = { number: 12, title: "Modes", user: { login: "author" }, state: "open",
      base: { ref: "main", sha: "a".repeat(40), repo: { full_name: "acme/docs" } },
      head: { ref: "topic", sha: "b".repeat(40), repo: { full_name: "acme/docs" } } };
    else { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: `Unexpected fixture request: ${path}` }) }); return; }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
}

const GUIDE = "/#/acme/docs/pull/12/file/docs/guide.md";
const pressed = (page: Page, name: string) => page.locator(`button[aria-pressed='true']`).filter({ hasText: new RegExp(`^${name}$`) });
const guideHeading = (page: Page) => page.getByRole("heading", { name: "Linked guide", exact: true }).first();
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("mardoc_view_mode"));

async function openReadme(page: Page) {
  await openSidebar(page);
  await clickVisibleText(page, "readme.md");
  await expect(page.getByRole("heading", { name: "Readme", exact: true }).first()).toBeVisible();
}

test("f86_preview_link_opens_preview", async ({ page }) => {
  await mockPR(page);
  await page.goto(`${GUIDE}?mode=preview`);
  await expect(guideHeading(page)).toBeVisible();
  await expect(pressed(page, "Preview")).toBeVisible();
  await expect(page).toHaveURL(/guide\.md\?mode=preview$/);
});

test("f89_split_link_on_a_phone_opens_inline", async ({ page }, info) => {
  await mockPR(page);
  await page.goto(`${GUIDE}?mode=split`);
  await expect(guideHeading(page)).toBeVisible();
  if (info.project.name === "mobile") await expect(pressed(page, "Inline Diff")).toBeVisible();
  else await expect(pressed(page, "Side by Side")).toBeVisible();
});

test("f89_unknown_mode_is_ignored", async ({ page }) => {
  await mockPR(page);
  await page.goto(`${GUIDE}?mode=sideways`);
  await expect(guideHeading(page)).toBeVisible();
  await expect(pressed(page, "Inline Diff")).toBeVisible();
});

test("f88_picked_mode_is_used_for_the_next_file", async ({ page }) => {
  await mockPR(page);
  await page.goto(GUIDE);
  await expect(guideHeading(page)).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(pressed(page, "Preview")).toBeVisible();
  await expect(page).toHaveURL(/guide\.md\?mode=preview$/);
  expect(JSON.parse((await stored(page))!)).toEqual({ md: "preview" });
  await openReadme(page);
  await expect(pressed(page, "Preview")).toBeVisible();
  await expect(page).toHaveURL(/file\/readme\.md$/);
});

test("f88_link_mode_is_not_remembered", async ({ page }) => {
  await mockPR(page);
  await page.goto(`${GUIDE}?mode=preview`);
  await expect(pressed(page, "Preview")).toBeVisible();
  expect(await stored(page)).toBeNull();
  await openReadme(page);
  await expect(pressed(page, "Inline Diff")).toBeVisible();
  await expect(page).toHaveURL(/file\/readme\.md$/);
});
