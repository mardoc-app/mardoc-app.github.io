"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Settings, X, RefreshCw, Lock, Globe, Search, FolderOpen } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { fetchUserRepos } from "@/lib/github-api";
import FeedbackAISettings from "./FeedbackAISettings";
import GitHubConnectionTab from "./GitHubConnectionTab";
import { INSTALL_URL } from "./sign-in-text";
import { isSignInKey } from "@/lib/auth/session";
import * as safeStorage from "@/lib/safe-storage";
import {
  getImageUploadFolder,
  setImageUploadFolder,
  DEFAULT_IMAGE_FOLDER,
} from "@/lib/image-path-config";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open on the GitHub Connection tab with the token form showing (F-42, F-44). */
  showPat?: boolean;
}

export default function SettingsPanel({ isOpen, onClose, showPat }: SettingsPanelProps) {
  const {
    isAuthenticated,
    sessionKey,
    currentRepo,
    setCurrentRepo,
    isDemoMode,
  } = useApp();

  const [patOpen, setPatOpen] = useState(false);
  useEffect(() => {
    if (isOpen && showPat) { setActiveTab("connect"); setPatOpen(true); }
  }, [isOpen, showPat]);
  const [repoInput, setRepoInput] = useState(currentRepo || "");
  const [imageFolderInput, setImageFolderInput] = useState("");
  const [imageFolderSaved, setImageFolderSaved] = useState(false);
  const [userRepos, setUserRepos] = useState<
    { fullName: string; description: string; isPrivate: boolean }[]
  >([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"connect" | "repo" | "ai">(
    isAuthenticated ? "repo" : "connect"
  );

  // Filter repos based on search input
  const filteredRepos = useMemo(() => {
    if (!repoFilter.trim()) return userRepos;
    const query = repoFilter.toLowerCase();
    return userRepos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query)
    );
  }, [userRepos, repoFilter]);

  // Load the per-repo image folder setting every time the panel opens
  // or the current repo changes, so the input shows the current value.
  useEffect(() => {
    if (isOpen) {
      setImageFolderInput(getImageUploadFolder(currentRepo ?? undefined));
      setImageFolderSaved(false);
    }
  }, [isOpen, currentRepo]);

  const handleSaveImageFolder = () => {
    if (!currentRepo) return;
    setImageUploadFolder(currentRepo, imageFolderInput);
    // Re-read so the input reflects the sanitized form (e.g., trailing
    // slash stripped, invalid input bounced back to default).
    const saved = getImageUploadFolder(currentRepo);
    setImageFolderInput(saved);
    setImageFolderSaved(true);
    setTimeout(() => setImageFolderSaved(false), 1500);
  };

  // Load user repos: show cached immediately, refresh in background
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      // Show cached repos instantly
      const cached = safeStorage.getItem("mardoc_user_repos");
      if (cached) {
        try {
          setUserRepos(JSON.parse(cached));
        } catch { /* ignore corrupt cache */ }
      }

      // Fetch fresh list in background
      setLoadingRepos(!cached);
      fetchUserRepos()
        .then((repos) => {
          setUserRepos(repos);
          safeStorage.setItem("mardoc_user_repos", JSON.stringify(repos));
        })
        .catch(console.error)
        .finally(() => setLoadingRepos(false));
    }
  }, [isAuthenticated, isOpen]);

  const handleSelectRepo = (repo: string) => {
    setRepoInput(repo);
    setCurrentRepo(repo);
    onClose();
  };

  const handleManualRepo = () => {
    if (repoInput.trim()) {
      setCurrentRepo(repoInput.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-black/40 bg-[var(--surface)]">
      <div className="bg-[var(--surface)] w-full h-full flex flex-col md:h-auto md:max-h-[80vh] md:max-w-lg md:rounded-xl md:shadow-2xl md:border md:border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[var(--text-secondary)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="toolbar-btn"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-5">
          <button
            onClick={() => setActiveTab("connect")}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "connect"
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            GitHub Connection
          </button>
          <button
            onClick={() => setActiveTab("repo")}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "repo"
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Repository
          </button>
          <button type="button" onClick={() => setActiveTab("ai")}
            className={`px-3 py-2.5 text-sm font-medium ${activeTab === "ai" ? "border-b-2 border-[var(--accent)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>AI feedback</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "ai" ? <FeedbackAISettings /> : activeTab === "connect" ? (
            <GitHubConnectionTab
              patOpen={patOpen}
              setPatOpen={setPatOpen}
              onPatConnected={() => setActiveTab("repo")}
              onDisconnected={() => {
                setUserRepos([]);
                safeStorage.removeItem("mardoc_user_repos");
                setActiveTab("connect");
              }}
            />
          ) : (
            <div className="space-y-4">
              {/* Manual repo input */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Repository (owner/name or full URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="e.g., mardoc-app/mardoc-app.github.io"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleManualRepo();
                    }}
                  />
                  <button
                    onClick={handleManualRepo}
                    disabled={!repoInput.trim()}
                    className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
                  >
                    Open
                  </button>
                </div>
              </div>

              {/* User repos list */}
              {isAuthenticated && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]">
                      Your repositories
                      {userRepos.length > 0 && (
                        <span className="text-[var(--text-muted)] font-normal ml-1">
                          ({filteredRepos.length}{repoFilter ? ` of ${userRepos.length}` : ""})
                        </span>
                      )}
                    </label>
                    <button
                      onClick={() => {
                        setLoadingRepos(true);
                        fetchUserRepos()
                          .then((repos) => {
                            setUserRepos(repos);
                            safeStorage.setItem("mardoc_user_repos", JSON.stringify(repos));
                          })
                          .catch(console.error)
                          .finally(() => setLoadingRepos(false));
                      }}
                      className="toolbar-btn"
                      title="Refresh"
                    >
                      <RefreshCw size={12} className={loadingRepos ? "animate-spin" : ""} />
                    </button>
                  </div>

                  {/* Search/filter input */}
                  {userRepos.length > 0 && (
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={repoFilter}
                        onChange={(e) => setRepoFilter(e.target.value)}
                        placeholder="Filter repositories..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      />
                      {repoFilter && (
                        <button
                          onClick={() => setRepoFilter("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {loadingRepos ? (
                    <div className="text-sm text-[var(--text-muted)] py-4 text-center">
                      Loading repositories...
                    </div>
                  ) : filteredRepos.length > 0 ? (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {filteredRepos.map((repo) => (
                        <button
                          key={repo.fullName}
                          onClick={() => handleSelectRepo(repo.fullName)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            currentRepo === repo.fullName
                              ? "bg-[var(--accent-muted)] border border-[var(--accent)]"
                              : "hover:bg-[var(--surface-hover)] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {repo.isPrivate ? (
                              <Lock size={12} className="text-[var(--text-muted)]" />
                            ) : (
                              <Globe size={12} className="text-[var(--text-muted)]" />
                            )}
                            <span className="text-sm font-mono text-[var(--text-primary)]">
                              {repo.fullName}
                            </span>
                          </div>
                          {repo.description && (
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 ml-5 truncate">
                              {repo.description}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : userRepos.length > 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-2 text-center">
                      No repos matching &ldquo;{repoFilter}&rdquo;
                    </p>
                  ) : (
                    isSignInKey(sessionKey) ? (
                      <div className="text-sm text-[var(--text-secondary)] py-2 space-y-2" data-testid="no-installations">
                        <p>MarDoc isn&rsquo;t installed on any repository you can reach.</p>
                        <p>
                          <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
                            Install MarDoc on a repository
                          </a>
                          , or ask a repository owner to install it.
                        </p>
                        <button type="button" onClick={() => { setActiveTab("connect"); setPatOpen(true); }} className="text-[var(--accent)] underline">
                          Use a personal access token
                        </button>
                      </div>
                    ) : (
                    <p className="text-sm text-[var(--text-muted)] py-2">
                      No repositories found. Try entering a repo name manually above.
                    </p>
                    )
                  )}
                </div>
              )}

              {/* Image upload folder — configurable per repo. The
                  paste / drag-drop flow commits images under this
                  folder; defaults to docs/images. */}
              {currentRepo && (
                <div className="pt-4 border-t border-[var(--border)]">
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <FolderOpen size={14} className="text-[var(--text-muted)]" />
                      Image upload folder
                    </span>
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-2">
                    Where paste / drag-drop uploads commit in{" "}
                    <span className="font-mono">{currentRepo}</span>.
                    Default: <span className="font-mono">{DEFAULT_IMAGE_FOLDER}</span>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={imageFolderInput}
                      onChange={(e) => {
                        setImageFolderInput(e.target.value);
                        setImageFolderSaved(false);
                      }}
                      placeholder={DEFAULT_IMAGE_FOLDER}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveImageFolder();
                      }}
                    />
                    <button
                      onClick={handleSaveImageFolder}
                      className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      {imageFolderSaved ? "Saved ✓" : "Save"}
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                    Examples: <span className="font-mono">docs/images</span>,{" "}
                    <span className="font-mono">docs/assets</span>,{" "}
                    <span className="font-mono">src/assets/img</span>,{" "}
                    <span className="font-mono">public/images</span>
                  </p>
                </div>
              )}

              {!isAuthenticated && (
                <div className="bg-[var(--accent-muted)] rounded-lg p-3">
                  <p className="text-xs text-[var(--accent)]">
                    Connect your GitHub account in the "GitHub Connection" tab to browse your repositories.
                    You can also type any public repo name above.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
