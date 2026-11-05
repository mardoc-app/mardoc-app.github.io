/**
 * Shared Playwright helpers for MarDoc e2e tests.
 *
 * Every spec in e2e/ should import its navigation + selection
 * helpers from here so the drawer/sidebar/hidden-element quirks
 * are centralized. When page.tsx changes, the fixture updates once
 * and every spec follows.
 */
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Wait for the React app to hydrate. Works on both desktop (where
 * the Sidebar's PRs button is inline in the DOM) and mobile (where
 * the hamburger button is the only hydrated element visible).
 *
 * Both buttons are in the prerendered HTML, so they show the page, not
 * a hydrated one; with `next dev` the load event can also come before
 * hydration. Next's app router adds <next-route-announcer> in an effect
 * of the hydration commit, after the page's own effects (such as the
 * global keyboard shortcut listener), so wait for it too.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const prsBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "PRs"
      );
      const hamburger = document.querySelector('button[aria-label="Open navigation"]');
      const hydrated = !!document.querySelector("next-route-announcer");
      return (!!prsBtn || !!hamburger) && hydrated;
    },
    { timeout: 15_000 }
  );
}

/** Open the sidebar drawer on mobile. No-op on desktop. */
export async function openSidebar(page: Page): Promise<void> {
  const hamburger = page.locator('button[aria-label="Open navigation"]');
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    // Wait for the drawer slide-in transition
    await page.waitForTimeout(350);
  }
}

/**
 * Click a button by exact text inside whichever sidebar copy is
 * visible. page.tsx keeps a `hidden md:flex` desktop sidebar in
 * the DOM even on mobile (for layout continuity), so a plain
 * `button:has-text("Files")` matches two elements. The :visible
 * filter disambiguates.
 */
export async function clickInVisibleSidebar(page: Page, text: string): Promise<void> {
  await page
    .locator("button", { hasText: new RegExp(`^${text}$`) })
    .locator("visible=true")
    .first()
    .click();
}

/** Click any element by visible text, scoping to the visible copy. */
export async function clickVisibleText(page: Page, text: string | RegExp): Promise<void> {
  await page.getByText(text).locator("visible=true").first().click();
}

/** Open a markdown file in demo mode and return the ProseMirror locator. */
export async function openMarkdownFile(
  page: Page,
  filename: string | RegExp = /README\.md/
): Promise<Locator> {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
  await clickVisibleText(page, filename);
  const proseMirror = page.locator(".ProseMirror");
  await expect(proseMirror).toBeVisible({ timeout: 10_000 });
  await waitForEditorContent(page);
  return proseMirror;
}

/**
 * Wait until the editor holds the prepared document. The editor first
 * mounts with the raw file, then replaces it once Mermaid diagrams are
 * rendered, which moves the cursor to the end of the document and drops
 * anything inserted before. The word count is set right after that
 * replacement, so editor actions are safe once it is in the DOM (it is
 * hidden on phones, hence attached rather than visible).
 */
export async function waitForEditorContent(page: Page): Promise<void> {
  await expect(page.locator('span[title$="min read"]')).toBeAttached({ timeout: 10_000 });
}

/**
 * Click inside an editor block and wait until the editor has moved its
 * cursor there. ProseMirror reads a click's caret from the browser's
 * selectionchange event, and ignores it once focus has left the editor,
 * so a toolbar button pressed before that event is handled acts on the
 * previous cursor.
 */
export async function placeCursorIn(target: Locator): Promise<void> {
  await target.click();
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const editor = (el.closest(".ProseMirror") as any)?.editor;
        return !!editor && el.contains(editor.view.domAtPos(editor.state.selection.from).node);
      })
    )
    .toBe(true);
}

/** Open an HTML file from the demo repo file tree. */
export async function openHtmlFile(
  page: Page,
  filename: string | RegExp = /architecture-overview\.html/
): Promise<void> {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
  await clickVisibleText(page, filename);
  await expect(page.locator("iframe")).toBeVisible({ timeout: 10_000 });
}

/** Open a pull request from the demo list by partial title. */
export async function openPullRequest(
  page: Page,
  titleMatch: string | RegExp
): Promise<void> {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "PRs");
  await clickVisibleText(page, titleMatch);
  // Wait until the PRDetail toolbar's Approve button exists. Use
  // .first() because the text "Approve" could also appear inside the
  // review modal header, so strict-mode resolution needs disambiguation.
  await expect(
    page.locator("button", { hasText: /^Approve$/ }).first()
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Select text inside an iframe programmatically and fire a mouseup
 * so the iframe's selection script (from feature 033) posts its
 * mardoc-html-selection message. Returns the text that was selected.
 */
export async function selectTextInsideIframe(
  page: Page,
  iframeSelector: string,
  targetTextSelector = "p",
  maxLength = 20
): Promise<string> {
  const iframe = page.frameLocator(iframeSelector);
  return await iframe.locator(targetTextSelector).first().evaluate(
    (el, max) => {
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) return "";
      const fullText = node.textContent || "";
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(max, fullText.length));
      const sel = window.getSelection();
      if (!sel) return "";
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return sel.toString();
    },
    maxLength
  );
}

/**
 * Wait until the PR header counts `count` unresolved comments, that is,
 * until the PR's comments have loaded. On phones the Comments sheet opens
 * when the comments reach the diff viewer after the document and stays
 * closed when they arrive first, so specs that expect it closed hold the
 * mocked document response on this.
 */
export async function prCommentsLoaded(page: Page, count: number): Promise<void> {
  await expect(page.getByText(String(count), { exact: true }).first()).toBeVisible();
}

/** Open the nonmodal tools tray without toggling an already open tray closed. */
export async function openReviewTools(page: Page): Promise<void> {
  const commentsSheet = page.getByRole("dialog", { name: "Comments", exact: true });
  if (await commentsSheet.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(commentsSheet).toBeHidden();
  }
  const toggle = page.getByRole("button", { name: "Review tools", exact: true });
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(page.getByRole("region", { name: "Review tools", exact: true })).toBeVisible();
}
