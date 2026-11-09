/**
 * Relative images in an HTML document from a private repository.
 *
 * The raw content CDN answers 404 for a private repository unless the
 * request carries the token, and an <img> cannot send one. Images in a
 * rendered HTML document must therefore load through the authenticated
 * contents API, the same way images in Markdown documents do.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#2a7"/></svg>';
const html = (caption: string) => [
  "<!doctype html>",
  "<html><body>",
  "<h1>Relay design</h1>",
  '<figure><img id="diagram" src="diagrams/relay.svg" alt="Relay components">',
  `<figcaption>${caption}</figcaption></figure>`,
  "</body></html>",
].join("\n");

const frame = (page: Page) => page.frameLocator('iframe[title="docs/design/relay.html"]');

async function openPrivateHtmlPullRequest(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  // A private repository: the CDN refuses unauthenticated requests.
  await page.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 404, body: "404: Not Found" }));
  const pr = {
    number: 7, title: "Relay design", state: "open", user: { login: "reviewer" },
    base: { ref: "main", sha: BASE_SHA, repo: { full_name: "acme/private-docs", private: true } },
    head: { ref: "topic", sha: HEAD_SHA, repo: { full_name: "acme/private-docs", private: true } },
  };
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    const base = url.searchParams.get("ref") === BASE_SHA;
    const content = (text: string) => ({ encoding: "base64", content: Buffer.from(text).toString("base64") });
    const data = path.endsWith("/pulls/7/files") ? [{ filename: "docs/design/relay.html", status: "modified" }]
      : path.endsWith("/pulls/7/comments") || path.endsWith("/issues/7/comments") ? []
      : path === "/graphql" ? { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }
      : path.endsWith("/contents/docs/design/diagrams/relay.svg") ? content(SVG)
      : path.endsWith("/contents/docs/design/relay.html") ? content(html(base ? "Old caption." : "New caption."))
      : pr;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/#/acme/private-docs/pull/7");
  await expect(frame(page).locator("h1")).toHaveText("Relay design");
}

async function expectDiagramLoaded(page: Page) {
  const img = frame(page).locator("#diagram");
  await expect(img).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(120);
}

test("relative image in a private repo HTML document loads in the inline diff", async ({ page }) => {
  await openPrivateHtmlPullRequest(page);
  await expectDiagramLoaded(page);
});

test("relative image in a private repo HTML document loads in the head and base views", async ({ page }) => {
  await openPrivateHtmlPullRequest(page);
  await page.getByRole("button", { name: "Head (new)", exact: true }).click();
  await expect(frame(page).locator("figcaption")).toHaveText("New caption.");
  await expectDiagramLoaded(page);
  await page.getByRole("button", { name: "Base (old)", exact: true }).click();
  await expect(frame(page).locator("figcaption")).toHaveText("Old caption.");
  await expectDiagramLoaded(page);
});
