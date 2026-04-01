"use client";

import React, { useState } from "react";
import { GitPullRequest, Send } from "lucide-react";
import { repoFiles, flattenFiles } from "@/lib/mock-data";

interface PRReviewProps {
  onCreatePR: (title: string, description: string, filePath: string) => void;
}

export default function PRReview({ onCreatePR }: PRReviewProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const allFiles = flattenFiles(repoFiles);

  const handleSubmit = () => {
    if (title.trim() && selectedFile) {
      onCreatePR(title, description, selectedFile);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <GitPullRequest size={28} className="text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Review PR Created!
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            <strong>#{Math.floor(Math.random() * 50 + 44)}</strong> — {title}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            A PR has been created for review discussion on{" "}
            <span className="font-mono">{selectedFile}</span>, even though no
            file changes were made. Reviewers can now comment on the rendered
            document.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-4 text-sm text-[var(--accent)] hover:underline"
          >
            Create another review
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-muted)] flex items-center justify-center">
            <GitPullRequest size={20} className="text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              Create Review PR
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Start a review discussion on any document — no changes required
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* File selector */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Document to review
            </label>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">Select a file...</option>
              {allFiles.map((f) => (
                <option key={f.id} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          </div>

          {/* PR Title */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Review title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Review: API reference accuracy check"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should reviewers focus on?"
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
            />
          </div>

          {/* Info box */}
          <div className="bg-[var(--accent-muted)] rounded-lg px-4 py-3">
            <p className="text-xs text-[var(--accent)] leading-relaxed">
              This creates a pull request for review and commenting purposes only.
              The document content will remain unchanged on the main branch. Reviewers
              can add inline comments on the rendered markdown, and the PR can be
              closed once the review discussion is complete.
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !selectedFile}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={14} />
            Create Review PR
          </button>
        </div>
      </div>
    </div>
  );
}
