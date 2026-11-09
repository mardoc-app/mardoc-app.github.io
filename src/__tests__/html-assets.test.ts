import { describe, it, expect } from "vitest";
import { rewriteHtmlAssetUrls } from "@/lib/html-assets";

const SHA = "b".repeat(40);
const rewrite = (html: string, path = "docs/design/relay.html", ref = SHA) =>
  rewriteHtmlAssetUrls(html, "acme/private-docs", ref, path);
const img = (html: string) => new DOMParser().parseFromString(html, "text/html").querySelector("img")!;

describe("rewriteHtmlAssetUrls", () => {
  it("points a relative image at the raw CDN and tags it for the authenticated loader", () => {
    const el = img(rewrite('<img id="d" src="diagrams/relay.svg" alt="Relay">'));
    expect(el.getAttribute("src")).toBe(`https://raw.githubusercontent.com/acme/private-docs/${SHA}/docs/design/diagrams/relay.svg`);
    expect(el.dataset).toMatchObject({ ghOwner: "acme", ghRepo: "private-docs", ghRef: SHA, ghPath: "docs/design/diagrams/relay.svg" });
    expect(el.id).toBe("d");
    expect(el.alt).toBe("Relay");
  });

  it("resolves parent-relative and repo-root image paths", () => {
    expect(img(rewrite('<img src="../assets/a.png">')).dataset.ghPath).toBe("docs/assets/a.png");
    expect(img(rewrite('<img src="/images/b.png">')).dataset.ghPath).toBe("images/b.png");
  });

  it("leaves absolute, protocol-relative, data and fragment images untouched", () => {
    for (const src of ["https://example.com/a.png", "//cdn.example.com/a.png", "data:image/png;base64,AA==", "#x"]) {
      const html = `<img src="${src}">`;
      expect(rewrite(html)).toBe(html);
    }
  });

  it("escapes a branch name so it cannot break out of the data attribute", () => {
    const el = img(rewrite('<img src="a.png">', "docs/x.html", 'topic"onerror="alert(1)'));
    expect(el.dataset.ghRef).toBe('topic"onerror="alert(1)');
    expect(el.hasAttribute("onerror")).toBe(false);
  });

  it("rewrites scripts and stylesheets without image tags", () => {
    const out = rewrite('<script src="app.js"></script><link rel="stylesheet" href="s.css">');
    expect(out).toContain(`https://raw.githubusercontent.com/acme/private-docs/${SHA}/docs/design/app.js`);
    expect(out).toContain(`https://raw.githubusercontent.com/acme/private-docs/${SHA}/docs/design/s.css`);
    expect(out).not.toContain("data-gh-");
  });
});
