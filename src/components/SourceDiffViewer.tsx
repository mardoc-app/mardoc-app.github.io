"use client";

import type { ReactNode } from "react";
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
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex-1 overflow-auto p-6">
      <h2 className="break-all font-mono text-sm">{file.path}</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{file.changeType || file.status}</p>
      {file.basePath && file.basePath !== file.path && <p className="mt-2 break-all text-sm">Previous path: {file.basePath}</p>}
      <p className="mt-4 text-sm">Review this file and add code comments on GitHub.</p>
    </div>
    <ReviewDock path={file.path} returnPath={returnPath} onReturn={onReturn}
      controls={<span className="text-xs text-[var(--text-muted)]">File review</span>}
      actions={<ReviewOnGitHub repo={repoFullName} pr={prNumber} path={file.path} />}>
      {close => <>
        <p className="break-all border-b border-[var(--border)] px-4 py-3 font-mono text-xs">{file.path}</p>
        {reviewDetails?.(close)}
      </>}
    </ReviewDock>
  </div>;
}
