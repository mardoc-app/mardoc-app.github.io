import { describe, it, expect, vi } from "vitest";
import { resolveReviewLink, bindHtmlReviewLinks } from "@/lib/review-links";
import { buildPRHash, parseHash } from "@/lib/hash-router";

describe("review document links", () => {
  it.each([
    ["workshop.md#workshop-outcomes", "docs/support/workshop.md", "workshop-outcomes"],
    ["../guide.md#6-dashboard", "docs/guide.md", "6-dashboard"],
    ["/README.md", "README.md", ""],
    ["./my%20notes.md?raw=1#some%20heading", "docs/support/my notes.md", "some heading"],
  ])("resolves %s against the source document", (href, path, anchor) => {
    expect(resolveReviewLink("docs/support/architecture.html", href)).toEqual({type:"document",path,anchor});
  });
  it("distinguishes local anchors, external URLs, and unsafe or malformed hrefs", () => {
    expect(resolveReviewLink("a.html", "#slide-2")).toEqual({type:"anchor",anchor:"slide-2"});
    expect(resolveReviewLink("a.html", "//example.com/x")).toEqual({type:"external",href:"https://example.com/x"});
    for (const href of ["javascript:alert(1)","data:text/html,x","file:///etc/passwd","%zz"]) {
      expect(resolveReviewLink("a.html",href).type).toBe("blocked");
    }
  });
  it("intercepts dynamically added links using their original href, including after hover rewriting", () => {
    const doc = document.implementation.createHTMLDocument();
    const navigate = vi.fn();
    const dispose = bindHtmlReviewLinks(doc, navigate, () => "https://mardoc.app/#/acme/docs/pull/1/files/2");
    doc.body.innerHTML = '<a href="workshop.md#outcomes"><span>Workshop</span></a><a href="#slide-2">Next</a>';
    const child = doc.querySelector("span")!;
    child.dispatchEvent(new MouseEvent("mouseover", {bubbles:true}));
    expect(doc.querySelector("a")!.href).toContain("/pull/1/files/2");
    const click = new MouseEvent("click",{bubbles:true,cancelable:true});
    child.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith("workshop.md#outcomes");
    const local = new MouseEvent("click",{bubbles:true,cancelable:true});
    doc.querySelectorAll("a")[1].dispatchEvent(local);
    expect(local.defaultPrevented).toBe(false);
    dispose();
  });
  it("scrolls an existing local anchor without navigating the iframe", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<a href="#notes">Notes</a><section id="notes">Notes</section>';
    const scroll = vi.fn();
    doc.getElementById("notes")!.scrollIntoView = scroll;
    const navigate = vi.fn();
    const dispose = bindHtmlReviewLinks(doc, navigate, () => undefined);
    const click = new MouseEvent("click", {bubbles:true,cancelable:true});
    doc.querySelector("a")!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    dispose();
  });
  it("round-trips a heading in a PR link without confusing it with the route", () => {
    const hash=buildPRHash("acme/docs",381,2,"6-dashboard-walkthrough");
    expect(parseHash(hash)).toMatchObject({type:"pr",prNumber:381,prFileIdx:2,anchor:"6-dashboard-walkthrough"});
  });
});
