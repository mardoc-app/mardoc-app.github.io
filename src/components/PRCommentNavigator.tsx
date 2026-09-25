"use client";

import { useMemo, useState } from "react";
import type { PRComment, PRFile } from "@/types";
import { commentFileIndex, commentTargetForFile } from "@/lib/comment-target";

/** Full-PR index; the document's panel remains the place to reply and resolve. */
export default function PRCommentNavigator({comments, files, onJump}: {
  comments: PRComment[]; files: PRFile[]; onJump: (comment: PRComment, index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const result = new Map<string, PRComment[]>();
    for (const comment of comments) {
      const index = commentFileIndex(comment, files);
      const path = index >= 0 ? files[index].path : comment.target?.path || comment.pendingPath || comment.path || "";
      const group = result.get(path) || [];
      group.push(comment);
      result.set(path, group);
    }
    return result;
  }, [comments, files]);
  return <section className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]" aria-label="PR comment navigator">
    <button type="button" className="px-4 min-h-11 text-sm text-[var(--accent)]" aria-expanded={open}
      aria-controls="pr-comment-index" onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">{open ? "▾" : "▸"}</span> All PR comments ({comments.length})
    </button>
    {open && <div id="pr-comment-index" className="max-h-[35vh] overflow-y-auto px-4 pb-3">
      {!comments.length && <p className="text-sm">No comments yet.</p>}
      {Array.from(groups, ([path, group]) => <div key={path} className="mb-3">
        <h2 className="text-xs font-semibold break-all">{path || "General discussion"}</h2>
        {group.map(comment => {
          const index = commentFileIndex(comment, files);
          const target = index >= 0 ? commentTargetForFile(comment.target, files[index]) : comment.target;
          return <article key={comment.id} className="mt-2 rounded border border-[var(--border)] p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <strong>{comment.author}</strong>
              {comment.pending && <span>Pending</span>}
              {target?.revisionPinned && <span>PR conversation</span>}
              {comment.resolved && <span>Resolved</span>}
              {target?.status === "outdated" && <span>Outdated</span>}
              {target?.status === "file" && <span>File comment</span>}
              {target?.side && <span>{target.side === "LEFT" ? "Base" : "Head"}</span>}
            </div>
            <p className="whitespace-pre-wrap break-words">{comment.body}</p>
            {!!comment.replies?.length && <details className="mt-1">
              <summary className="cursor-pointer min-h-11 content-center">{comment.replies.length} replies</summary>
              {comment.replies.map(reply => <p key={reply.id} className="pl-3 whitespace-pre-wrap break-words"><strong>{reply.author}: </strong>{reply.body}</p>)}
            </details>}
            {index >= 0 ? <button type="button" className="min-h-11 text-[var(--accent)]"
              aria-label={`Open comment in ${files[index].path}`}
              onClick={() => { setOpen(false); onJump(comment, index); }}>Open comment →</button>
              : path ? <p className="text-xs text-[var(--text-muted)]">This file is unavailable in this PR’s document list.</p>
              : <p className="text-xs text-[var(--text-muted)]">General PR discussion · no document target</p>}
          </article>;
        })}
      </div>)}
    </div>}
  </section>;
}
