import type { CommentTarget } from "./comment-target";
import { revealCommentSlide } from "./html-comment-slide";
import type { LocatedComment } from "./markdown-comment-location";

const excluded = "head,title,script,style,template,textarea,select";
const blocks = "p,div,section,article,li,dt,dd,td,th,pre,blockquote,h1,h2,h3,h4,h5,h6,summary,text";
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const result = (status: LocatedComment["status"], elements: HTMLElement[] = [], parts: LocatedComment["parts"] = []): LocatedComment => ({status, blocks:elements, parts});

function overlaps(element: Element, target?: CommentTarget): boolean {
  if (!target) return true;
  const start = Number(element.getAttribute("data-mardoc-line"));
  const end = Number(element.getAttribute("data-mardoc-end-line"));
  return start > 0 && end >= start && start <= target.endLine! && end >= target.startLine!;
}

function eligible(element: Element, target?: CommentTarget): boolean {
  if (element.closest(excluded)) return false;
  if (element.namespaceURI === "http://www.w3.org/2000/svg" && !element.closest("text")) return false;
  if (!target) return true;
  const nearest = element.closest("[data-mardoc-line]");
  if (!nearest) return false;
  if (overlaps(nearest, target)) return true;
  // MarDoc selections record the opening tag of their endpoint ancestors.
  // Include inline descendants of an element that starts in that range.
  for (let parent = nearest.parentElement; parent; parent = parent.parentElement) {
    const line = Number(parent.getAttribute("data-mardoc-line"));
    if (line >= target.startLine! && line <= target.endLine!) return true;
  }
  return false;
}

function locate(doc: Document | DocumentFragment, target: CommentTarget | undefined, quote: string): LocatedComment {
  const root = "body" in doc ? doc.body : doc;
  const owner = "body" in doc ? doc : doc.ownerDocument;
  if (!quote.trim()) {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-mardoc-line]"))
      .filter(element => eligible(element, target) && overlaps(element, target));
    const candidateSet = new Set<Element>(candidates), excludedParents = new Set<Element>();
    for (const element of candidates) {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (!candidateSet.has(parent)) continue;
        const sameRange = parent.getAttribute("data-mardoc-line") === element.getAttribute("data-mardoc-line") &&
          parent.getAttribute("data-mardoc-end-line") === element.getAttribute("data-mardoc-end-line");
        // Prefer a complete element over inline children on the same source line,
        // but don't outline the whole document when a narrower range is present.
        excludedParents.add(sameRange ? element : parent);
      }
    }
    const smallest = candidates.filter(element => !excludedParents.has(element));
    return smallest.length ? result("range", smallest) : result("missing");
  }
  const chars: string[] = [];
  const offsets: ({node: Text; offset: number} | null)[] = [];
  const append = (character: string, point: {node:Text;offset:number} | null) => {
    const char = /\s/.test(character) ? " " : character;
    if (char === " " && chars.at(-1) === " ") return;
    chars.push(char); offsets.push(point);
  };
  const walker = owner.createTreeWalker(root, 5 /* SHOW_ELEMENT | SHOW_TEXT */);
  let node: Node | null, previousBlock: Element | null = null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 1) {
      if ((node as Element).tagName === "BR") append(" ", null);
      continue;
    }
    const parent = node.parentElement;
    if (!parent || !eligible(parent, target)) {
      if (node.textContent?.trim()) append("\0", null); // never join across excluded content
      continue;
    }
    const block = parent.closest(blocks);
    if (block !== previousBlock) append(" ", null);
    previousBlock = block;
    const text = node.textContent || "";
    for (let i = 0; i < text.length; i++) append(text[i], {node:node as Text,offset:i});
  }
  const text = chars.join(""), search = normalize(quote);
  const start = text.indexOf(search);
  if (start < 0) return result("missing");
  if (text.indexOf(search, start + 1) >= 0) return result("ambiguous");
  const parts: LocatedComment["parts"] = [];
  for (let i = start; i < start + search.length; i++) {
    const point = offsets[i];
    if (!point) continue;
    const last = parts.at(-1);
    if (last?.node === point.node) last.end = point.offset + 1;
    else parts.push({node:point.node,start:point.offset,end:point.offset+1});
  }
  return parts.length ? result("found", Array.from(new Set(parts.map(part => part.node.parentElement!))), parts) : result("missing");
}

/** Verify source evidence, then locate on the current live DOM without executing source. */
export function locateHtmlComment(doc: Document, source: Document | DocumentFragment, target: CommentTarget | undefined, quote: string): LocatedComment {
  if (target?.status === "outdated") return result("outdated");
  if (target?.status === "file") return result("file");
  if (target && (target.status !== "current" || !target.side || !target.startLine || !target.endLine ||
    target.startLine > target.endLine || (target.startSide && target.startSide !== target.side))) return result("unknown");
  if (!target && !quote.trim()) return result("unknown");
  const original = locate(source, target, quote);
  if (original.status !== "found" && original.status !== "range") return original;
  return locate(doc, target, quote);
}

interface HighlightWindow {
  Highlight?: new (...ranges: Range[]) => unknown;
  CSS?: {highlights?: {set: (name: string, value: unknown) => void; delete: (name: string) => void}};
}

/** Range highlighting leaves text nodes, listeners and the user's selection intact. */
export function highlightHtmlComment(doc: Document, location: LocatedComment, onChanged?: () => void): {status: "highlighted" | "element" | "hidden"; clear: () => void} {
  const noop = () => {};
  const elements = location.blocks;
  revealCommentSlide(doc, elements);
  for (const element of elements) {
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") (parent as HTMLDetailsElement).open = true;
    }
  }
  const hidden = (element: HTMLElement) => {
    if (!element.getClientRects().length || element.closest('[hidden],[aria-hidden="true"],[inert]')) return true;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      const style = doc.defaultView?.getComputedStyle(parent);
      if (style?.visibility === "hidden" || style?.visibility === "collapse" || style?.opacity === "0") return true;
    }
    return false;
  };
  if (!elements.length || elements.some(hidden)) return {status:"hidden",clear:noop};
  const ranges = location.parts.map(({node,start,end}) => {
    const range = doc.createRange(); range.setStart(node,start); range.setEnd(node,end); return range;
  });
  if (ranges.some(range => !range.getClientRects().length)) return {status:"hidden",clear:noop};
  const api = doc.defaultView as unknown as HighlightWindow;
  const style = doc.createElement("style");
  style.textContent = "::highlight(mardoc-review-target) { background-color: #ffe082; color: #171717; }";
  const exact = !!(ranges.length && api?.Highlight && api.CSS?.highlights);
  if (exact) {
    doc.head.appendChild(style);
    api.CSS!.highlights!.set("mardoc-review-target", new api.Highlight!(...ranges));
  }
  // Also provide a visible focus boundary, including browsers without CSS Highlights.
  const first = elements[0];
  const outlines = (exact ? [first] : elements).map(element => ({element,
    value:element.style.getPropertyValue("outline"), priority:element.style.getPropertyPriority("outline")}));
  for (const {element} of outlines) element.style.setProperty("outline", "2px solid #b77900", "important");
  const tabIndex = first.getAttribute("tabindex");
  const expectedText = ranges.map(range => range.toString());
  const expectedElements = elements.map(element => element.textContent);
  const observer = new MutationObserver(() => {
    const changed = elements.some(element => !element.isConnected) || (ranges.length
      ? ranges.some((range, index) => range.toString() !== expectedText[index])
      : elements.some((element, index) => element.textContent !== expectedElements[index]));
    if (changed) { clear(); onChanged?.(); }
  });
  const clear = () => {
    observer.disconnect();
    if (exact) api.CSS?.highlights?.delete("mardoc-review-target");
    style.remove();
    for (const {element,value,priority} of outlines) {
      if (value) element.style.setProperty("outline",value,priority);
      else element.style.removeProperty("outline");
    }
    if (tabIndex === null) first.removeAttribute("tabindex"); else first.setAttribute("tabindex",tabIndex);
  };
  observer.observe(doc.body, {subtree:true,childList:true,characterData:true});
  first.tabIndex = -1;
  first.focus({preventScroll:true});
  first.scrollIntoView({block:"center",behavior:"auto"});
  return {status:exact ? "highlighted" : "element",clear};
}
