import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { installIframeResize, buildIframeResizeScript } from "@/lib/iframe-resize";

let callback: MutationCallback;
let pending: FrameRequestCallback | undefined;
let height: number;
let reads: number;
let dispose: (() => void) | undefined;
const disconnect = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); height = 500; reads = 0; pending = undefined;
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(() => { reads++; return height; });
  vi.spyOn(window, "MutationObserver").mockImplementation(function (cb: MutationCallback) {
    callback = cb;
    return {observe:vi.fn(),disconnect,takeRecords:()=>[]};
  } as any);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { pending = cb; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => { pending = undefined; });
  vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
});
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.useRealTimers(); });
const mutate = () => callback([], {} as MutationObserver);
const frame = () => { const cb=pending; pending=undefined; cb?.(0); };
it("coalesces 50 mutation callbacks into one measurement and suppresses unchanged heights", () => {
  dispose=installIframeResize();
  for(let i=0;i<50;i++) mutate();
  expect(reads).toBe(0);
  expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  frame();
  expect(reads).toBe(1);
  expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
  for(let i=0;i<50;i++) mutate();
  frame();
  expect(reads).toBe(2);
  expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
  height=900; mutate(); frame();
  expect(window.parent.postMessage).toHaveBeenLastCalledWith({type:"mardoc-iframe-resize",height:900},"*");
});
it("schedules delayed resource loads and existing fallback checks through the same frame", () => {
  dispose=installIframeResize(); frame();
  const img=document.createElement("img"); document.body.append(img);
  height=800;
  img.dispatchEvent(new Event("load"));
  vi.advanceTimersByTime(2000);
  expect(reads).toBe(1);
  frame();
  expect(reads).toBe(2);
  expect(window.parent.postMessage).toHaveBeenCalledTimes(2);
  img.remove();
});
it("cancels scheduled work and disconnects when disposed", () => {
  dispose=installIframeResize(); dispose();
  vi.advanceTimersByTime(3000); mutate(); frame();
  expect(reads).toBe(0);
  expect(disconnect).toHaveBeenCalled();
});
it("produces a self-contained script for srcdoc", () => {
  dispose = new Function("return " + buildIframeResizeScript())();
  frame();
  expect(window.parent.postMessage).toHaveBeenCalledWith({type:"mardoc-iframe-resize",height:500},"*");
});

it("schedules font completion and ignores a late ready callback after disposal", async () => {
  let ready!: () => void;
  const fonts = Object.assign(new EventTarget(), {ready:new Promise<void>(resolve => {ready=resolve;})});
  Object.defineProperty(document, "fonts", {configurable:true,value:fonts});
  try {
    dispose=installIframeResize(); frame();
    height=750; fonts.dispatchEvent(new Event("loadingdone")); frame();
    expect(window.parent.postMessage).toHaveBeenLastCalledWith({type:"mardoc-iframe-resize",height:750},"*");
    dispose(); ready(); await Promise.resolve(); frame();
    expect(reads).toBe(2);
  } finally { dispose?.(); Reflect.deleteProperty(document,"fonts"); }
});
