import { describe, expect, it } from "vitest";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";
import { locateHtmlComment } from "@/lib/html-comment-location";
import type { CommentTarget } from "@/lib/comment-target";

const parse = (source: string) => new DOMParser().parseFromString(injectSourceLineAttributes(source,true),"text/html");
const target = (startLine: number, endLine = startLine): CommentTarget => ({path:"deck.html",side:"RIGHT",status:"current",startLine,endLine});
const text = (location: ReturnType<typeof locateHtmlComment>) => location.parts.map(part => part.node.data.slice(part.start,part.end)).join("");

describe("HTML source and live-DOM comment evidence", () => {
  it("distinguishes repeated passages and preserves inline text ranges", () => {
    const doc = parse('<p>Same <b>phrase</b>.</p>\n<p>Other</p>\n<p>Same <b>phrase</b>.</p>');
    const location = locateHtmlComment(doc,doc,target(3),"Same phrase.");
    expect(location.status).toBe("found");
    expect(text(location)).toBe("Same phrase.");
    expect(location.parts).toHaveLength(3);
    expect(locateHtmlComment(doc,doc,target(3),"").blocks.map(element=>element.tagName)).toEqual(["P"]);
    expect(location.parts[0].node.parentElement?.dataset.mardocLine).toBe("3");
    expect(locateHtmlComment(doc,doc,undefined,"Same phrase.").status).toBe("ambiguous");
  });
  it("supports multiline containers, nested endpoint ancestors, entities and cross-block quotes", () => {
    const doc = parse('<p>\nRead <b>this</b> &amp;\n<a>that</a> guide\n</p>\n<p>Next<br>step</p>');
    expect(locateHtmlComment(doc,doc,target(2),"Read this &").status).toBe("found");
    expect(locateHtmlComment(doc,doc,target(1,5),"this & that guide Next step").status).toBe("found");
    expect(locateHtmlComment(doc,doc,target(1),"that guide").status).toBe("found");
  });
  it("does not invent a location for unknown, file or outdated coordinates", () => {
    const doc = parse('<p>Text</p>');
    expect(locateHtmlComment(doc,doc,{...target(1),status:"outdated"},"Text").status).toBe("outdated");
    expect(locateHtmlComment(doc,doc,{...target(1),status:"file"},"Text").status).toBe("file");
    expect(locateHtmlComment(doc,doc,{...target(1),startSide:"LEFT"},"Text").status).toBe("unknown");
    expect(locateHtmlComment(doc,doc,target(10),"Text").status).toBe("missing");
    expect(locateHtmlComment(doc,doc,target(1),"").status).toBe("range");
  });
  it("validates the source before accepting a live scripted match", () => {
    const source = parse('<p>Original</p>\n<p>Other</p>');
    const live = parse('<p>Changed</p>\n<p>Other</p>');
    expect(locateHtmlComment(live,source,target(1),"Changed").status).toBe("missing");
    expect(locateHtmlComment(live,source,target(1),"Original").status).toBe("missing");
    live.querySelector("p")!.textContent="Original";
    expect(locateHtmlComment(live,source,target(1),"Original").status).toBe("found");
    live.querySelector("p")!.append(" Original");
    expect(locateHtmlComment(live,source,target(1),"Original").status).toBe("ambiguous");
  });
  it("can locate hidden targets for visibility feedback, but excludes executable and SVG metadata", () => {
    const doc = parse('<script>Secret</script>\n<style>Secret</style>\n<svg><desc>Secret</desc><text>Diagram label</text></svg>\n<p hidden>Hidden text</p>');
    expect(locateHtmlComment(doc,doc,undefined,"Secret").status).toBe("missing");
    expect(locateHtmlComment(doc,doc,target(3),"Diagram label").status).toBe("found");
    expect(locateHtmlComment(doc,doc,target(4),"Hidden text").status).toBe("found");
  });
});

it("adds closing ranges without scanning raw text or changing source bytes", () => {
  const source = '<div title="a > b">\n<p>\nHello <b>world</b>\n</p>\n<br/>\n<script>"<p>fake</p>"</script>\n<textarea><p>literal</p></textarea>\n</div>';
  const tagged = injectSourceLineAttributes(source,true);
  expect(tagged.replace(/ data-mardoc-(?:end-)?line="\d+"/g,"")).toBe(source);
  const doc = new DOMParser().parseFromString(tagged,"text/html");
  expect(doc.querySelector("div")?.dataset.mardocEndLine).toBe("8");
  expect(doc.querySelector("p")?.dataset.mardocEndLine).toBe("4");
  expect(doc.querySelector("b")?.dataset.mardocEndLine).toBe("3");
  expect(doc.querySelector("br")?.dataset.mardocEndLine).toBe("5");
  expect(doc.querySelector("textarea")?.textContent).toBe("<p>literal</p>");
});

it("verifies template source against cloned notes and refuses shared-line ambiguity", () => {
  const source = parse('<template id="notes-1"><p>First note</p></template><template id="notes-2"><p>Second <b>note</b></p></template>');
  const doc = parse('<aside id="notes"></aside>');
  doc.getElementById("notes")!.append(source.querySelector<HTMLTemplateElement>("#notes-2")!.content.cloneNode(true));
  const location = locateHtmlComment(doc,source,target(1),"Second note");
  expect(location.status).toBe("found");
  expect(text(location)).toBe("Second note");
  expect(locateHtmlComment(doc,source,target(1),"note").status).toBe("ambiguous");
  expect(locateHtmlComment(doc,source,undefined,"Second note").status).toBe("unknown");
  doc.getElementById("notes")!.textContent = "Changed note";
  expect(locateHtmlComment(doc,source,target(1),"Second note").status).toBe("missing");
});

it("refuses ambiguous body/template quotes before touching presentation controls", () => {
  const source = parse('<p>Shared passage</p><template id="notes-1"><p>Shared passage</p></template>');
  expect(locateHtmlComment(source,source,target(1),"Shared passage",true).status).toBe("ambiguous");
});
