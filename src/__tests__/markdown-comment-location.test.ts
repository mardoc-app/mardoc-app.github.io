import { expect, it } from "vitest";
import { locateMarkdownComment, markCommentLocation, clearCommentMarks } from "@/lib/markdown-comment-location";
import type { CommentTarget } from "@/lib/comment-target";
const target = (startLine=1,endLine=startLine,side:"LEFT"|"RIGHT"="RIGHT"): CommentTarget =>
  ({path:"doc.md",status:"current",startLine,endLine,side});
const block = (html:string,start=1,end=start,side="RIGHT") =>
  '<div data-review-side="'+side+'" data-review-start="'+start+'" data-review-end="'+end+'">'+html+'</div>';
const root = (html:string) => { const el=document.createElement("div");el.innerHTML=html;return el; };
it("selects only the repeated passage in the specified source range", () => {
  const el=root(block("<p>Same phrase</p>",1)+block("<p>Same phrase</p>",5));
  const found=locateMarkdownComment(el,target(5),"Same phrase","Same phrase\n\n\n\nSame phrase");
  expect(found.status).toBe("found");
  markCommentLocation(found,"one");
  expect(el.children[0].querySelector("mark")).toBeNull();
  expect(el.children[1].querySelector("mark")?.textContent).toBe("Same phrase");
});
it("refuses repeated matches without coordinates or within one candidate block", () => {
  const el=root(block("<p>Same phrase Same phrase</p>"));
  expect(locateMarkdownComment(el,undefined,"Same phrase").status).toBe("ambiguous");
  expect(locateMarkdownComment(el,target(),"Same phrase").status).toBe("ambiguous");
});
it("does not match a quote outside its exact source lines even in the same block", () => {
  const el=root(block("<p>First line\nDifferent line</p>",1,2));
  expect(locateMarkdownComment(el,target(1),"Different line","First line\nDifferent line").status).toBe("missing");
});
it("matches across formatting and block boundaries and preserves links on cleanup", () => {
  const el=root(block('<p>Read <a href="./guide.md"><strong>this</strong> guide</a></p>',1)+block("<p>Next step</p>",3));
  const found=locateMarkdownComment(el,target(1,3),"this guide\n\nNext step","Read **this** guide\n\nNext step");
  expect(found.status).toBe("found");
  markCommentLocation(found,"cross");
  expect(el.querySelectorAll("mark")).toHaveLength(3);
  clearCommentMarks(el);
  expect(el.querySelector("mark")).toBeNull();
  expect(el.querySelector("a")?.getAttribute("href")).toBe("./guide.md");
});
it("finds deleted base text without jumping to head", () => {
  const el=root(block('<p><span class="diff-removed">Old text</span></p>',4,4,"LEFT")+block("<p>New text</p>",4));
  const found=locateMarkdownComment(el,target(4,4,"LEFT"),"Old text","\n\n\nOld text");
  expect(found.status).toBe("found");
  expect(found.blocks[0].dataset.reviewSide).toBe("LEFT");
});
it("reports outdated, file-level, unknown-side, missing and coarse range outcomes", () => {
  const el=root(block("<p>Text</p>"));
  expect(locateMarkdownComment(el,{...target(),status:"outdated"},"Text").status).toBe("outdated");
  expect(locateMarkdownComment(el,{...target(),status:"file"},"Text").status).toBe("file");
  expect(locateMarkdownComment(el,{...target(),side:undefined},"Text").status).toBe("unknown");
  expect(locateMarkdownComment(el,target(),"Gone","Text").status).toBe("missing");
  expect(locateMarkdownComment(el,target(),"","Text").status).toBe("range");
});
it("never matches scripts or diagram internals", () => {
  const el=root(block('<script>Secret</script><svg><text>Secret</text></svg><p>Visible</p>'));
  expect(locateMarkdownComment(el,undefined,"Secret").status).toBe("missing");
});
