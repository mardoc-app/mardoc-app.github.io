import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installHtmlCommentMarkers, type HtmlMarkerComment } from "@/lib/html-comment-markers";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";

let frames: Map<number,FrameRequestCallback>;
let sequence = 0;
const flush = () => { const callbacks=Array.from(frames.values());frames.clear();callbacks.forEach(fn=>fn(0)); };
const comment: HtmlMarkerComment = {id:"one",author:"Reviewer",selectedText:"Target",
  target:{path:"doc.html",side:"RIGHT",status:"current",startLine:1,endLine:1}};
let dispose: (()=>void) | undefined;
beforeEach(()=>{
  frames=new Map();
  vi.spyOn(window,"requestAnimationFrame").mockImplementation(fn=>{frames.set(++sequence,fn);return sequence;});
  vi.spyOn(window,"cancelAnimationFrame").mockImplementation(id=>{frames.delete(id);});
  vi.stubGlobal("ResizeObserver",class {observe(){} disconnect(){}});
  vi.spyOn(Element.prototype,"getClientRects").mockImplementation(()=>[new DOMRect(10,20,100,20)] as unknown as DOMRectList);
  vi.spyOn(Element.prototype,"getBoundingClientRect").mockImplementation(()=>new DOMRect(10,20,100,20));
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:()=>[new DOMRect(10,20,100,20)]});
  document.body.innerHTML=injectSourceLineAttributes("<p>Target</p>",true);
});
afterEach(()=>{dispose?.();dispose=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML="";});
function install(comments=[comment]) {
  const source=document.createElement("template");source.innerHTML=document.body.innerHTML;
  const onSelect=vi.fn();
  const controller=installHtmlCommentMarkers(document,source.content,"RIGHT",comments,onSelect);
  dispose=controller.dispose;
  flush();
  const root=document.querySelector("[data-mardoc-comment-markers]")!.shadowRoot!;
  return {controller,onSelect,root};
}
it("keeps distinct comment identities without wrapping text and removes resolved markers",()=>{
  const original=document.querySelector("p")!.firstChild;
  const {controller,root,onSelect}=install([comment,{...comment,id:"two"},{...comment,id:"base",target:{...comment.target!,side:"LEFT"}}]);
  const buttons=Array.from(root.querySelectorAll("button"));
  expect(buttons).toHaveLength(2);
  expect(buttons.every(button=>!button.hidden)).toBe(true);
  expect(buttons[0].style.top).not.toBe(buttons[1].style.top);
  buttons[1].click();expect(onSelect).toHaveBeenCalledWith("two");
  expect(document.querySelector("p")!.firstChild).toBe(original);
  controller.update([{...comment,resolved:true}]);flush();
  expect(root.querySelectorAll("button")).toHaveLength(0);
});
it("does not rebuild on identical polling updates and batches geometry events",()=>{
  const {controller,root}=install();
  const marker=root.querySelector("button")!;
  controller.update([{...comment}]);expect(frames.size).toBe(0);
  window.dispatchEvent(new Event("resize"));window.dispatchEvent(new Event("resize"));
  document.dispatchEvent(new Event("scroll"));
  expect(frames.size).toBe(1);flush();
  expect(root.querySelector("button")).toBe(marker);
});
it("removes observers, queued work and controls when disposed",async()=>{
  const {controller}=install();
  window.dispatchEvent(new Event("resize"));
  controller.dispose();dispose=undefined;
  expect(frames.size).toBe(0);
  document.querySelector("p")!.textContent="Replacement";
  window.dispatchEvent(new Event("resize"));
  await Promise.resolve();
  expect(frames.size).toBe(0);
  expect(document.querySelector("[data-mardoc-comment-markers]")).toBeNull();
});
