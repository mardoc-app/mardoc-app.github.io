import type { CommentTarget } from "./comment-target";
import { locateHtmlComment } from "./html-comment-location";
import type { LocatedComment } from "./markdown-comment-location";

export interface HtmlMarkerComment {
  id: string;
  target?: CommentTarget;
  selectedText?: string;
  resolved?: boolean;
  author?: string;
}

/** Passive markers never reveal slides, expand notes, scroll, or rewrite text. */
export function installHtmlCommentMarkers(
  doc: Document, source: DocumentFragment, side: "LEFT" | "RIGHT",
  initial: HtmlMarkerComment[], onSelect: (id: string) => void,
) {
  const win = doc.defaultView;
  if (!win) return {update: (_comments: HtmlMarkerComment[]) => {}, dispose: () => {}};
  const host = doc.createElement("div");
  host.dataset.mardocCommentMarkers = "";
  // Zero-size fixed host does not contribute to document height. Shadow DOM
  // isolates controls from deck CSS and keeps them out of source text scans.
  host.style.cssText = "all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483646!important;pointer-events:none!important;";
  const shadow = host.attachShadow({mode:"open"});
  const style = doc.createElement("style");
  style.textContent = `
    button{all:initial;box-sizing:border-box;position:fixed;width:44px;height:44px;
      display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;
      color:#fff;font:600 12px/1 system-ui;touch-action:manipulation}
    button[hidden]{display:none}
    span{display:flex;align-items:center;justify-content:center;min-width:28px;height:28px;
      padding:0 5px;box-sizing:border-box;border:2px solid #fff;border-radius:14px;
      background:#245b70;box-shadow:0 1px 5px #0007}
    button:hover span{background:#123e50}
    button:focus-visible{outline:3px solid #e69b12;outline-offset:-3px;border-radius:8px}
  `;
  shadow.append(style);
  doc.body.append(host);
  let comments: HtmlMarkerComment[] = [];
  let signature = "";
  let dirty = true, disposed = false;
  let frame: number | null = null;
  const entries = new Map<string,{button: HTMLButtonElement; location?: LocatedComment}>();

  const visible = (element: Element) => {
    if (!element.isConnected || element.closest('[hidden],[inert],[aria-hidden="true"]') || !element.getClientRects().length) return false;
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && !(parent as HTMLDetailsElement).open &&
        !parent.querySelector(":scope > summary")?.contains(element)) return false;
      const css = win.getComputedStyle(parent);
      if (css.visibility === "hidden" || css.visibility === "collapse" || css.opacity === "0") return false;
    }
    return true;
  };
  const layout = () => {
    frame = null;
    if (disposed || !comments.length) return;
    const occupied: {x:number;y:number}[] = [];
    // Keep the hit areas off text and controls, including siblings outside the
    // quoted range. Measure once per batched layout, not once per comment.
    const obstacles: DOMRect[] = [];
    const visibility = new Map<Element,boolean>();
    const isVisible = (element: Element) => {
      if (!visibility.has(element)) visibility.set(element, visible(element));
      return visibility.get(element)!;
    };
    const walker = doc.createTreeWalker(doc.body,4);
    let node: Node | null;
    while ((node=walker.nextNode())) {
      if (!node.textContent?.trim() || !node.parentElement || node.parentElement.closest("script,style,template") || !isVisible(node.parentElement)) continue;
      const range=doc.createRange();range.selectNodeContents(node);
      obstacles.push(...Array.from(range.getClientRects()).filter(r=>r.width>0 && r.height>0));
    }
    for (const control of Array.from(doc.querySelectorAll("button,a,input,textarea,select,[role=button]"))) {
      if (isVisible(control)) obstacles.push(...Array.from(control.getClientRects()));
    }
    const free = (x:number,y:number) => x>=0 && y>=0 && x+44<=win.innerWidth && y+44<=win.innerHeight &&
      !occupied.some(pos=>Math.abs(pos.x-x)<44 && Math.abs(pos.y-y)<44) &&
      !obstacles.some(r=>x<r.right && x+44>r.left && y<r.bottom && y+44>r.top);
    for (const [index, comment] of Array.from(comments.entries())) {
      const entry = entries.get(comment.id)!;
      if (dirty) entry.location = locateHtmlComment(doc, source, comment.target, comment.selectedText || "");
      const location = entry.location;
      const button = entry.button;
      if (!location || (location.status !== "found" && location.status !== "range") ||
        !location.blocks.length || location.blocks.some(element => !visible(element))) {button.hidden=true;continue;}
      let rect: DOMRect | undefined;
      if (location.parts.length) {
        const rects: DOMRect[] = [];
        for (const part of location.parts) {
          if (!part.node.isConnected || part.end > part.node.length) continue;
          const range = doc.createRange();
          range.setStart(part.node,part.start); range.setEnd(part.node,part.end);
          rects.push(...Array.from(range.getClientRects()).filter(item => item.width > 0 && item.height > 0));
        }
        if (rects.length) {
          const left=Math.min(...rects.map(r=>r.left)), top=Math.min(...rects.map(r=>r.top));
          rect=new DOMRect(left,top,Math.max(...rects.map(r=>r.right))-left,Math.max(...rects.map(r=>r.bottom))-top);
        }
      } else rect = location.blocks[0].getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top >= win.innerHeight || rect.right < 0 || rect.left >= win.innerWidth) {button.hidden=true;continue;}
      // Include the containing text element, not just the selected characters:
      // a marker after a partial quote must not cover the rest of a link/label.
      const contentRight = Math.max(rect.right, ...location.blocks.map(element => element.getBoundingClientRect().right));
      const right = Math.max(0, Math.min(win.innerWidth - 44, contentRight + 4));
      const top = Math.max(0,rect.top - 8);
      const candidates = [
        {x:right,y:top}, {x:rect.left-48,y:top},
        {x:right,y:rect.bottom+4}, {x:right,y:rect.top-48},
      ];
      // Stack nearby comments in the same gutter without covering text. If
      // there is no room, the existing per-file panel remains the entry point.
      for (let i=1;i<=3;i++) candidates.push({x:right,y:top+44*i});
      const spot=candidates.find(({x,y})=>free(x,y));
      if (!spot) {button.hidden=true;continue;}
      occupied.push(spot);
      button.style.left = spot.x+"px"; button.style.top = spot.y+"px";
      button.hidden = false;
      button.setAttribute("aria-label", "Open comment "+(index+1)+(comment.author ? " by "+comment.author : ""));
    }
    dirty = false;
  };
  const schedule = () => { if (!disposed && frame === null) frame = win.requestAnimationFrame(layout); };
  const observer = new MutationObserver(records => {
    const relevant = records.filter(record => record.target !== host && !host.contains(record.target));
    if (!relevant.length) return;
    // Class/style changes need new geometry, not a fresh full source scan.
    if (relevant.some(record => record.type !== "attributes" ||
      record.attributeName?.startsWith("data-mardoc-"))) dirty = true;
    schedule();
  });
  observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  const resize = new ResizeObserver(schedule);
  resize.observe(doc.body);
  win.addEventListener("resize",schedule);
  doc.addEventListener("scroll",schedule,true);
  doc.addEventListener("load",schedule,true);
  doc.addEventListener("transitionend",schedule,true);
  doc.addEventListener("animationend",schedule,true);
  doc.fonts?.addEventListener("loadingdone",schedule);

  const update = (next: HtmlMarkerComment[]) => {
    const filtered = next.filter(comment => !comment.resolved && (comment.target?.side || "RIGHT") === side);
    const nextSignature = JSON.stringify(filtered.map(c => [c.id,c.target,c.selectedText,c.author]));
    if (nextSignature === signature) return;
    signature = nextSignature; comments = filtered;
    const ids = new Set(comments.map(c=>c.id));
    for (const [id,entry] of Array.from(entries)) if (!ids.has(id)) {entry.button.remove();entries.delete(id);}
    comments.forEach((comment,index) => {
      let entry = entries.get(comment.id);
      if (!entry) {
        const button = doc.createElement("button");button.type="button";button.hidden=true;
        button.dataset.commentMarkerId = comment.id;
        button.addEventListener("click", event => {event.preventDefault();event.stopPropagation();onSelect(comment.id);});
        // Do not let deck keyboard shortcuts or selection listeners handle marker activation.
        for (const type of ["keydown","keyup","mouseup","touchend"]) button.addEventListener(type,event=>event.stopPropagation());
        button.append(doc.createElement("span"));
        shadow.append(button);entry={button};entries.set(comment.id,entry);
      }
      entry.button.firstElementChild!.textContent=String(index+1);
      entry.button.title="Open comment"+(comment.author ? " by "+comment.author : "");
    });
    dirty=true;schedule();
  };
  update(initial);
  return {update,dispose: () => {
    disposed=true;
    observer.disconnect();resize.disconnect();
    if (frame !== null) win.cancelAnimationFrame(frame);
    win.removeEventListener("resize",schedule);
    for (const type of ["scroll","load","transitionend","animationend"]) doc.removeEventListener(type,schedule,true);
    doc.fonts?.removeEventListener("loadingdone",schedule);
    host.remove();entries.clear();
  }};
}
