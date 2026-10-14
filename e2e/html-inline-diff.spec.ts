import { test, expect, type Page } from "@playwright/test";

const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);
const makeHtml = (head: boolean) => [
  "<!doctype html>",
  '<html><head><style>body{font:18px sans-serif;color:rgb(23,45,67)}.brand{border-left:7px solid rgb(12,34,56)}#late{margin-top:1100px}</style></head><body>',
  '<h1>Architecture review</h1>',
  `<p id="intro" class="brand">The ${head ? "desktop" : "tray"} app owns <strong>capture</strong> and <a id="guide" href="${head ? "#new-guide" : "#old-guide"}">the guide</a>.</p>`,
  head ? '<p id="added">Entirely new setup instructions.</p>' : '<p id="removed">Retired installation instructions.</p>',
  '<p id="unchanged">An unchanged paragraph with <em>formatting</em>.</p>',
  '<svg width="360" height="80" role="img">',
  `<title>${head ? "New architecture title" : "Old architecture title"}</title>`,
  `<desc>${head ? "New screen reader description" : "Old screen reader description"}</desc>`,
  `<text id="diagram-label" x="10" y="35">${head ? "Settings" : "Tray"} application</text>`,
  '</svg>',
  `<p id="late">${head ? "New" : "Old"} delivery details.</p>`,
  '</body></html>',
].join("\n");

const htmlFrame = (page: Page, path = "deck.html") => page.frameLocator(`iframe[title="${path}"]`);

async function setup(page: Page) {
  const reviews: { comments?: { path: string; line: number; side: string; body: string }[] }[] = [];
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  await page.route("https://api.github.com/**", async route => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    let data: unknown;
    if (route.request().method() === "POST" && path.endsWith("/pulls/12/reviews")) {
      reviews.push(route.request().postDataJSON());
      data = { id: 1, state: "COMMENTED", user: { login: "reviewer" } };
    } else if (path.endsWith("/pulls/12/files")) {
      data = ["deck.html", "second.html"].map(filename => ({ filename, status: "modified" }));
    } else if (path.endsWith("/pulls/12/comments") || path.endsWith("/issues/12/comments")) {
      data = [];
    } else if (path === "/graphql") {
      data = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };
    } else if (path.includes("/contents/")) {
      const head = url.searchParams.get("ref") !== baseSha;
      const source = path.endsWith("second.html")
        ? `<html><body><h1>Second changed page</h1><p>${head ? "New" : "Old"} second page.</p></body></html>`
        : makeHtml(head);
      data = { encoding: "base64", content: Buffer.from(source).toString("base64") };
    } else {
      data = { number: 12, title: "Rendered HTML changes", state: "open", user: { login: "reviewer" },
        base: { ref: "main", sha: baseSha, repo: { full_name: "acme/docs" } },
        head: { ref: "topic", sha: headSha, repo: { full_name: "acme/docs" } } };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/#/acme/docs/pull/12");
  await expect(htmlFrame(page).locator("#intro")).toBeVisible();
  await page.keyboard.press("Escape");
  return reviews;
}

async function selectElement(page: Page, selector: string) {
  await htmlFrame(page).locator(selector).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
}

test("inline HTML marks word and block changes while retaining formatting and page styles", async ({ page }) => {
  await setup(page);
  const frame = htmlFrame(page);
  await expect(page.getByRole("button", { name: "Inline Diff", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(frame.locator('#intro [data-mardoc-diff="added"]')).toHaveText("desktop");
  await expect(frame.locator('#intro [data-mardoc-diff="removed"]')).toHaveText("tray");
  await expect(frame.locator('#added')).toContainText("Entirely new setup instructions.");
  await expect(frame.locator('#removed')).toContainText("Retired installation instructions.");
  expect(await frame.locator('#added').evaluate(el => !!el.closest('[data-mardoc-diff="added"]'))).toBe(true);
  expect(await frame.locator('#removed').evaluate(el => !!el.closest('[data-mardoc-diff="removed"]'))).toBe(true);
  await expect(frame.locator('#intro strong')).toHaveText("capture");
  await expect(frame.locator('#guide')).toHaveText("the guide");
  await expect(frame.locator('#unchanged em')).toHaveText("formatting");
  await expect(frame.locator('#intro')).toHaveCSS("border-left-width", "7px");
  await expect(frame.locator('body')).toHaveCSS("color", "rgb(23, 45, 67)");
  expect(await frame.locator('[data-mardoc-change-id]').count()).toBeGreaterThan(0);
  await expect(page.getByText(/\d+ changed spots/).first()).toBeVisible();
});

test("next and previous change controls focus and reveal distinct regions", async ({ page }) => {
  await setup(page);
  const focusedRegion = () => htmlFrame(page).locator('[data-mardoc-change-id]').evaluateAll(regions => {
    const active = document.activeElement;
    const region = regions.find(element => element === active || element.contains(active));
    return region?.getAttribute("data-mardoc-change-id") ?? null;
  });
  await page.getByRole("button", { name: "Next change", exact: true }).click();
  await expect.poll(focusedRegion).not.toBeNull();
  const first = await focusedRegion();
  await expect(htmlFrame(page).locator(`[data-mardoc-change-id="${first}"]`).first()).toBeInViewport();
  await page.getByRole("button", { name: "Next change", exact: true }).click();
  await expect.poll(focusedRegion).not.toBe(first);
  const second = await focusedRegion();
  expect(second).not.toBeNull();
  await expect(htmlFrame(page).locator(`[data-mardoc-change-id="${second}"]`).first()).toBeInViewport();
  await page.getByRole("button", { name: "Previous change", exact: true }).click();
  await expect.poll(focusedRegion).toBe(first);
});

test("clean revisions and source diff remain available alongside inline review", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Head (new)", exact: true }).click();
  await expect(htmlFrame(page).locator('#intro')).toHaveText("The desktop app owns capture and the guide.");
  await expect(htmlFrame(page).locator('[data-mardoc-diff]')).toHaveCount(0);
  await expect(htmlFrame(page).locator('#removed')).toHaveCount(0);
  await page.getByRole("button", { name: "Base (old)", exact: true }).click();
  await expect(htmlFrame(page).locator('#intro')).toHaveText("The tray app owns capture and the guide.");
  await expect(htmlFrame(page).locator('[data-mardoc-diff]')).toHaveCount(0);
  await expect(htmlFrame(page).locator('#added')).toHaveCount(0);
  await page.getByRole("button", { name: "Inline Diff", exact: true }).click();
  await expect(htmlFrame(page).locator('#intro [data-mardoc-diff="added"]')).toHaveText("desktop");
  await page.getByRole("button", { name: "Source Diff", exact: true }).click();
  await expect(page.getByText(/Raw HTML source diff/)).toBeVisible();
  await page.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(htmlFrame(page).locator('#intro [data-mardoc-diff="added"]')).toHaveText("desktop");
});

test("SVG labels and nonvisual metadata changes are reviewable", async ({ page }) => {
  await setup(page);
  await expect(htmlFrame(page).locator('#diagram-label [data-mardoc-diff="added"]')).toHaveText("Settings");
  await expect(htmlFrame(page).locator('#diagram-label [data-mardoc-diff="removed"]')).toHaveText("Tray");
  const summary = page.getByRole("region", { name: "Nonvisual HTML changes", exact: true });
  await expect(summary).toBeVisible();
  for (const text of ["Old architecture title", "New architecture title", "Old screen reader description", "New screen reader description", "#old-guide", "#new-guide"]) {
    await expect(summary.getByText(text, { exact: false })).toBeVisible();
  }
});

test("changed page index opens another HTML page", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: /^All changed pages/ }).click();
  const index = page.getByRole("navigation", { name: "All changed HTML pages", exact: true });
  await expect(index).toBeVisible();
  await index.getByRole("link", { name: /second\.html/ }).click();
  await expect(htmlFrame(page, "second.html").getByRole("heading", { name: "Second changed page" })).toBeVisible();
  await expect(htmlFrame(page, "second.html").locator('[data-mardoc-diff="added"]')).toContainText("New");
});

test("head-only selection retains source lines and removed or mixed selections cannot create comments", async ({ page }) => {
  const reviews = await setup(page);
  // Observe the iframe protocol as well as the UI: an unsupported selection
  // must not silently produce a head-side source location.
  await page.evaluate(() => {
    (window as any).__selectionMessages = [];
    window.addEventListener("message", event => {
      if (event.data?.type === "mardoc-html-selection") (window as any).__selectionMessages.push(event.data);
    });
  });
  for (const selector of ['#intro [data-mardoc-diff="removed"]', '#intro']) {
    await selectElement(page, selector);
    // The frame's event is deferred by one task. Round-trip a sentinel after it
    // to assert rejection without an arbitrary delay.
    await htmlFrame(page).locator("body").evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
    expect(await page.evaluate(() => (window as any).__selectionMessages)).toEqual([]);
    await expect(page.getByPlaceholder("Write your comment...")).toHaveCount(0);
  }
  await selectElement(page, '#intro [data-mardoc-diff="added"]');
  await expect(page.getByPlaceholder("Write your comment...")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__selectionMessages.at(-1))).toMatchObject({ text: "desktop", startLine: 4, endLine: 4 });
  await htmlFrame(page).locator("body").evaluate(() => window.getSelection()!.removeAllRanges());
  await page.getByPlaceholder("Write your comment...").fill("Explain the desktop ownership change");
  await page.getByRole("button", { name: "Comment", exact: true }).last().click();
  await page.getByRole("button", { name: "Finish Review (1)", exact: true }).click();
  await page.getByRole("button", { name: "Submit review", exact: true }).click();
  await expect.poll(() => reviews.length).toBe(1);
  expect(reviews[0].comments).toEqual([expect.objectContaining({ path: "deck.html", line: 4, side: "RIGHT", body: expect.stringContaining("desktop") })]);
});
