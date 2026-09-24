import { test, expect } from "@playwright/test";

test("editor revisits render repeated Unicode diagrams and preserve their source", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("mardoc_github_token", "fake");
    localStorage.setItem("mardoc_profile", "1");
  });
  const diagram = '```mermaid\ngraph TD\nA["Start 日本語"] --> B["Review"]\n```';
  const markdown = `# Diagram review\n\n${diagram}\n\n${diagram}`;
  await page.route("https://api.github.com/**", async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const data = path.includes("/commits/") ? {sha:"a".repeat(40)}
      : path.includes("/git/trees/") ? {tree:[]}
      : path.includes("/contents/") ? {encoding:"base64",content:Buffer.from(path.endsWith("plain.md") ? "# Plain document" : markdown).toString("base64")}
      : {default_branch:"main"};
    await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.goto("/#/acme/docs/blob/main/first.md");
  const images = page.locator('.ProseMirror img[data-mermaid-source]');
  await expect(images).toHaveCount(2, {timeout:20_000});
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.evaluate(() => { location.hash = "#/acme/docs/blob/main/plain.md"; });
  await expect(page.locator(".ProseMirror h1")).toHaveText("Plain document");
  await page.evaluate(() => { location.hash = "#/acme/docs/blob/main/revisit.md"; });
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(images.first()).toHaveAttribute("data-mermaid-source", /Start 日本語/);
  console.log("Mermaid prepare: cold, plain, reused (ms)", await page.evaluate(() =>
    performance.getEntriesByName("mardoc:mermaid-prepare", "measure").map(entry => entry.duration)));
});
