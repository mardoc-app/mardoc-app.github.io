import { blockToHtml } from "./diff-blocks";
import type { CommentTarget } from "./comment-target";

export interface LocatedComment {
  status: "found" | "range" | "outdated" | "file" | "unknown" | "missing" | "ambiguous";
  blocks: HTMLElement[];
  parts: { node: Text; start: number; end: number }[];
}
export const commentLocationMessages: Record<LocatedComment["status"], string> = {
  found: "Comment location highlighted.",
  range: "Source block highlighted. No exact selection quote is available.",
  outdated: "This comment refers to an older revision. Its original location is not shown in the current document.",
  file: "This comment applies to the whole file, not a text selection.",
  unknown: "This comment does not have enough location information to jump safely.",
  missing: "The commented text could not be located in this view.",
  ambiguous: "More than one passage matches this comment. No location was selected.",
};

/** Locate against side-tagged source blocks, never the first plausible text match. */
export function locateMarkdownComment(root: HTMLElement, target: CommentTarget | undefined, quote: string, source?: string): LocatedComment {
  const result = (status: LocatedComment["status"], blocks: HTMLElement[] = [], parts: LocatedComment["parts"] = []): LocatedComment => ({status,blocks,parts});
  if (target?.status === "outdated") return result("outdated");
  if (target?.status === "file") return result("file");
  if (target && (target.status !== "current" || !target.side || (target.startSide && target.startSide !== target.side))) return result("unknown");
  const side = target?.side || "RIGHT"; // Legacy quote-only comments were created on head.
  let blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-review-side]"))
    .filter(block => block.dataset.reviewSide === side);
  if (target) {
    const start = target.startLine, end = target.endLine;
    if (!start || !end || start > end) return result("unknown");
    blocks = blocks.filter(block => Number(block.dataset.reviewEnd) >= start && Number(block.dataset.reviewStart) <= end);
    if (!blocks.length) return result("missing");
  }
  if (target && source !== undefined) {
    const lines = source.split("\n");
    if (target.endLine! > lines.length) return result("missing");
    if (quote.trim()) {
      const projected = root.ownerDocument.createElement("div");
      projected.innerHTML = blockToHtml(lines.slice(target.startLine! - 1, target.endLine).join("\n"));
      projected.querySelectorAll("script,style").forEach(node => node.remove());
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      if (!normalize(projected.textContent || "").includes(normalize(quote))) return result("missing");
    }
  }
  if (!quote.trim()) return target && blocks.length ? result("range", blocks) : result("unknown");

  // Retain an exact DOM offset for each normalized character, including text
  // split by emphasis/link tags. Block boundaries count as whitespace.
  const chars: string[] = [];
  const offsets: ({node:Text; offset:number} | null)[] = [];
  const append = (ch: string, offset: {node:Text;offset:number} | null) => {
    if (/\s/.test(ch)) {
      if (chars[chars.length - 1] === " ") return;
      chars.push(" "); offsets.push(offset);
    } else { chars.push(ch); offsets.push(offset); }
  };
  for (const block of blocks) {
    if (chars.length) append(" ", null);
    const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,svg,.mermaid-diagram,[hidden],[aria-hidden="true"]')) continue;
      if (side === "RIGHT" && parent.closest(".diff-removed")) continue;
      const text = node.textContent || "";
      for (let i=0; i<text.length; i++) append(text[i], {node:node as Text,offset:i});
    }
  }
  const text = chars.join(""), search = quote.replace(/\s+/g, " ").trim();
  const start = text.indexOf(search);
  if (start < 0) return result("missing");
  if (text.indexOf(search, start + 1) >= 0) return result("ambiguous");
  const parts: LocatedComment["parts"] = [];
  for (let i=start; i<start+search.length; i++) {
    const point = offsets[i];
    if (!point) continue;
    const last = parts[parts.length - 1];
    if (last?.node === point.node) last.end = point.offset + 1;
    else parts.push({node:point.node,start:point.offset,end:point.offset+1});
  }
  return parts.length ? result("found", blocks, parts) : result("missing");
}

/** Wrap only matched text fragments; preserve links and other DOM structure. */
export function markCommentLocation(location: LocatedComment, id: string): HTMLElement[] {
  return location.parts.map(({node,start,end}) => {
    const range = node.ownerDocument.createRange();
    range.setStart(node,start); range.setEnd(node,end);
    const mark = node.ownerDocument.createElement("mark");
    mark.className = "selection-comment-highlight";
    mark.dataset.commentId = id;
    range.surroundContents(mark);
    return mark;
  });
}

export function clearCommentMarks(root: HTMLElement): void {
  root.querySelectorAll("mark[data-comment-id]").forEach(mark => {
    const parent = mark.parentNode;
    mark.replaceWith(...Array.from(mark.childNodes));
    parent?.normalize();
  });
}
