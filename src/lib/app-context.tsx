"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { RepoFile, PullRequest, ViewMode } from "@/types";
import { initOctokit, fetchRepoTree, fetchPullRequests, fetchFileContent } from "./github-api";
import { repoFiles as mockFiles, pullRequests as mockPRs, findFile } from "./mock-data";

interface AppState {
  // Auth
  isAuthenticated: boolean;
  githubToken: string | null;
  setGithubToken: (token: string | null) => void;
  isDemoMode: boolean;

  // Repo
  currentRepo: string | null;
  setCurrentRepo: (repo: string) => void;
  repoFiles: RepoFile[];
  pullRequests: PullRequest[];

  // Navigation
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  selectedFile: RepoFile | null;
  setSelectedFile: (file: RepoFile | null) => void;
  selectedPR: PullRequest | null;
  setSelectedPR: (pr: PullRequest | null) => void;
  fileContent: string;

  // Loading states
  loadingFiles: boolean;
  loadingPRs: boolean;
  loadingContent: boolean;
  error: string | null;

  // Actions
  refreshRepo: () => Promise<void>;
  openFile: (file: RepoFile) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Auth state
  const [githubToken, setGithubTokenState] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Repo state
  const [currentRepo, setCurrentRepoState] = useState<string | null>(null);
  const [repoFilesList, setRepoFiles] = useState<RepoFile[]>(mockFiles);
  const [prList, setPRList] = useState<PullRequest[]>(mockPRs);

  // Navigation
  const [currentView, setCurrentView] = useState<ViewMode>("editor");
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null);
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [fileContent, setFileContent] = useState("");

  // Loading
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!githubToken;

  // Initialize octokit when token changes
  const setGithubToken = useCallback((token: string | null) => {
    setGithubTokenState(token);
    if (token) {
      initOctokit(token);
      setIsDemoMode(false);
    } else {
      setIsDemoMode(true);
      setRepoFiles(mockFiles);
      setPRList(mockPRs);
    }
  }, []);

  // Set current repo and load data
  const setCurrentRepo = useCallback(
    async (repo: string) => {
      setCurrentRepoState(repo);
      setError(null);

      if (!githubToken) return;

      // Load files
      setLoadingFiles(true);
      try {
        const files = await fetchRepoTree(repo);
        setRepoFiles(files);
      } catch (err: any) {
        setError(`Failed to load repository: ${err.message}`);
        setRepoFiles([]);
      } finally {
        setLoadingFiles(false);
      }

      // Load PRs
      setLoadingPRs(true);
      try {
        const prs = await fetchPullRequests(repo, "all");
        setPRList(prs);
      } catch (err: any) {
        console.error("Failed to load PRs:", err);
        setPRList([]);
      } finally {
        setLoadingPRs(false);
      }
    },
    [githubToken]
  );

  // Open a file and load its content
  const openFile = useCallback(
    async (file: RepoFile) => {
      setSelectedFile(file);
      setSelectedPR(null);
      setCurrentView("editor");

      if (isDemoMode) {
        // Use mock data content
        const mockFile = findFile(mockFiles, file.path);
        setFileContent(mockFile?.content || "");
        return;
      }

      if (!currentRepo || !githubToken) return;

      setLoadingContent(true);
      try {
        const content = await fetchFileContent(currentRepo, file.path);
        setFileContent(content);
        // Also store it on the file object for caching
        file.content = content;
      } catch (err: any) {
        setError(`Failed to load file: ${err.message}`);
        setFileContent("");
      } finally {
        setLoadingContent(false);
      }
    },
    [isDemoMode, currentRepo, githubToken]
  );

  // Refresh the current repo
  const refreshRepo = useCallback(async () => {
    if (currentRepo && githubToken) {
      await setCurrentRepo(currentRepo);
    }
  }, [currentRepo, githubToken, setCurrentRepo]);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        githubToken,
        setGithubToken,
        isDemoMode,
        currentRepo,
        setCurrentRepo,
        repoFiles: repoFilesList,
        pullRequests: prList,
        currentView,
        setCurrentView,
        selectedFile,
        setSelectedFile,
        selectedPR,
        setSelectedPR,
        fileContent,
        loadingFiles,
        loadingPRs,
        loadingContent,
        error,
        refreshRepo,
        openFile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
