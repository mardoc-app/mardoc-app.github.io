/**
 * F-86, F-88, F-89: a link's `mode` opens a Markdown PR file in that view
 * when the screen can show it; a picked mode carries to the next file; a
 * link's mode is shown but not remembered.
 */
import { test, expect, type Page } from "@playwright/test";
import { openSidebar, clickVisibleText } from "./fixtures/helpers";

const FILES = ["deck-a.html", "deck-b.html", "docs/guide.md", "readme.md"];
const TITLES: Record<string, string> = { "docs/guide.md": "Linked guide", "readme.md": "Readme" };

async function mockPR(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  await page.route("https://api.github.com/**", async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data: unknown;
    if (path.endsWith("/pulls/12/files")) data = FILES.map(filename => ({ filename, status: filename.endsWith(".html") ? "modified" : "added", additions: 3, deletions: 0 }));
    else if (path.endsWith("/comments")) data = [];
    else if (path.includes("/commits/")) data = { sha: "c".repeat(40) };
    else if (path.includes("/git/trees/")) data = { tree: FILES.map(file => ({ path: file, type: "blob", sha: "blob" })) };
    else if (path.endsWith("/branches") || path.endsWith("/pulls")) data = [];
    else if (path === "/repos/acme/docs") data = { default_branch: "main" };
    else if (path === "/graphql") data = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };
    else if (path.includes("/contents/")) {
      const file = path.split("/contents/")[1];
      const isBase = new URL(route.request().url()).searchParams.get("ref") === "a".repeat(40);
      const body = file.endsWith(".html") ? `<html><body><h1>${file}</h1><p>${isBase ? "Old" : "New"} text.</p></body></html>`
        : `# ${TITLES[file] ?? file}\n\nBody of ${file}.`;
      data = { encoding: "base64", content: Buffer.from(body).toString("base64") };
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

const DECK_A = "/#/acme/docs/pull/12/file/deck-a.html";
const toggle = (page: Page, name: string) => page.locator("button[aria-pressed='true']").filter({ hasText: name });

async function openFile(page: Page, name: string, heading: string) {
  await openSidebar(page);
  await clickVisibleText(page, name);
  await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
}

test("f86_base_link_opens_an_html_file_on_base", async ({ page }) => {
  await mockPR(page);
  await page.goto(`${DECK_A}?mode=base`);
  await expect(page.frameLocator('iframe[title="deck-a.html"]').getByText("Old text.")).toBeVisible();
  await expect(toggle(page, "Base (old)")).toBeVisible();
  await expect(page).toHaveURL(/deck-a\.html\?mode=base$/);
});

test("f86_source_link_opens_source_diff", async ({ page }) => {
  await mockPR(page);
  await page.goto(`${DECK_A}?mode=source`);
  await expect(toggle(page, "Source Diff")).toBeVisible();
  expect(await stored(page)).toBeNull();
});

test("f88_html_and_markdown_modes_are_remembered_separately", async ({ page }) => {
  await mockPR(page);
  await page.goto(DECK_A);
  await expect(page.frameLocator('iframe[title="deck-a.html"]').getByText("New text.")).toBeVisible();
  await page.getByRole("button", { name: "Base (old)", exact: true }).click();
  await expect(toggle(page, "Base (old)")).toBeVisible();
  await openFile(page, "guide.md", "Linked guide");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(toggle(page, "Preview")).toBeVisible();
  expect(JSON.parse((await stored(page))!)).toEqual({ md: "preview", html: "base" });
  await openSidebar(page);
  await clickVisibleText(page, "deck-b.html");
  await expect(page.frameLocator('iframe[title="deck-b.html"]').getByText("Old text.")).toBeVisible();
  await expect(toggle(page, "Base (old)")).toBeVisible();
  await openFile(page, "readme.md", "Readme");
  await expect(toggle(page, "Preview")).toBeVisible();
});
