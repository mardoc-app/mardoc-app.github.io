import { test, expect, type Page, type Locator } from "@playwright/test";

// #149: the header's share actions stay on one line, do not overlap the
// revision label, and the "Link copied" confirmation does not move them.

const A = "a".repeat(40);
const filePath = "docs/spec.md";

async function mockGitHub(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mardoc_github_token", "fake-test-token");
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async (text: string) => { (window as any).__copiedLink = text; } } });
  });
  await page.route("https://raw.githubusercontent.com/**", route => route.abort());
  await page.route("https://api.github.com/**", async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data: unknown;
    if (path.includes("/commits/")) data = { sha: A };
    else if (path.includes("/contents/")) data = { encoding: "base64", content: Buffer.from("# Spec\n\nText.").toString("base64") };
    else if (path.includes("/git/trees/")) data = { tree: [{ path: "docs", type: "tree", sha: "d" }, { path: filePath, type: "blob", sha: "b" }] };
    else if (path.endsWith("/branches")) data = [{ name: "main" }];
    else if (path.endsWith("/pulls")) data = [];
    else if (path === "/repos/acme/docs") data = { default_branch: "main" };
    else { await route.fulfill({ status: 404, contentType: "application/json", body: "{}" }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
}

const box = async (l: Locator) => (await l.boundingBox())!;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function expectHeaderTidy(page: Page) {
  const branch = page.getByRole("button", { name: "Copy branch link" });
  const revision = page.getByRole("button", { name: "Copy revision link" });
  await expect(branch).toBeVisible();
  const controls = [branch, revision];
  const label = page.getByText(/^Revision [0-9a-f]{7}$/);
  if (await label.isVisible()) controls.push(label);
  for (const c of controls) {
    // One line: the content fits its box, nothing wraps or spills.
    const fits = await c.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
    expect(fits).toBe(true);
  }
  const boxes = await Promise.all(controls.map(box));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
}

for (const width of [1280, 2000]) {
  test(`issue149_share_actions_fit_on_one_line_at_${width}px`, async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop widths");
    await page.setViewportSize({ width, height: 900 });
    await mockGitHub(page);
    await page.goto(`/#/acme/docs/blob/main/${filePath}`);
    await expect(page.locator(".ProseMirror h1")).toHaveText("Spec");
    await expectHeaderTidy(page);
  });
}

test("issue149_share_actions_fit_and_do_not_overlap_on_mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project");
  await mockGitHub(page);
  await page.goto(`/#/acme/docs/blob/main/${filePath}`);
  await expect(page.locator(".ProseMirror h1")).toHaveText("Spec");
  await expectHeaderTidy(page);
});

test("issue149_link_copied_does_not_move_the_header_controls", async ({ page }) => {
  await mockGitHub(page);
  await page.goto(`/#/acme/docs/blob/main/${filePath}`);
  await expect(page.locator(".ProseMirror h1")).toHaveText("Spec");
  const refresh = page.getByRole("button", { name: "Refresh document", exact: true });
  const branch = page.getByRole("button", { name: "Copy branch link" });
  const before = [await box(refresh), await box(branch)];
  await branch.click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copiedLink)).toContain(`/blob/main/${filePath}`);
  const after = [await box(refresh), await box(branch)];
  expect(after).toEqual(before);
});
