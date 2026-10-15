import { test, expect } from "@playwright/test";
import { openSidebar, clickVisibleText } from "./fixtures/helpers";

test("mixed PRs retain document review and show code, renamed, deleted and binary files", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  let sourceDownloads = 0;
  await page.route("https://api.github.com/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith("/files")) data = [
      { filename: "main.go", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-old()\n+new()" },
      { filename: "guide.md", status: "added", additions: 1, deletions: 0 },
      { filename: "new.rs", previous_filename: "old.rs", status: "renamed", additions: 0, deletions: 0 },
      { filename: "removed.py", status: "removed", additions: 0, deletions: 1, patch: "@@ -1 +0,0 @@\n-print('old')" },
      { filename: "image.png", status: "added", additions: 0, deletions: 0 },
    ];
    else if (path.endsWith("/comments")) data = [];
    else if (path === "/graphql") data = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };
    else if (path.includes("/contents/")) {
      if (!path.endsWith("guide.md")) sourceDownloads++;
      data = { encoding: "base64", content: Buffer.from("# Guide\n\nReview this document.").toString("base64") };
    } else data = { number: 12, title: "Mixed files", user: { login: "author" }, state: "open",
      base: { ref: "main", sha: "a".repeat(40), repo: { full_name: "acme/repo" } },
      head: { ref: "topic", sha: "b".repeat(40), repo: { full_name: "acme/repo" } } };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/#/acme/repo/pull/12/files/1");
  await expect(page.getByRole("table", { name: "Source diff for main.go" })).toContainText("new()");
  await expect(page.getByRole("link", { name: "Review on GitHub" })).toHaveAttribute("href", /\/pull\/12\/files#diff-[a-f0-9]{64}$/);
  for (const name of ["new.rs", "removed.py", "image.png", "guide.md"]) {
    await openSidebar(page);
    await clickVisibleText(page, name);
    if (name === "guide.md") await expect(page.getByRole("heading", { name: "Guide", exact: true })).toBeVisible();
    if (name === "new.rs") await expect(page.getByText("Renamed without textual changes.")).toBeVisible();
    if (name === "removed.py") await expect(page.getByRole("table")).toContainText("print('old')");
    if (name === "image.png") await expect(page.getByText(/No text preview is available/)).toBeVisible();
  }
  expect(sourceDownloads).toBe(0);
});
