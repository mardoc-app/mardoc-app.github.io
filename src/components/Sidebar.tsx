"use client";

import React, { useState } from "react";
import {
  FileText,
  Folder,
  FolderOpen,
  GitPullRequest,
  GitMerge,
  ChevronRight,
  ChevronDown,
  Plus,
  Loader2,
} from "lucide-react";
import { RepoFile } from "@/types";
import { useApp } from "@/lib/app-context";

function FileTreeItem({
  file,
  depth,
  onSelect,
  selectedPath,
}: {
  file: RepoFile;
  depth: number;
  onSelect: (file: RepoFile) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = file.path === selectedPath;

  if (file.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
          )}
          {expanded ? (
            <FolderOpen size={14} className="text-[var(--accent)] shrink-0" />
          ) : (
            <Folder size={14} className="text-[var(--accent)] shrink-0" />
          )}
          <span className="text-[var(--text-primary)] truncate">{file.name}</span>
        </button>
        {expanded && file.children && (
          <div>
            {file.children.map((child) => (
              <FileTreeItem
                key={child.id}
                file={child}
                depth={depth + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(file)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors ${
        isSelected
          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
          : "hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]"
      }`}
      style={{ paddingLeft: `${depth * 16 + 8 + 18}px` }}
    >
      <FileText size={14} className="shrink-0" />
      <span className="truncate">{file.name}</span>
    </button>
  );
}

export default function Sidebar() {
  const {
    repoFiles,
    pullRequests,
    currentRepo,
    isDemoMode,
    loadingFiles,
    loadingPRs,
    openFile,
    setSelectedPR,
    setCurrentView,
    selectedFile,
    selectedPR,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"files" | "prs">("files");

  return (
    <aside className="w-64 shrink-0 h-full border-r border-[var(--border)] bg-[var(--surface-secondary)] flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab("files")}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "files"
              ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <FileText size={14} />
            Files
          </span>
        </button>
        <button
          onClick={() => setActiveTab("prs")}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "prs"
              ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <GitPullRequest size={14} />
            PRs
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "files" ? (
          loadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : repoFiles.length === 0 ? (
            <div className="text-center py-8 px-3">
              <p className="text-sm text-[var(--text-muted)]">
                {currentRepo
                  ? "No markdown files found in this repository."
                  : "Open Settings to connect a repository."}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {repoFiles.map((file) => (
                <FileTreeItem
                  key={file.id}
                  file={file}
                  depth={0}
                  onSelect={(f) => openFile(f)}
                  selectedPath={selectedFile?.path || null}
                />
              ))}
            </div>
          )
        ) : loadingPRs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : (
          <div className="space-y-1">
            {/* Create review PR button */}
            <button
              onClick={() => setCurrentView("pr-review")}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors mb-2"
            >
              <Plus size={14} />
              New Review
            </button>

            {pullRequests.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                No pull requests found.
              </p>
            ) : (
              pullRequests.map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => {
                    setSelectedPR(pr);
                    setCurrentView("pr-diff");
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                    selectedPR?.id === pr.id
                      ? "bg-[var(--accent-muted)]"
                      : "hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {pr.status === "merged" ? (
                      <GitMerge size={14} className="text-purple-500 shrink-0 mt-0.5" />
                    ) : pr.status === "closed" ? (
                      <GitPullRequest size={14} className="text-red-500 shrink-0 mt-0.5" />
                    ) : (
                      <GitPullRequest size={14} className="text-green-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--text-primary)] truncate">
                        {pr.title}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        #{pr.number} by {pr.author}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="text-xs text-[var(--text-muted)] font-mono truncate">
          {currentRepo || "demo mode"}
        </div>
        {isDemoMode && (
          <div className="text-xs text-[var(--accent)] mt-0.5">
            Using sample data
          </div>
        )}
      </div>
    </aside>
  );
}
