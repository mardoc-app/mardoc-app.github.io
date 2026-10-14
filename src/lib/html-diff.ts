import { diffWords } from "diff";

export interface HtmlDiffChange {
  id: string;
  kind: "added" | "removed" | "modified";
  summary: string;
}
export interface HtmlHiddenChange { label: string; before: string; after: string }
export interface HtmlDiffResult { html: string; changes: HtmlDiffChange[]; hiddenChanges: HtmlHiddenChange[] }

const SVG = "http://www.w3.org/2000/svg";
const ignored = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE"]);
const metadata = new Set(["title", "desc"]);
const blocks = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|NAV|MAIN|LI|TD|TH|CAPTION|H[1-6]|PRE|BLOCKQUOTE|DT|DD|FIGCAPTION|text)$/;
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const element = (node: Node): node is Element => node.nodeType === 1;
const tag = (node: Node) => element(node) ? node.tagName : "#text";
const hidden = (node: Node) => element(node) && metadata.has(node.localName);
const skip = (node: Node) => node.nodeType === 8 || (element(node) && ignored.has(node.tagName.toUpperCase()));
const key = (node: Node) => element(node) && node.id
  ? `${node.tagName}#${node.id}`
  : `${tag(node)}:${compact(node.textContent || "")}`;
const compatible = (a: Node, b: Node) => tag(a) === tag(b) &&
  !(element(a) && element(b) && a.id && b.id && a.id !== b.id);

/** Match exact siblings first so an inserted paragraph does not shift every later paragraph.
 * The bounded matrix handles normal documents; wide generated tables use linear lookahead. */
function anchors(before: Node[], after: Node[]): [number, number][] {
  const a = before.map(key), b = after.map(key);
  const result: [number, number][] = [];
  if (a.length * b.length > 250_000) {
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      const end = Math.min(b.length, j + 32);
      for (let k = j; k < end; k++) if (a[i] === b[k]) {
        result.push([i, k]); j = k + 1; break;
      }
    }
    return result;
  }
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { result.push([i++, j++]); }
    else if (rows[i + 1][j] >= rows[i][j + 1]) i++;
    else j++;
  }
  return result;
}

/** Build a combined rendered document while keeping the head revision's layout and assets.
 * Callers may inject source line attributes before calling; those attributes are retained. */
export function buildHtmlDiff(baseSource: string, headSource: string): HtmlDiffResult {
  if (typeof DOMParser === "undefined") return { html: headSource, changes: [], hiddenChanges: [] };
  const parser = new DOMParser();
  const before = parser.parseFromString(baseSource, "text/html");
  const after = parser.parseFromString(headSource || baseSource, "text/html");
  if (!headSource) { after.body.replaceChildren(); after.querySelectorAll("script").forEach(node => node.remove()); }
  const changes: HtmlDiffChange[] = [], hiddenChanges: HtmlHiddenChange[] = [];
  const regions = new Map<Element, HtmlDiffChange>();
  const changeElements = new Map<string, Element>();
  const hiddenChange = (label: string, oldValue: string, newValue: string) => {
    if (oldValue !== newValue) hiddenChanges.push({ label, before: oldValue, after: newValue });
  };
  hiddenChange("Page title", before.title, headSource ? after.title : "");


  function region(target: Element, kind: HtmlDiffChange["kind"], summary: string) {
    const existing = regions.get(target);
    if (existing) { if (existing.kind !== kind) existing.kind = "modified"; return; }
    const change: HtmlDiffChange = { id: `mardoc-change-${changes.length + 1}`, kind, summary: compact(summary).slice(0, 160) || `${kind} ${target.localName}` };
    changes.push(change); regions.set(target, change); changeElements.set(change.id, target);
    target.setAttribute("data-mardoc-change-id", change.id);
  }
  function textRegion(parent: Element, summary: string) {
    let target = parent;
    while (!blocks.test(target.tagName) && target.parentElement && target.parentElement !== after.body) target = target.parentElement;
    region(target, "modified", summary);
  }
  function marker(parent: Element, value: string, kind: "added" | "removed") {
    const mark = parent.namespaceURI === SVG ? after.createElementNS(SVG, "tspan") : after.createElement("span");
    mark.setAttribute("data-mardoc-diff", kind);
    mark.textContent = value;
    return mark;
  }
  function cleanRemoved(node: Element) {
    node.querySelectorAll("script,style,link,meta,noscript,template").forEach(child => child.remove());
    for (const el of [node, ...Array.from(node.querySelectorAll("*"))]) {
      for (const attr of Array.from(el.attributes)) if (/^on/i.test(attr.name) || attr.name === "srcdoc") el.removeAttribute(attr.name);
      // Removed source IDs must not shadow IDs belonging to the current revision.
      el.removeAttribute("id");
      el.removeAttribute("data-mardoc-change-id");
    }
  }
  function collectMetadata(node: Element, kind: "added" | "removed") {
    for (const el of [node, ...Array.from(node.querySelectorAll("*"))]) {
      if (metadata.has(el.localName)) hiddenChange(`${el.localName} (${kind})`, kind === "removed" ? el.textContent || "" : "", kind === "added" ? el.textContent || "" : "");
      for (const attr of ["aria-label", "alt", "title"]) if (el.hasAttribute(attr))
        hiddenChange(`${el.localName} ${attr}`, kind === "removed" ? el.getAttribute(attr)! : "", kind === "added" ? el.getAttribute(attr)! : "");
    }
  }
  function annotate(node: Node, parent: Element, kind: "added" | "removed"): Node | null {
    if (skip(node)) return null;
    if (element(node)) {
      collectMetadata(node, kind);
      if (hidden(node)) return kind === "added" ? node : null;
      if (kind === "removed") { cleanRemoved(node); node.querySelectorAll("title,desc").forEach(el => el.remove()); }
      node.setAttribute("data-mardoc-diff", kind);
      region(node, kind, node.textContent || node.getAttribute("alt") || node.localName);
      return node;
    }
    if (!compact(node.textContent || "")) return node;
    const mark = marker(parent, node.textContent || "", kind);
    region(mark, kind, node.textContent || "");
    return mark;
  }
  function compare(oldNode: Node, newNode: Node, parent: Element): Node[] {
    if (element(oldNode) && element(newNode)) {
      if (hidden(newNode)) {
        hiddenChange(newNode.localName, oldNode.textContent || "", newNode.textContent || "");
        return [newNode];
      }
      if (newNode.localName === "a") hiddenChange("Link destination", oldNode.getAttribute("href") || "", newNode.getAttribute("href") || "");
      for (const attr of ["aria-label", "alt", "title"])
        hiddenChange(`${newNode.localName}${newNode.id ? `#${newNode.id}` : ""} ${attr}`, oldNode.getAttribute(attr) || "", newNode.getAttribute(attr) || "");
      mergeChildren(oldNode, newNode);
      return [newNode];
    }
    if (oldNode.nodeType === 3 && newNode.nodeType === 3) {
      if (oldNode.textContent === newNode.textContent) return [newNode];
      if (!compact(oldNode.textContent || "") && !compact(newNode.textContent || "")) return [newNode];
      textRegion(parent, newNode.textContent || oldNode.textContent || "");
      // Bound expensive token comparison for generated or minified text nodes.
      const oldText = oldNode.textContent || "", newText = newNode.textContent || "";
      const fallback = [{ value: oldText, removed: true, added: false }, { value: newText, added: true, removed: false }];
      const parts = oldText.length + newText.length > 100_000
        ? fallback
        : diffWords(oldText, newText, { maxEditLength: 2000 }) || fallback;
      return parts.map(part => part.added || part.removed
        ? marker(parent, part.value, part.added ? "added" : "removed")
        : after.createTextNode(part.value));
    }
    return [newNode];
  }
  function mergeChildren(oldParent: Element, newParent: Element) {
    const oldNodes = Array.from(oldParent.childNodes).filter(node => !skip(node));
    const newNodes = Array.from(newParent.childNodes).filter(node => !skip(node));
    const pairs = [...anchors(oldNodes, newNodes), [oldNodes.length, newNodes.length] as [number, number]];
    let oldStart = 0, newStart = 0;
    for (const [oldEnd, newEnd] of pairs) {
      // Pair edited nodes between unchanged anchors, retaining the new node's markup.
      let oldIndex = oldStart;
      for (let newIndex = newStart; newIndex < newEnd; newIndex++) {
        const current = newNodes[newIndex];
        let match = oldIndex;
        while (match < oldEnd && !compatible(oldNodes[match], current)) match++;
        if (match < oldEnd) {
          while (oldIndex < match) {
            const removed = annotate(after.importNode(oldNodes[oldIndex++], true), newParent, "removed");
            if (removed) newParent.insertBefore(removed, current);
          }
          const replacement = compare(oldNodes[oldIndex++], current, newParent);
          if (replacement.length !== 1 || replacement[0] !== current) {
            const fragment = after.createDocumentFragment();
            fragment.append(...replacement);
            newParent.replaceChild(fragment, current);
          }
        } else {
          const added = annotate(current, newParent, "added");
          if (added !== current && added) newParent.replaceChild(added, current);
        }
      }
      const reference = newNodes[newEnd] || null;
      while (oldIndex < oldEnd) {
        const removed = annotate(after.importNode(oldNodes[oldIndex++], true), newParent, "removed");
        if (removed) newParent.insertBefore(removed, reference);
      }
      if (oldEnd < oldNodes.length) compare(oldNodes[oldEnd], newNodes[newEnd], newParent);
      oldStart = oldEnd + 1; newStart = newEnd + 1;
    }
  }
  mergeChildren(before.body, after.body);
  // Sort regions in document order, including removals inserted before unchanged anchors.
  changes.sort((a, b) => {
    const left = changeElements.get(a.id)!;
    const right = changeElements.get(b.id)!;
    return left.compareDocumentPosition(right) & 4 ? -1 : 1;
  });
  const style = after.createElement("style");
  style.setAttribute("data-mardoc-diff-styles", "");
  style.textContent = `html [data-mardoc-diff="added"]{background-color:#bbf7d0!important;color:#14532d!important;text-decoration:none!important}html [data-mardoc-diff="removed"]{background-color:#fecaca!important;color:#7f1d1d!important;text-decoration:line-through!important}html svg [data-mardoc-diff="added"]{fill:#15803d!important}html svg [data-mardoc-diff="removed"]{fill:#b91c1c!important}html [data-mardoc-change-id]{scroll-margin-block:5rem}`;
  after.head.appendChild(style);
  return { html: `${after.doctype ? "<!DOCTYPE html>\n" : ""}${after.documentElement.outerHTML}`, changes, hiddenChanges };
}
