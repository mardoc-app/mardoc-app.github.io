"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parseSourceDiff, SOURCE_DIFF_PAGE_SIZE } from "@/lib/source-diff";
import type { PRFile } from "@/types";
import ReviewDock from "./ReviewDock";
import ReviewOnGitHub from "./ReviewOnGitHub";

export interface SourceDiffViewerProps {
  file: PRFile;
  repoFullName: string;
  prNumber: number;
  returnPath?: string;
  onReturn?: () => void;
  reviewDetails?: (close: () => void) => ReactNode;
}

/** Non-document files are visible without entering the Markdown rendering path. */
export default function SourceDiffViewer({ file, repoFullName, prNumber, returnPath, onReturn, reviewDetails }: SourceDiffViewerProps) {
  const diff = useMemo(() => parseSourceDiff(file.patch, file.additions, file.deletions), [file.patch, file.additions, file.deletions]);
  const [visibleLines, setVisibleLines] = useState(SOURCE_DIFF_PAGE_SIZE);
  const [wrap, setWrap] = useState(false);
  useEffect(() => { setVisibleLines(SOURCE_DIFF_PAGE_SIZE); }, [file.path, file.patch]);
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex-1 overflow-auto p-6">
      <h2 className="break-all font-mono text-sm">{file.path}</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{file.changeType || file.status}</p>
      {file.basePath && file.basePath !== file.path && <p className="mt-2 break-all text-sm">Previous path: {file.basePath}</p>}
      <p className="mt-2 text-xs text-[var(--text-muted)]">+{file.additions ?? "?"} / −{file.deletions ?? "?"} · Add code review comments on GitHub.</p>
      {diff.partial && diff.lines.length > 0 && <p role="status" className="mt-3 rounded border border-[var(--border)] p-3 text-sm">
        Partial preview. Open GitHub to review the complete diff.
      </p>}
      {diff.lines.length > 0 ? <>
        <div className="mt-4 overflow-x-auto rounded border border-[var(--border)]">
          <table aria-label={`Source diff for ${file.path}`} className="w-full border-collapse font-mono text-xs leading-6">
            <thead className="sr-only"><tr><th>Old line</th><th>New line</th><th>Change</th><th>Source</th></tr></thead>
            <tbody>{diff.lines.slice(0, visibleLines).map((line, index) => <tr key={index}
              className={line.kind === "addition" ? "bg-[var(--diff-add)] text-[var(--diff-add-text)]" :
                line.kind === "deletion" ? "bg-[var(--diff-remove)] text-[var(--diff-remove-text)]" :
                line.kind === "hunk" ? "bg-[var(--surface-secondary)] text-[var(--text-muted)]" : ""}>
              <td className="w-12 select-none px-2 text-right align-top text-[var(--text-muted)]">{line.oldLine}</td>
              <td className="w-12 select-none px-2 text-right align-top text-[var(--text-muted)]">{line.newLine}</td>
              <td className="w-6 select-none text-center align-top" aria-label={line.kind === "addition" ? "Added" : line.kind === "deletion" ? "Removed" : undefined}>
                {line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : ""}
              </td>
              <td className={`px-2 align-top ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>{line.text || "\u00a0"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {visibleLines < diff.lines.length && <button type="button" className="mt-3 min-h-11 rounded border border-[var(--border)] px-3 text-sm"
          onClick={() => setVisibleLines(count => count + SOURCE_DIFF_PAGE_SIZE)}>Show next {SOURCE_DIFF_PAGE_SIZE} lines</button>}
      </> : <p className="mt-4 text-sm text-[var(--text-muted)]">
        {file.changeType === "renamed" && file.additions === 0 && file.deletions === 0 ?
          "Renamed without textual changes." : "No text preview is available for this file. It may be binary, too large, or contain only metadata changes. Review it on GitHub."}
      </p>}
    </div>
    <ReviewDock path={file.path} returnPath={returnPath} onReturn={onReturn}
      controls={<span className="text-xs text-[var(--text-muted)]">Source diff</span>}
      actions={<ReviewOnGitHub repo={repoFullName} pr={prNumber} path={file.path} />}>
      {close => <>
        <p className="break-all border-b border-[var(--border)] px-4 py-3 font-mono text-xs">{file.path}</p>
        <button type="button" className="min-h-11 px-4 text-xs" aria-pressed={wrap} onClick={() => setWrap(value => !value)}>Wrap source lines</button>
        {reviewDetails?.(close)}
      </>}
    </ReviewDock>
  </div>;
}
