/**
 * F-84 / F-85: a PR file link names the file by path, and a legacy index
 * link still opens. The PR files response is held until each test releases
 * it, so the link is read before the app knows the files.
 */
import { test, expect, type Page } from "@playwright/test";
import { openSidebar, clickVisibleText } from "./fixtures/helpers";

// The PR gained "aaa-added.md" ahead of the files a sender linked to.
const FILES = ["aaa-added.md", "docs/guide.md", "docs/my notes 100%.md", "readme.md"];
const TITLES: Record<string, string> = {
  "aaa-added.md": "Added later", "docs/guide.md": "Linked guide",
  "docs/my notes 100%.md": "Notes with spaces", "readme.md": "Readme",
};

async function mockPR(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  let release!: () => void, requested = false;
  const files = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://api.github.com/**", async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data: unknown;
    if (path.endsWith("/pulls/12/files")) {
      requested = true;
      await files;
      data = FILES.map(filename => ({ filename, status: "added", additions: 3, deletions: 0 }));
    } else if (path.endsWith("/comments")) data = [];
    else if (path === "/graphql") data = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };
    else if (path.includes("/contents/")) {
      const file = path.split("/contents/")[1];
      data = { encoding: "base64", content: Buffer.from(`# ${TITLES[file] ?? file}\n\nBody of ${file}.`).toString("base64") };
    } else if (path === "/repos/acme/docs/pulls/12") data = { number: 12, title: "Links by path", user: { login: "author" }, state: "open",
      base: { ref: "main", sha: "a".repeat(40), repo: { full_name: "acme/docs" } },
      head: { ref: "topic", sha: "b".repeat(40), repo: { full_name: "acme/docs" } } };
    else { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: `Unexpected fixture request: ${path}` }) }); return; }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  return { release, filesRequested: () => requested };
}

const heading = (page: Page, file: string) => page.getByRole("heading", { name: TITLES[file], exact: true }).first();

test("f84_cold_path_link_opens_the_file_after_the_manifest", async ({ page }) => {
  const { release, filesRequested } = await mockPR(page);
  const link = "/#/acme/docs/pull/12/file/docs/guide.md";
  await page.goto(link);
  await expect.poll(filesRequested).toBe(true);
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12\/file\/docs\/guide\.md$/);
  release();
  await expect(heading(page, "docs/guide.md")).toBeVisible();
  await expect(heading(page, "aaa-added.md")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12\/file\/docs\/guide\.md$/);
});

test("f84_path_with_spaces_and_percent_opens", async ({ page }) => {
  const { release } = await mockPR(page);
  release();
  await page.goto("/#/acme/docs/pull/12/file/docs/my%20notes%20100%25.md");
  await expect(heading(page, "docs/my notes 100%.md")).toBeVisible();
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12\/file\/docs\/my%20notes%20100%25\.md$/);
});

test("f84_clicking_a_file_writes_the_path_form_and_back_returns", async ({ page }) => {
  const { release } = await mockPR(page);
  release();
  await page.goto("/#/acme/docs/pull/12");
  await expect(heading(page, "aaa-added.md")).toBeVisible();
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12$/);
  await openSidebar(page);
  await clickVisibleText(page, "guide.md");
  await expect(heading(page, "docs/guide.md")).toBeVisible();
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12\/file\/docs\/guide\.md$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12$/);
  await expect(heading(page, "aaa-added.md")).toBeVisible();
});

test("f84_missing_path_opens_the_pr_with_a_message", async ({ page }) => {
  const { release } = await mockPR(page);
  release();
  await page.goto("/#/acme/docs/pull/12/file/docs/gone.md");
  await expect(page.getByText("The linked file is not in this PR.", { exact: true })).toBeVisible();
  await expect(heading(page, "aaa-added.md")).toBeVisible();
});

test("f85_legacy_index_link_opens_and_shows_the_path_form", async ({ page }) => {
  const { release, filesRequested } = await mockPR(page);
  await page.goto("/#/acme/docs/pull/12/files/1");
  await expect.poll(filesRequested).toBe(true);
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12\/files\/1$/);
  release();
  await expect(heading(page, "docs/guide.md")).toBeVisible();
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/12\/file\/docs\/guide\.md$/);
});
