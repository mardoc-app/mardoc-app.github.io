// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildHtmlDiff } from "@/lib/html-diff";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const diff = (before: string, after: string) => {
  const result = buildHtmlDiff(before, after);
  return { ...result, doc: parse(result.html) };
};

describe("rendered HTML diff", () => {
  it("marks word changes while preserving nested formatting and source locations", () => {
    const { doc, changes } = diff('<p>Hello <strong>old friend</strong>.</p>', '<p data-mardoc-line="12" data-mardoc-end-line="14">Hello <strong>new friend</strong>.</p>');
    expect(doc.querySelector('strong [data-mardoc-diff="removed"]')?.textContent).toBe("old");
    expect(doc.querySelector('strong [data-mardoc-diff="added"]')?.textContent).toBe("new");
    expect(doc.querySelector("p")?.getAttribute("data-mardoc-line")).toBe("12");
    expect(doc.querySelector("p")?.getAttribute("data-mardoc-end-line")).toBe("14");
    expect(changes).toHaveLength(1);
    expect(doc.querySelector("p")?.getAttribute("data-mardoc-change-id")).toBe(changes[0].id);
  });
  it("aligns inserted and repeated paragraphs without cascading changes", () => {
    const { doc, changes } = diff('<p>A</p><p>Repeated</p><p>Repeated</p><p>Z</p>', '<p>A</p><p>Inserted</p><p>Repeated</p><p>Repeated</p><p>Z</p>');
    expect(changes).toHaveLength(1);
    expect(doc.querySelector('[data-mardoc-diff="added"]')?.textContent).toBe("Inserted");
    expect(doc.querySelectorAll('[data-mardoc-diff="removed"]')).toHaveLength(0);
  });
  it("matches stable IDs through text edits", () => {
    const { doc, changes } = diff('<section id="intro"><p>old</p></section>', '<section id="intro"><p>new</p></section>');
    expect(doc.querySelector("#intro p")).not.toBeNull();
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("modified");
  });
  it("keeps deleted list items and table rows in valid containers", () => {
    const { doc } = diff('<ul><li>Keep</li><li>Delete</li></ul><table><tr><td>Keep</td></tr><tr><td>Delete</td></tr></table>', '<ul><li>Keep</li></ul><table><tr><td>Keep</td></tr></table>');
    expect(doc.querySelector('ul > li[data-mardoc-diff="removed"]')?.textContent).toBe("Delete");
    expect(doc.querySelector('tbody > tr[data-mardoc-diff="removed"]')?.textContent).toBe("Delete");
    expect(doc.querySelector("tbody > span")).toBeNull();
  });
  it("removes executable handlers and scripts from deleted blocks", () => {
    const { doc } = diff('<div onclick="alert(1)"><p>Old</p><script>alert(2)</script></div>', '<p>Keep</p>');
    expect(doc.querySelector('[data-mardoc-diff="removed"]')?.hasAttribute("onclick")).toBe(false);
    expect(doc.querySelector("script")).toBeNull();
  });
  it("diffs SVG labels with SVG tspans and reports title/desc changes separately", () => {
    const { doc, hiddenChanges } = diff('<svg><title>Old diagram</title><desc>Old description</desc><text x="20">Old label</text></svg>', '<svg><title>New diagram</title><desc>New description</desc><text x="20">New label</text></svg>');
    const added = doc.querySelector('text tspan[data-mardoc-diff="added"]');
    expect(added?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(doc.querySelector("svg span")).toBeNull();
    expect(doc.querySelector("svg title")?.textContent).toBe("New diagram");
    expect(hiddenChanges).toEqual(expect.arrayContaining([{ label: "title", before: "Old diagram", after: "New diagram" }, { label: "desc", before: "Old description", after: "New description" }]));
  });
  it("reports invisible attribute edits and keeps current assets", () => {
    const { doc, hiddenChanges, changes } = diff('<title>Old</title><style>p{color:red}</style><script>old()</script><p><a href="/old">Link</a><img alt="Old alt" src="x"></p>', '<title>New</title><style>p{color:blue}</style><script>newCode()</script><p><a href="/new">Link</a><img alt="New alt" src="x"></p>');
    expect(changes).toHaveLength(0);
    expect(hiddenChanges.map(change => change.label)).toEqual(expect.arrayContaining(["Page title", "Link destination", "img alt"]));
    expect(doc.querySelector("script")?.textContent).toBe("newCode()");
    expect(doc.querySelector("style")?.textContent).toBe("p{color:blue}");
  });
  it("does not mark unchanged documents", () => {
    const source = '<html><head><style>p{color:red}</style></head><body><p>Hello <em>world</em></p></body></html>';
    const result = diff(source, source);
    expect(result.changes).toEqual([]);
    expect(result.hiddenChanges).toEqual([]);
    expect(result.doc.querySelector("em")?.textContent).toBe("world");
  });
  it("preserves form values and raw-text content without serializing diff markup into them", () => {
    const { doc, hiddenChanges } = diff('<textarea>Old text</textarea><select><option>Old choice</option></select>',
      '<textarea>New text</textarea><select><option>New choice</option></select>');
    expect(doc.querySelector("textarea")?.value).toBe("New text");
    expect(doc.querySelector("select")?.options).toHaveLength(1);
    expect(doc.querySelector("option")?.textContent).toBe("New choice");
    expect(doc.querySelector("textarea [data-mardoc-diff], select [data-mardoc-diff]")).toBeNull();
    expect(hiddenChanges).toEqual(expect.arrayContaining([
      {label: "textarea content", before: "Old text", after: "New text"},
      {label: "select content", before: "Old choice", after: "New choice"},
    ]));
  });
  it("marks meaningful whitespace changes in code and preformatted text", () => {
    const { doc, changes } = diff('<pre>a  b</pre><pre>  </pre>', '<pre>a b</pre><pre> </pre>');
    expect(changes).toHaveLength(2);
    expect(doc.querySelector('pre [data-mardoc-diff="removed"]')?.textContent).toBe("  ");
    expect(doc.querySelector('pre [data-mardoc-diff="added"]')?.textContent).toBe(" ");
    expect(diff('<p>a  b</p>', '<p>a b</p>').changes).toHaveLength(0);
  });
  it("renders all-added and all-removed documents with a readable shell", () => {
    expect(diff("", '<p>New</p>').doc.querySelector('[data-mardoc-diff="added"]')?.textContent).toBe("New");
    const removed = diff('<style>p{font-size:20px}</style><p>Old</p><script>old()</script>', "");
    expect(removed.doc.querySelector('[data-mardoc-diff="removed"]')?.textContent).toBe("Old");
    expect(removed.doc.querySelector("style")?.textContent).toContain("font-size:20px");
    expect(removed.doc.querySelector("script")).toBeNull();
  });
  it("handles wide sibling collections with a bounded alignment path", () => {
    const rows = Array.from({ length: 600 }, (_, i) => `<p>Row ${i}</p>`);
    const result = diff(rows.join(""), [rows[0], '<p>Inserted</p>', ...rows.slice(1)].join(""));
    expect(result.changes).toHaveLength(1);
  });
  it("returns the head source when DOMParser is unavailable", () => {
    vi.stubGlobal("DOMParser", undefined);
    try { expect(buildHtmlDiff("old", "new")).toEqual({ html: "new", changes: [], hiddenChanges: [] }); }
    finally { vi.unstubAllGlobals(); }
  });
});
