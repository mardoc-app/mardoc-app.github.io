import type { PRComment, PRFile } from "@/types";

export interface CommentTarget {
  path: string;
  side?: "LEFT" | "RIGHT";
  startSide?: "LEFT" | "RIGHT";
  commitId?: string;
  /** Issue-comment fallback coordinates are pinned, not remapped by GitHub. */
  revisionPinned?: boolean;
  originalCommitId?: string;
  startLine?: number;
  endLine?: number;
  originalStartLine?: number;
  originalEndLine?: number;
  status: "current" | "outdated" | "file" | "unknown";
}

interface ReviewLocation {
  path: string; side?: string; start_side?: string | null;
  commit_id?: string; original_commit_id?: string;
  line?: number | null; start_line?: number | null;
  original_line?: number | null; original_start_line?: number | null;
  subject_type?: string;
}

const side = (value?: string | null) => value === "LEFT" || value === "RIGHT" ? value : undefined;
const line = (value?: number | null) => value && Number.isInteger(value) && value > 0 ? value : undefined;

/** Original coordinates are historical evidence, never current-line substitutes. */
export function reviewCommentTarget(comment: ReviewLocation): CommentTarget {
  const endLine = line(comment.line);
  const originalEndLine = line(comment.original_line);
  return {
    path: comment.path, side: side(comment.side), startSide: side(comment.start_side),
    commitId: comment.commit_id, originalCommitId: comment.original_commit_id,
    startLine: endLine ? line(comment.start_line) ?? endLine : undefined, endLine,
    originalStartLine: originalEndLine ? line(comment.original_start_line) ?? originalEndLine : undefined,
    originalEndLine,
    status: comment.subject_type === "file" ? "file" : endLine ? "current"
      : comment.line === null && originalEndLine ? "outdated" : "unknown",
  };
}

/** Recognize only MarDoc's legacy leading selection quote; keep the body intact. */
export function selectionQuote(body: string): string | undefined {
  return /^> _"([\s\S]+?)"_\r?\n\r?\n/.exec(body)?.[1];
}

/** Match an exact current path first; old paths only identify a unique rename. */
export function commentFileIndex(comment: PRComment, files: PRFile[]): number {
  const path = comment.target?.path || comment.pendingPath || comment.path;
  if (!path) return -1;
  const current = files.findIndex(file => file.path === path);
  if (current >= 0) return current;
  const renamed = files.map((file, index) => file.basePath === path ? index : -1).filter(index => index >= 0);
  return renamed.length === 1 ? renamed[0] : -1;
}

/** GitHub does not update issue-comment coordinates when a PR revision changes. */
export function commentTargetForFile(target: CommentTarget | undefined, file: PRFile): CommentTarget | undefined {
  if (!target?.revisionPinned) return target;
  const revision = target.side === "LEFT" ? file.baseRef : file.headRef;
  return {...target,status: !target.commitId || !revision ? "unknown"
    : target.commitId === revision ? "current" : "outdated"};
}
