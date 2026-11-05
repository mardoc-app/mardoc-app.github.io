/**
 * WP-11 / F-80 to F-82: the repo tree starts collapsed, a deep link reveals,
 * highlights and scrolls to its file, and open folders survive a reload.
 * GitHub is mocked; the tree holds a/b/c.md below 40 sibling files.
 */
import { test, expect, type Page } from "@playwright/test";
import { openSidebar, waitForHydration, clickInVisibleSidebar, openTreeFolder } from "./fixtures/helpers";

const SHA = "a".repeat(40);
const filler = Array.from({ length: 40 }, (_, i) => `a/b/aa-${String(i).padStart(2, "0")}.md`);
const paths = ["a", "a/b", ...filler, "a/b/c.md", "m", "m/n.md", "x", "x/y.md", "README.md"];

async function mockGitHub(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake-test-token"));
  await page.route("https://raw.githubusercontent.com/**", (route) => route.abort());
  await page.route("https://api.github.com/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data: unknown;
    if (path.includes("/commits/")) data = { sha: SHA };
    else if (path.includes("/contents/")) data = { encoding: "base64", content: Buffer.from("# Doc\n\ntext").toString("base64") };
    else if (path.includes("/git/trees/")) {
      data = { tree: paths.map((p) => ({ path: p, type: p.endsWith(".md") ? "blob" : "tree", sha: "s" })) };
    } else if (path.endsWith("/branches")) data = [{ name: "main" }];
    else if (path.endsWith("/pulls")) data = [];
    else if (path === "/graphql") data = { data: {} };
    else if (path === "/repos/o/r") data = { default_branch: "main" };
    else { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: path }) }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
}

function folderRows(page: Page) {
  return page.locator("button[aria-expanded]").locator("visible=true");
}

async function showTree(page: Page) {
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
  await expect(folderRows(page).first()).toBeVisible();
}

test("f80_repo_opens_with_folders_collapsed", async ({ page }) => {
  await mockGitHub(page);
  await page.goto("/#/o/r");
  await showTree(page);
  const rows = folderRows(page);
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) await expect(row).toHaveAttribute("aria-expanded", "false");
});

test("f81_deep_link_reveals_highlights_and_scrolls", async ({ page }) => {
  await mockGitHub(page);
  await page.goto("/#/o/r/blob/main/a/b/c.md");
  await showTree(page);
  const open = folderRows(page).and(page.locator('[aria-expanded="true"]'));
  await expect(open).toHaveCount(2);
  await expect(open.nth(0)).toHaveText("a");
  await expect(open.nth(1)).toHaveText("b");
  const row = page.locator("button", { hasText: /c\.md$/ }).locator("visible=true").first();
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/bg-\[var\(--accent-muted\)\]/);
  await expect
    .poll(() =>
      row.evaluate((el) => {
        let scroller: HTMLElement | null = el.parentElement;
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        if (!scroller) return false;
        const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
        return scroller.scrollTop > 0 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
      })
    )
    .toBe(true);
});

test("f82_folder_state_survives_file_open_and_reload", async ({ page }) => {
  await mockGitHub(page);
  await page.goto("/#/o/r");
  await showTree(page);
  await openTreeFolder(page, "x");
  await page.locator("button", { hasText: "README.md" }).locator("visible=true").first().click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await page.reload();
  await showTree(page);
  await expect(folderRows(page).and(page.locator('[aria-expanded="true"]'))).toHaveCount(1);
  await expect(page.locator("button", { hasText: "y.md" }).locator("visible=true").first()).toBeVisible();
});
