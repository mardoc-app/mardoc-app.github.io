import type { PendingInlineComment } from "./github-api";
import type { CommentTarget } from "./comment-target";

const context = (path: string, start: number, end: number) =>
  `**${path}** (L${start === end ? end : `${start}-L${end}`})\n\n`;

/** Keep a human-readable GitHub comment and a versioned location for MarDoc reloads. */
export function formatReviewFallback(comment: PendingInlineComment): string {
  const startLine = comment.startLine || comment.line;
  const metadata = {path:comment.path,side:comment.side || "RIGHT",startLine,endLine:comment.line,commitId:comment.commitId};
  return `<!-- mardoc-review-comment:v1 ${encodeURIComponent(JSON.stringify(metadata))} -->\n` +
    context(comment.path,startLine,comment.line) + comment.body;
}

export function parseReviewFallback(body: string): {target: CommentTarget; body: string} | undefined {
  const match = /^<!-- mardoc-review-comment:v1 ([^\n]{1,16384}) -->\n/.exec(body);
  if (!match) return;
  try {
    const data = JSON.parse(decodeURIComponent(match[1]));
    if (!data || typeof data.path !== "string" || !data.path || data.path.length > 4096 ||
      /[\r\n\0]/.test(data.path) || (data.side !== "LEFT" && data.side !== "RIGHT") ||
      !Number.isSafeInteger(data.startLine) || !Number.isSafeInteger(data.endLine) ||
      data.startLine < 1 || data.endLine < data.startLine ||
      (data.commitId !== undefined && (typeof data.commitId !== "string" || !/^[a-f\d]{40}$/i.test(data.commitId)))) return;
    const prefix = context(data.path,data.startLine,data.endLine);
    const rest = body.slice(match[0].length);
    if (!rest.startsWith(prefix)) return;
    return {body:rest.slice(prefix.length),target:{path:data.path,side:data.side,
      startLine:data.startLine,endLine:data.endLine,commitId:data.commitId,
      revisionPinned:true,status:data.commitId ? "current" : "unknown"}};
  } catch { return; }
}
