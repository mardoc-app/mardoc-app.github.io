import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRenderCache } from "@/lib/render-cache";
import { clearMermaidCache, preRenderMermaid, renderMermaidBlocks } from "@/lib/mermaid";
import { blockToHtml } from "@/lib/diff-blocks";
import { highlightCodeBlocks } from "@/lib/highlight";
const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));
const html = '<pre><code class="language-mermaid">graph TD\nA --&gt; B</code></pre>';
beforeEach(() => {
  clearMermaidCache(); vi.clearAllMocks(); document.documentElement.classList.remove("dark");
  mermaid.render.mockImplementation(async (id: string) => ({ svg: `<svg id="${id}"></svg>` }));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test") });
});
afterEach(() => { vi.unstubAllGlobals(); document.documentElement.classList.remove("dark"); });

it("converts 200 unchanged Markdown blocks once across ten review updates", () => {
  const blocks = Array.from({length:200}, (_, i) => `## Section ${i}\n\n**Important** text and a [link](./guide.md).`);
  const render = vi.fn((text: string) => highlightCodeBlocks(blockToHtml(text)));
  const baselineStart = performance.now();
  for (let pass = 0; pass < 10; pass++) blocks.forEach(render);
  const baselineMs = performance.now() - baselineStart;
  expect(render).toHaveBeenCalledTimes(2000);
  render.mockClear();
  const cache = createRenderCache();
  const start = performance.now();
  for (let pass = 0; pass < 10; pass++) blocks.forEach(block => cache(block, render));
  console.log(`200 blocks / 10 updates: baseline ${baselineMs.toFixed(1)}ms / 2000 conversions; cached ${render.mock.calls.length} conversions, ${(performance.now()-start).toFixed(1)}ms (includes cache lookups)`);
  expect(render).toHaveBeenCalledTimes(200);
  expect(cache(blocks[0], render)).toBe(highlightCodeBlocks(blockToHtml(blocks[0])));
});
it("bounds source plus output memory, evicts LRU and never caches errors", () => {
  const cache = createRenderCache(2, 24), render = vi.fn((text: string) => text);
  cache("a",render); cache("b",render); cache("a",render); cache("c",render); cache("b",render);
  expect(render).toHaveBeenCalledTimes(4);
  cache("huge-source",render); cache("huge-source",render);
  expect(render).toHaveBeenCalledTimes(6);
  const fail = vi.fn().mockImplementationOnce(() => { throw new Error("bad"); }).mockReturnValue("ok");
  expect(() => cache("x",fail)).toThrow("bad"); expect(cache("x",fail)).toBe("ok");
});
it("shares editor layout for duplicate diagrams and revisits, keeping source intact", async () => {
  const [first, second] = await Promise.all([preRenderMermaid(html + html), preRenderMermaid(html)]);
  await preRenderMermaid(html);
  expect(mermaid.render).toHaveBeenCalledTimes(1);
  expect(first.match(/data-mermaid-source/g)).toHaveLength(2);
  expect(second).toContain("graph TD");
});
it("separates themes and changed source and clears cached diagrams on session reset", async () => {
  await preRenderMermaid(html);
  document.documentElement.classList.add("dark"); await preRenderMermaid(html);
  await preRenderMermaid(html.replace("A --", "C --"));
  expect(mermaid.render).toHaveBeenCalledTimes(3);
  clearMermaidCache(); await preRenderMermaid(html);
  expect(mermaid.render).toHaveBeenCalledTimes(4);
});
it("retries malformed diagrams without poisoning subsequent layout", async () => {
  const warn = vi.spyOn(console,"warn").mockImplementation(() => {});
  try {
    mermaid.render.mockRejectedValueOnce(new Error("syntax"));
    expect(await preRenderMermaid(html)).toContain("<pre>");
    expect(await preRenderMermaid(html)).toContain("<img");
  } finally { warn.mockRestore(); }
});
it("deduplicates overlapping DOM scans but keeps inline SVG IDs unique", async () => {
  const container = document.createElement("div"); container.innerHTML = html + html;
  await Promise.all([renderMermaidBlocks(container), renderMermaidBlocks(container)]);
  expect(mermaid.render).toHaveBeenCalledTimes(2);
  const ids = [...container.querySelectorAll("svg")].map(svg => svg.id);
  expect(new Set(ids).size).toBe(2);
});
it("evicts editor layouts after the bounded entry limit", async () => {
  for (let i = 0; i < 65; i++) await preRenderMermaid(html.replace("A --", `Node${i} --`));
  await preRenderMermaid(html.replace("A --", "Node0 --"));
  expect(mermaid.render).toHaveBeenCalledTimes(66);
});
it("serializes different-theme work and initializes each render's captured theme", async () => {
  const themes: string[] = [];
  let current = "";
  mermaid.initialize.mockImplementation(config => { current = config.themeVariables.primaryColor; });
  // Force a configuration transition regardless of the previous test's theme.
  document.documentElement.classList.add("dark");
  await preRenderMermaid(html);
  clearMermaidCache();
  mermaid.render.mockImplementation(async () => { themes.push(current); await Promise.resolve(); return {svg:"<svg/>"}; });
  document.documentElement.classList.remove("dark");
  const light = preRenderMermaid(html);
  document.documentElement.classList.add("dark");
  const dark = preRenderMermaid(html);
  await Promise.all([light, dark]);
  expect(themes).toEqual(["#E6F1FB", "#363949"]);
});
