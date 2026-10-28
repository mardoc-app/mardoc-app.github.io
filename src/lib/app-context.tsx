"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { RepoFile, PullRequest, PRFile, PRComment, ViewMode } from "@/types";
import { fetchRepoTree, fetchPullRequests, fetchFileContent, fetchPRFileManifest, fetchPRFile, fetchPRComments, fetchDefaultBranch, fetchBranches, fetchPRMarkdownCounts, fetchRevision, fetchPullRequest, expireGitHubSession, setOnAuthError, fetchLoginForToken } from "./github-api";
import { formatApiError } from "./rate-limit";
import { createStalenessGuard } from "./staleness-guard";
import { repoFiles as mockFiles, pullRequests as mockPRs, findFile, flattenFiles } from "./mock-data";
import { parseHash, buildFileHash, buildPRHash, buildRepoHash, buildBranchHash } from "./hash-router";
import * as safeStorage from "./safe-storage";
import { isHtmlFile } from "./file-types";
import { isReloadShortcut, postReloadRequest, shouldApplyFileContent, isBlockedByDirtyEditor } from "./embed-reload";
import { isTrustedInit } from "./embed-init";
import { next as nextSession, initialSessionState, startupCredential, isAttemptStatus, isSignInKey } from "./auth/session";
import * as credential from "./auth/credential";
import type { SessionEffect, SessionEvent, SessionKey, SessionState, StartSignIn } from "./auth/types";
import { EXPIRING_WARNING_MS, USER_CHECK_DEADLINE_MS } from "./auth/contract";
import { createSignInWindow, isTopLevelWindow, type SignInWindow } from "./auth/sign-in-window";

interface AppState {
  // Auth. The token itself is never in React state (I-10): it lives in
  // src/lib/auth/credential.ts. `hasCredential` is true while a PAT, embed
  // or sign-in credential is active (including an expired sign-in);
  // `isAuthenticated` is the same value under its older name.
  isAuthenticated: boolean;
  hasCredential: boolean;
  sessionKey: SessionKey;
  session: SessionState;
  dispatchSession: (event: SessionEvent) => void;
  startSignIn: StartSignIn;
  // Connects a PAT (saved, as today) or, with null, disconnects whatever
  // credential is active. Disconnecting a sign-in keeps a saved PAT (F-53).
  setGithubToken: (token: string | null) => void;
  isDemoMode: boolean;

  // Repo
  currentRepo: string | null;
  defaultBranch: string;
  selectedBranch: string;
  loadSidebarMetadata: (kind: "branches" | "prs") => void;
  loadingBranches: boolean;
  availableBranches: { name: string; isDefault: boolean }[];
  setSelectedBranch: (branch: string) => void;
  setCurrentRepo: (repo: string) => void;
  repoFiles: RepoFile[];
  pullRequests: PullRequest[];
  prStateFilter: "open" | "closed" | "all";
  setPRStateFilter: (state: "open" | "closed" | "all") => void;

  // Navigation
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  selectedFile: RepoFile | null;
  setSelectedFile: (file: RepoFile | null) => void;
  selectedPR: PullRequest | null;
  setSelectedPR: (pr: PullRequest | null) => void;
  fileContent: string;
  fileRevision: string | null;
  refreshDocument: () => void;

  // PR detail state (shared between sidebar and PRDetail)
  prFiles: PRFile[];
  prComments: PRComment[];
  selectedPRFileIdx: number;
  setSelectedPRFileIdx: (idx: number, anchor?: string) => void;
  documentAnchor: string;
  loadingPRFiles: boolean;

  // Loading states
  loadingFiles: boolean;
  loadingPRs: boolean;
  loadingContent: boolean;
  error: string | null;

  // New file for PR
  prBranchForNewFile: string | null;
  prNumberForNewFile: number | null;

  // Actions
  refreshRepo: () => Promise<void>;
  openFile: (file: RepoFile) => Promise<void>;
  openPR: (pr: PullRequest) => void;
  createNewFile: () => void;
  addFileToPR: (pr: PullRequest) => void;
  openLocalFile: (name: string, content: string) => void;
  isEmbedded: boolean;
  // True inside a frame (window.top !== window.self). Sign-in is then not
  // offered; Settings links to MarDoc in a new tab instead (F-19, SR-1).
  isFramed: boolean;
  // Bumped each time the extension re-sends the current file's content
  // (embed-mode reload). Editor includes it in its content-load effect
  // deps so the same filePath re-renders with fresh content.
  reloadNonce: number;
  // Ask the extension to re-read the current file from disk (embed mode).
  // Respects the unsaved-changes guard. No-op outside an embedding frame.
  requestEmbedReload: () => void;

  // Unsaved-changes nav guard. The Editor reports its dirty state via
  // setEditorIsDirty; the navigation actions above check it before switching
  // away. When a guarded navigation is attempted with unsaved changes, the
  // pending action is parked in pendingNavigation and a modal renders inside
  // AppProvider asking the user to confirm or cancel.
  editorIsDirty: boolean;
  setEditorIsDirty: (dirty: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

const TOKEN_KEY = "mardoc_github_token";
const REPO_KEY = "mardoc_current_repo";

// Module-level cache for VS Code init data — survives React Strict Mode remount
let vsCodeInitData: Record<string, any> | null = null;

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Embed mode — detected from URL query param, deferred to avoid hydration mismatch
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [isFramed, setIsFramed] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("embed") === "true") {
      setIsEmbedded(true);
    }
    setIsFramed(!isTopLevelWindow(window));
  }, []);

  // Embed-mode Cmd+C fix.
  //
  // When MarDoc runs inside the VS Code extension's webview, the
  // parent shell's clipboard handling interferes with the browser's
  // native Cmd+C path: VS Code dispatches its own clipboard command
  // against the outer webview document (which has no selection
  // because the selection lives inside our cross-origin iframe),
  // and as a side effect the iframe's text selection is cleared
  // between the two keydown firings the iframe sees for a single
  // Cmd+C press. By the time the browser would fire its native
  // `copy` event, there is nothing to copy — so the clipboard
  // stays empty and the user sees "Cmd+C does nothing".
  //
  // Fix: in embed mode only, attach a capture-phase keydown
  // listener that intercepts the first Cmd+C while the selection
  // is still intact, runs execCommand('copy') synchronously (which
  // writes the current selection to the clipboard — verified to
  // work inside the webview iframe), and preventDefault()s so the
  // parent shell's subsequent handling can't clobber what we just
  // copied. Has no effect outside embed mode.
  useEffect(() => {
    if (!isEmbedded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isCopyShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c";
      if (!isCopyShortcut) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const ok = document.execCommand("copy");
      if (ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isEmbedded]);

  // Auth state — server-safe defaults, hydrated in useEffect. The session
  // record holds no token (I-10); the active token is in credential.ts.
  // `tokenRevision` bumps whenever the active token string changes, so the
  // effects that re-ran on a new token string still do, without the token.
  const [session, setSessionState] = useState<SessionState>(() => initialSessionState());
  const sessionRef = useRef(session);
  const [tokenRevision, setTokenRevision] = useState(0);
  const bumpTokenRevision = useCallback(() => setTokenRevision((n) => n + 1), []);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Repo state
  const [currentRepo, setCurrentRepoState] = useState<string | null>(null);
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [selectedBranch, setSelectedBranchState] = useState("main");
  const [availableBranches, setAvailableBranches] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [repoFilesList, setRepoFiles] = useState<RepoFile[]>(mockFiles);
  const [prList, setPRList] = useState<PullRequest[]>(mockPRs);
  const [prStateFilter, setPRStateFilterState] = useState<"open" | "closed" | "all">("open");

  const [loadingBranches, setLoadingBranches] = useState(false);
  const metadataRequests = useRef<{ branches?: string; prs?: string }>({});

  // Navigation
  const [currentView, setCurrentView] = useState<ViewMode>("editor");
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null);
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileRevision, setFileRevision] = useState<string | null>(null);
  const locationRef = useRef<{ repo: string | null; branch: string }>({ repo: null, branch: "main" });
  const [reloadNonce, setReloadNonce] = useState(0);

  // PR detail state
  const [prFiles, setPRFiles] = useState<PRFile[]>([]);
  const [prComments, setPRComments] = useState<PRComment[]>([]);
  const [selectedPRFileIdx, setSelectedPRFileIdx] = useState(0);
  const [documentAnchor, setDocumentAnchor] = useState("");
  const [loadingPRFiles, setLoadingPRFiles] = useState(false);

  // Loading
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // design.md § App state by session status: `hasCredential` replaces
  // `!!githubToken`. For a PAT or embed token it is exactly that.
  const sessionKey = session.sessionKey;
  const hasCredential = sessionKey !== null;
  const isAuthenticated = hasCredential;
  // A reload ended a sign-in session (F-32, F-37): keep the hash route, but
  // neither navigate it nor load demo data until the user signs in again or
  // continues without signing in.
  const awaitingSignIn = session.status === "sign-in-again" ||
    (isAttemptStatus(session.status) && session.statusBeforeAttempt === "sign-in-again");

  // ─── Unsaved-changes nav guard ───────────────────────────────────────────
  // The Editor calls setEditorIsDirty(true) when there are unsaved edits.
  // The nav-guard ref mirrors that for use inside stable callbacks (so
  // wrapping openFile/openPR/etc doesn't depend on a render-time closure).
  const [editorIsDirty, setEditorIsDirtyState] = useState(false);
  const editorIsDirtyRef = useRef(false);
  const setEditorIsDirty = useCallback((dirty: boolean) => {
    editorIsDirtyRef.current = dirty;
    setEditorIsDirtyState(dirty);
  }, []);

  // The currently-parked navigation when the user has unsaved edits. The
  // confirmation modal reads this and either runs onConfirm (discard edits +
  // perform the nav) or clears it (cancel).
  // `onCancel` is set only by the sign-in "discard unsaved changes?" question,
  // which must report a cancel as well as a confirm.
  type PendingNavigation = { description: string; onConfirm: () => void; onCancel?: () => void };
  const [pendingNavigation, setPendingNavigationState] = useState<PendingNavigation | null>(null);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const setPendingNavigation = useCallback((p: PendingNavigation | null) => {
    pendingNavigationRef.current = p;
    setPendingNavigationState(p);
  }, []);
  const cancelPendingNavigation = useCallback(() => {
    const p = pendingNavigationRef.current;
    setPendingNavigation(null);
    p?.onCancel?.();
  }, [setPendingNavigation]);

  // Guard helper — wrap any navigation action that should respect dirty state.
  const guardNavigation = useCallback(
    (description: string, action: () => void, onCancel?: () => void) => {
      if (!editorIsDirtyRef.current) {
        action();
        return;
      }
      // A question that is replaced counts as answered "cancel".
      const replaced = pendingNavigationRef.current;
      setPendingNavigation({
        description,
        onConfirm: () => {
          editorIsDirtyRef.current = false;
          setEditorIsDirtyState(false);
          setPendingNavigation(null);
          action();
        },
        onCancel,
      });
      replaced?.onCancel?.();
    },
    [setPendingNavigation]
  );

  // Browser-level guard: native beforeunload prompt when the tab is about to
  // close with unsaved edits. The exact wording is browser-controlled.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (editorIsDirtyRef.current) {
        e.preventDefault();
        // Some browsers still require returnValue to be set.
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Track the last hash we wrote so the hashchange listener can
  // distinguish self-triggered events from real user navigation.
  // This replaces the old setTimeout(0) flag dance, which was racey
  // when rapid setHash calls fired during a single event loop turn.
  const lastWrittenHash = useRef<string>("");
  const setHash = useCallback((hash: string) => {
    lastWrittenHash.current = hash;
    window.location.hash = hash;
  }, []);

  // Staleness guards — each domain gets its own generation counter so
  // quickly switching repos/files/PRs drops out-of-order responses
  // instead of letting a late-arriving stale result overwrite the latest.
  const repoLoadGuard = useRef(createStalenessGuard()).current;
  const fileLoadGuard = useRef(createStalenessGuard()).current;
  const prLoadGuard = useRef(createStalenessGuard()).current;
  const treeLoadGuard = useRef(createStalenessGuard()).current;
  const listLoadGuard = useRef(createStalenessGuard()).current;
  const navigationGuard = useRef(createStalenessGuard()).current;
  const branchListController = useRef<AbortController | null>(null);
  const prListController = useRef<AbortController | null>(null);
  const navigationController = useRef(new AbortController());
  const treeController = useRef(new AbortController());
  const invalidateNavigation = useCallback(() => {
    navigationGuard.invalidate();
    fileLoadGuard.invalidate();
    prLoadGuard.invalidate();
    treeLoadGuard.invalidate();
    navigationController.current.abort();
    navigationController.current = new AbortController();
    treeController.current.abort();
    setLoadingContent(false);
    setLoadingPRFiles(false);
    setLoadingFiles(false);
    setFileRevision(null);
  }, [navigationGuard, fileLoadGuard, prLoadGuard, treeLoadGuard]);

  useEffect(() => {
    // React Strict Mode replays effects without recreating refs.
    if (navigationController.current.signal.aborted) navigationController.current = new AbortController();
    return () => {
      navigationGuard.invalidate(); repoLoadGuard.invalidate(); fileLoadGuard.invalidate();
      prLoadGuard.invalidate(); treeLoadGuard.invalidate(); listLoadGuard.invalidate();
      navigationController.current.abort(); treeController.current.abort();
      branchListController.current?.abort(); prListController.current?.abort();
    };
  }, [navigationGuard, repoLoadGuard, fileLoadGuard, prLoadGuard, treeLoadGuard, listLoadGuard]);

  // The UI reset that connecting or disconnecting a credential does: drop
  // in-flight reads and every repo, file and PR view (F-36).
  const resetForCredentialChange = useCallback(() => {
    invalidateNavigation();
    repoLoadGuard.invalidate(); listLoadGuard.invalidate();
    branchListController.current?.abort(); prListController.current?.abort();
    metadataRequests.current = {}; setLoadingBranches(false); setLoadingPRs(false);
    locationRef.current = { repo: null, branch: "main" };
    setCurrentRepoState(null); setSelectedFile(null); setSelectedPR(null);
    setFileContent(""); setAvailableBranches([]); setPRFiles([]); setPRComments([]);
    safeStorage.removeItem("mardoc_user_repos");
  }, [invalidateNavigation, repoLoadGuard, listLoadGuard]);

  // No credential: reset the client and caches (F-60) and show demo data.
  // Never touches `mardoc_github_token`; the caller decides that.
  const resetToNoCredential = useCallback(() => {
    resetForCredentialChange();
    if (credential.getToken() !== null) bumpTokenRevision();
    credential.clearCredential();
    safeStorage.removeItem(REPO_KEY);
    setIsDemoMode(true);
    setRepoFiles(mockFiles);
    setPRList(mockPRs);
  }, [resetForCredentialChange, bumpTokenRevision]);

  // ─── Session model and effect runner ─────────────────────────────────────
  // `dispatchSession` runs the pure reducer (src/lib/auth/session.ts) once per
  // event, synchronously, then runs its effects. Events dispatched by an
  // effect are queued, so effects always run in order against the latest
  // state. The reducer lives over a ref, not useReducer, so Strict Mode's
  // double render never runs an effect twice.
  const replaceSession = useCallback((s: SessionState) => {
    sessionRef.current = s;
    setSessionState(s);
  }, []);
  const eventQueue = useRef<SessionEvent[]>([]);
  const dispatching = useRef(false);
  const runEffectsRef = useRef<(effects: SessionEffect[], prev: SessionState, state: SessionState, event: SessionEvent) => void>(() => {});
  const dispatchSession = useCallback((event: SessionEvent) => {
    eventQueue.current.push(event);
    if (dispatching.current) return;
    dispatching.current = true;
    try {
      while (eventQueue.current.length) {
        const e = eventQueue.current.shift()!;
        const prev = sessionRef.current;
        const { state, effects } = nextSession(prev, e, Date.now());
        if (state !== prev) replaceSession(state);
        runEffectsRef.current(effects, prev, state, e);
      }
    } finally {
      dispatching.current = false;
    }
  }, [replaceSession]);

  // The sign-in window adapter (src/lib/auth/sign-in-window.ts) owns the
  // pop-up, the result listener (I-11), the health check and the attempt
  // timers. It is created after mount, so Strict Mode's remount disposes the
  // first one and its listener.
  const signInWindow = useRef<SignInWindow | null>(null);
  // Called inside the click handler: the pop-up opens before this returns,
  // because dispatchSession runs the `open-popup` effect synchronously.
  const startSignIn = useCallback<StartSignIn>(() => {
    signInWindow.current?.start();
  }, []);
  const userCheck = useRef<AbortController | null>(null);

  const expiryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearExpiryTimers = useCallback(() => {
    expiryTimers.current.forEach(clearTimeout);
    expiryTimers.current = [];
  }, []);

  // Connect a PAT: today's setGithubToken(token). `persist` is false only
  // when a saved PAT becomes active again after a sign-in ends (F-53).
  const connectPat = useCallback((token: string, persist: boolean) => {
    resetForCredentialChange();
    if (persist) safeStorage.setItem(TOKEN_KEY, token);
    if (credential.setCredential({ kind: "pat", token })) bumpTokenRevision();
    setIsDemoMode(false);
    clearExpiryTimers();
    dispatchSession({ type: "connect-pat" });
  }, [resetForCredentialChange, bumpTokenRevision, clearExpiryTimers, dispatchSession]);

  // Connect a PAT (saved to localStorage, as today) or disconnect (null).
  const setGithubToken = useCallback((token: string | null) => {
    if (token) {
      connectPat(token, true);
    } else if (sessionRef.current.sessionKey === null) {
      // Nothing active: today's reset, unchanged.
      resetToNoCredential();
      safeStorage.removeItem(TOKEN_KEY);
    } else {
      dispatchSession({ type: "disconnect" });
    }
  }, [connectPat, resetToNoCredential, dispatchSession]);

  runEffectsRef.current = (effects, prev, state, event) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "open-popup":
        case "focus-popup":
        case "close-popup":
        case "health-check":
        case "arm-timer":
        case "clear-timer":
          signInWindow.current?.run(effect);
          break;
        case "revoke": {
          // Read the token now: the `reset-client` effect after this one
          // clears the credential. Only a sign-in token is ever revoked.
          const token = credential.getCredentialInfo()?.kind === "sign-in" ? credential.getToken() : null;
          if (token) void signInWindow.current?.revoke(token);
          break;
        }
        case "get-user": {
          // GET /user with the pending token, which is not applied yet. The
          // reducer's `user-check` timer fails the check at 10 s; the request
          // is aborted then too (F-52).
          const { nonce } = effect;
          const token = credential.peekPendingToken();
          if (!token) {
            dispatchSession({ type: "user-failed", nonce });
            break;
          }
          userCheck.current?.abort();
          const controller = new AbortController();
          userCheck.current = controller;
          const timeout = setTimeout(() => controller.abort(), USER_CHECK_DEADLINE_MS);
          fetchLoginForToken(token, controller.signal).then(
            (login) => {
              // The token must still be pending to be applied; if it is gone,
              // the check fails rather than signing in without it.
              if (!credential.hasPendingToken()) dispatchSession({ type: "user-failed", nonce });
              else dispatchSession({ type: "user", nonce, login, dirty: editorIsDirtyRef.current });
            },
            () => dispatchSession({ type: "user-failed", nonce }),
          ).finally(() => {
            clearTimeout(timeout);
            if (userCheck.current === controller) userCheck.current = null;
          });
          break;
        }
        case "apply-same-login": {
          // Same login: swap the token only; sessionKey is unchanged, so no
          // navigation re-runs and the dirty editor keeps its text (F-35).
          const token = credential.takePendingToken();
          if (!token) {
            failClosedWithoutPendingToken();
            break;
          }
          if (credential.applySignInCredential(token, effect.login, effect.expiresAt)) bumpTokenRevision();
          setIsDemoMode(false);
          break;
        }
        case "apply-new-login": {
          // Another login: the full reset connecting does, without writing
          // the token anywhere (F-36, I-10, F-53).
          const token = credential.takePendingToken();
          if (!token) {
            failClosedWithoutPendingToken();
            break;
          }
          resetForCredentialChange();
          if (credential.applySignInCredential(token, effect.login, effect.expiresAt)) bumpTokenRevision();
          setIsDemoMode(false);
          break;
        }
        case "discard-pending-token":
          credential.discardPendingToken();
          break;
        case "confirm-discard": {
          const { nonce, login } = effect;
          guardNavigation(
            `sign in as ${login}, which closes the open document`,
            () => dispatchSession(credential.hasPendingToken()
              ? { type: "discard-confirmed", nonce }
              : { type: "user-failed", nonce }),
            () => dispatchSession({ type: "discard-cancelled", nonce }),
          );
          break;
        }
        case "reset-client":
          if (event.type === "tick" || event.type === "auth-error") {
            // Expiry or a 401: keep the route and state; every request now
            // fails as an auth error without leaving the tab (I-15).
            expireGitHubSession();
          } else {
            clearExpiryTimers();
            resetToNoCredential();
          }
          break;
        case "remove-marker":
          credential.removeSignInMarker();
          break;
        case "set-marker":
          credential.setSignInMarker();
          break;
        case "remove-user-repos":
          safeStorage.removeItem("mardoc_user_repos");
          break;
        case "remove-saved-pat":
          safeStorage.removeItem(TOKEN_KEY);
          break;
        case "schedule-expiry": {
          clearExpiryTimers();
          const tick = () => dispatchSession({ type: "tick" });
          for (const when of [effect.expiresAt - EXPIRING_WARNING_MS, effect.expiresAt]) {
            expiryTimers.current.push(setTimeout(tick, Math.max(0, when - Date.now())));
          }
          break;
        }
      }
    }

    // After a sign-in ends with Disconnect, a saved PAT becomes active again,
    // as the signed-in view said (F-53, F-55).
    if (event.type === "disconnect" && isSignInKey(prev.sessionKey) && state.sessionKey === null) {
      const saved = safeStorage.getItem(TOKEN_KEY);
      if (saved) connectPat(saved, false);
    }
    // "Continue without signing in" ends the reload prompt with demo data (F-38).
    if (event.type === "continue-without" && prev.status === "sign-in-again" && state.status === "signed-out") {
      setIsDemoMode(true);
      setRepoFiles(mockFiles);
      setPRList(mockPRs);
    }
  };

  // An apply effect found the pending slot empty. The `user` and
  // `discard-confirmed` dispatches check the slot first, so this is a guard,
  // not a path: the session already says signed-in, so end it as expired
  // (requests fail as auth errors) rather than run on the old credential.
  function failClosedWithoutPendingToken() {
    dispatchSession({ type: "auth-error" });
  }

  // Create the sign-in window adapter after mount (it listens on window).
  useEffect(() => {
    const adapter = createSignInWindow({
      window,
      getSession: () => sessionRef.current,
      dispatch: dispatchSession,
      setPendingToken: credential.setPendingToken,
    });
    signInWindow.current = adapter;
    // Test hook for Playwright only: set `window.__MARDOC_E2E__ = true` before
    // the app loads. It exposes nothing a same-origin script can't already do
    // and never the token (I-10).
    const w = window as typeof window & { __MARDOC_E2E__?: boolean; __mardocAuth?: unknown };
    if (w.__MARDOC_E2E__ === true) {
      w.__mardocAuth = {
        startSignIn: () => adapter.start(),
        getSession: () => sessionRef.current,
        disconnect: () => dispatchSession({ type: "disconnect" }),
      };
    }
    return () => {
      adapter.dispose();
      if (signInWindow.current === adapter) signInWindow.current = null;
      userCheck.current?.abort();
      if (w.__mardocAuth) delete w.__mardocAuth;
    };
  }, [dispatchSession]);

  // A 401 on a sign-in token, reported once per credential by the client (F-34).
  useEffect(() => {
    setOnAuthError(() => dispatchSession({ type: "auth-error" }));
    return () => setOnAuthError(null);
  }, [dispatchSession]);

  // A laptop that sleeps past expiry fires timers late: re-check on return.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") dispatchSession({ type: "tick" }); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearExpiryTimers();
    };
  }, [dispatchSession, clearExpiryTimers]);

  // Hydrate auth state from localStorage after mount (avoids SSR mismatch).
  // Decision order: embed token (arrives later through `init`), saved PAT,
  // sign-in marker, none (design.md § Session status).
  useEffect(() => {
    setAuthReady(true);
    const savedToken = safeStorage.getItem(TOKEN_KEY);
    const start = startupCredential({
      embedMode: new URLSearchParams(window.location.search).get("embed") === "true",
      savedPat: !!savedToken,
      marker: credential.hasSignInMarker(),
    });
    if (start === "pat" && savedToken) {
      if (credential.setCredential({ kind: "pat", token: savedToken })) bumpTokenRevision();
      setIsDemoMode(false);
    } else if (start === "sign-in-again") {
      setIsDemoMode(false);
      setRepoFiles([]);
      setPRList([]);
    }
    replaceSession(initialSessionState(start));
  }, [bumpTokenRevision, replaceSession]);

  // Embed mode: listen for postMessage from VS Code extension
  const pendingInitRef = useRef<{ owner: string; repo: string; branch: string; token: string; fileName?: string } | null>(null);

  const applyInitData = useCallback((data: Record<string, any>) => {
    setIsEmbedded(true);

    if (data.token) {
      // A trusted embed init is the `connect-embed` event (CP-7); the token
      // goes to the credential module, not React state.
      if (credential.setCredential({ kind: "embed", token: data.token })) bumpTokenRevision();
      setIsDemoMode(false);
      dispatchSession({ type: "connect-embed" });
    }
    if (data.owner && data.repo) {
      pendingInitRef.current = data as any;
    }

    if (data.fileName && data.fileContent) {
      // Real file provided — exit demo mode even without a token
      setIsDemoMode(false);
      const localPath = data.filePath || data.fileName;
      const localFile: RepoFile = {
        id: `local-${Date.now()}`,
        name: data.fileName,
        path: `__local__/${localPath}`,
        type: "file" as const,
      };
      setSelectedFile(localFile);
      setSelectedPR(null);
      setCurrentView(isHtmlFile(data.fileName) ? "html-viewer" : "editor");
      setFileContent(data.fileContent);
    }
  }, [bumpTokenRevision, dispatchSession]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // F-16: apply `init` only in embed mode and only from our own parent
      // window. Anything else is ignored with no state change (RK-3).
      if (!isTrustedInit({
        data: event.data,
        source: event.source,
        parent: window.parent,
        self: window,
        search: window.location.search,
      })) return;
      const data = event.data;

      // Cache at module level so Strict Mode remount can replay
      vsCodeInitData = data;
      applyInitData(data);
    };

    window.addEventListener("message", handleMessage);

    // On mount (or Strict Mode remount), replay cached init data if available
    if (vsCodeInitData && new URLSearchParams(window.location.search).get("embed") === "true") {
      applyInitData(vsCodeInitData);
    }

    // Signal to parent that we're ready to receive init
    if (window.parent !== window) {
      window.parent.postMessage({ type: "ready" }, "*");
    }

    return () => window.removeEventListener("message", handleMessage);
  }, [isEmbedded]);

  // Embed-mode reload from disk (feature 040). Shared entry point for
  // every trigger — keystroke, top-bar button, command palette. Asks the
  // extension to re-read the current file; the fresh bytes come back as a
  // `file:content` message. Every decision point logs so a failed reload
  // can be traced in the webview devtools console.
  const requestEmbedReload = useCallback(() => {
    if (editorIsDirtyRef.current) {
      console.log("[MarDoc reload] unsaved edits — showing discard confirmation");
    }
    guardNavigation("reload the file from disk", () => {
      const posted = postReloadRequest();
      console.log(
        posted
          ? "[MarDoc reload] posted file:reload to extension"
          : "[MarDoc reload] NOT posted — no parent frame (not embedded?)"
      );
    });
  }, [guardNavigation]);

  // Keystroke trigger: Ctrl/Cmd+Shift+R. Capture phase for the same
  // reason as the Cmd+C fix above — beat the parent shell's key
  // handling. Outside embed mode the browser's native hard-reload
  // shortcut is untouched.
  useEffect(() => {
    if (!isEmbedded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isReloadShortcut(e)) return;
      console.log("[MarDoc reload] Ctrl/Cmd+Shift+R captured in iframe");
      e.preventDefault();
      e.stopPropagation();
      requestEmbedReload();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isEmbedded, requestEmbedReload]);

  // The `file:content` handler needs the current file path without
  // re-subscribing the listener on every file switch.
  const selectedFilePathRef = useRef<string | null>(null);
  useEffect(() => {
    selectedFilePathRef.current = selectedFile?.path ?? null;
  }, [selectedFile]);

  useEffect(() => {
    if (!isEmbedded) return;
    const handleFileContent = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "file:content") return;
      if (!shouldApplyFileContent(data, selectedFilePathRef.current)) {
        console.log(
          `[MarDoc reload] rejected file:content for "${data.filePath}" — current file is "${selectedFilePathRef.current}"`
        );
        return;
      }
      if (isBlockedByDirtyEditor(data, editorIsDirtyRef.current)) {
        console.log(
          "[MarDoc reload] file changed on disk but editor has unsaved edits — not auto-applying (use the reload button to overwrite)"
        );
        return;
      }
      console.log(
        `[MarDoc reload] applying ${data.reason === "watch" ? "watched" : "requested"} content for "${data.filePath}" (${data.fileContent.length} chars)`
      );
      setFileContent(data.fileContent);
      setReloadNonce((n) => n + 1);
    };
    window.addEventListener("message", handleFileContent);
    return () => window.removeEventListener("message", handleFileContent);
  }, [isEmbedded]);



  // Background lists never gate a shared document link.
  const loadPRs = useCallback(async (repo: string, filter: "open" | "closed" | "all") => {
    if (!hasCredential) return;
    const isCurrent = listLoadGuard.begin();
    prListController.current?.abort();
    const controller = new AbortController();
    prListController.current = controller;
    metadataRequests.current.prs = JSON.stringify([repo, filter]);
    setLoadingPRs(true);
    try {
      const prs = await fetchPullRequests(repo, filter, controller.signal);
      if (!isCurrent()) return;
      setPRList(prs);
      setLoadingPRs(false);
      if (prs.length) {
        const counts = await fetchPRMarkdownCounts(repo, prs.map(p => p.number), controller.signal);
        if (isCurrent()) setPRList(prs.map(p => ({ ...p, mdFileCount: counts.get(p.number) ?? 0 })));
      }
    } catch (err) {
      if (isCurrent()) { delete metadataRequests.current.prs; setError(formatApiError(err, "Failed to load pull requests")); }
    } finally { if (isCurrent()) setLoadingPRs(false); }
  }, [hasCredential, listLoadGuard]);

  const loadBranches = useCallback((repo: string) => {
    const isCurrent = repoLoadGuard.begin();
    branchListController.current?.abort();
    const controller = new AbortController();
    branchListController.current = controller;
    metadataRequests.current.branches = repo;
    setLoadingBranches(true);
    void fetchBranches(repo, controller.signal).then(branches => {
      if (!isCurrent()) return;
      setAvailableBranches(branches);
      const primary = branches.find(b => b.isDefault);
      if (primary) setDefaultBranch(primary.name);
    }).catch(err => {
      if (isCurrent()) {
        delete metadataRequests.current.branches;
        setError(formatApiError(err, "Failed to load branches. Reopen the branch menu to retry."));
      }
    }).finally(() => { if (isCurrent()) setLoadingBranches(false); });
  }, [repoLoadGuard]);

  const loadSidebarMetadata = useCallback((kind: "branches" | "prs") => {
    const repo = locationRef.current.repo;
    if (!repo || !hasCredential) return;
    if (kind === "branches" && metadataRequests.current.branches !== repo) loadBranches(repo);
    if (kind === "prs" && metadataRequests.current.prs !== JSON.stringify([repo, prStateFilter])) {
      void loadPRs(repo, prStateFilter);
    }
  }, [hasCredential, loadBranches, loadPRs, prStateFilter]);

  const loadMetadata = useCallback((repo: string) => {
    // Explicit refresh updates only lists the user has already requested.
    if (metadataRequests.current.prs) void loadPRs(repo, prStateFilter);
    if (metadataRequests.current.branches) loadBranches(repo);
  }, [loadPRs, loadBranches, prStateFilter]);

  const activateRepo = useCallback((repo: string, branch: string) => {
    const changed = locationRef.current.repo !== repo;
    locationRef.current = { repo, branch };
    setCurrentRepoState(repo); setSelectedBranchState(branch);
    safeStorage.setItem(REPO_KEY, repo);
    if (changed) {
      setRepoFiles([]); setPRList([]); setAvailableBranches([]);
      repoLoadGuard.invalidate(); listLoadGuard.invalidate();
      branchListController.current?.abort(); prListController.current?.abort();
      metadataRequests.current = {};
      setLoadingBranches(false); setLoadingPRs(false);
    }
  }, [repoLoadGuard, listLoadGuard]);

  const loadTree = useCallback(async (repo: string, revision: Promise<string>) => {
    const isCurrent = treeLoadGuard.begin();
    treeController.current.abort();
    const controller = new AbortController();
    treeController.current = controller;
    setLoadingFiles(true);
    try {
      const sha = await revision;
      if (!isCurrent()) return;
      const files = await fetchRepoTree(repo, sha, controller.signal);
      if (isCurrent()) setRepoFiles(files);
    } catch (err) {
      if (isCurrent()) { setRepoFiles([]); setError(formatApiError(err, "Failed to load branch")); }
    } finally { if (isCurrent()) setLoadingFiles(false); }
  }, [treeLoadGuard]);

  const loadRepoRoot = useCallback(async (repo: string, branch?: string) => {
    invalidateNavigation();
    const isCurrent = navigationGuard.begin();
    activateRepo(repo, branch || "main");
    setSelectedFile(null); setSelectedPR(null); setFileContent(""); setError(null);
    setCurrentView("editor");
    setHash(branch ? buildBranchHash(repo, branch) : buildRepoHash(repo));
    if (!hasCredential) return;
    try {
      const ref = branch || await fetchDefaultBranch(repo, navigationController.current.signal);
      if (!isCurrent()) return;
      locationRef.current.branch = ref;
      if (!branch) setDefaultBranch(ref);
      setSelectedBranchState(ref);
      await loadTree(repo, fetchRevision(repo, ref, navigationController.current.signal));
    } catch (err) { if (isCurrent()) setError(formatApiError(err, "Failed to load repository")); }
  }, [invalidateNavigation, navigationGuard, activateRepo, setHash, hasCredential, loadTree]);

  const setCurrentRepo = useCallback((repo: string): Promise<void> => {
    let result = Promise.resolve();
    guardNavigation(`open ${repo}`, () => { result = loadRepoRoot(repo); });
    return result;
  }, [guardNavigation, loadRepoRoot]);

  const setPRStateFilter = useCallback((filter: "open" | "closed" | "all") => {
    setPRStateFilterState(filter);
    if (locationRef.current.repo) void loadPRs(locationRef.current.repo, filter);
  }, [loadPRs]);

  // The extension owns local-file navigation; repository lists are background context only.
  useEffect(() => {
    if (!pendingInitRef.current || !hasCredential) return;
    const { owner, repo, branch } = pendingInitRef.current;
    pendingInitRef.current = null;
    activateRepo(`${owner}/${repo}`, branch || "main");
    void loadTree(`${owner}/${repo}`, fetchRevision(`${owner}/${repo}`, branch || "main", navigationController.current.signal));
    // tokenRevision: re-run when the embed token string changes, as before.
  }, [hasCredential, tokenRevision, activateRepo, loadTree]);

  const setSelectedBranch = useCallback((branch: string) => {
    const repo = locationRef.current.repo;
    if (repo) guardNavigation(`switch branch to ${branch}`, () => { void loadRepoRoot(repo, branch); });
  }, [guardNavigation, loadRepoRoot]);

  const _openFileInternal = useCallback(async (file: RepoFile,
    repo = locationRef.current.repo, branch = locationRef.current.branch) => {
    invalidateNavigation();
    const isCurrent = fileLoadGuard.begin();
    setSelectedFile(file); setSelectedPR(null);
    setCurrentView(isHtmlFile(file.name) ? "html-viewer" : "editor");
    setFileContent(""); setError(null);
    if (repo) setHash(buildFileHash(repo, branch, file.path));
    if (isDemoMode) {
      setFileContent(findFile(mockFiles, file.path)?.content || "");
      return;
    }
    if (!repo || !hasCredential) return;
    activateRepo(repo, branch);
    const revision = fetchRevision(repo, branch, navigationController.current.signal);
    void loadTree(repo, revision);
    setLoadingContent(true);
    try {
      const sha = await revision;
      if (!isCurrent()) return;
      const content = await fetchFileContent(repo, file.path, sha, navigationController.current.signal);
      if (!isCurrent()) return;
      setFileContent(content); setFileRevision(sha);
    } catch (err) {
      if (isCurrent()) setError(formatApiError(err, "Failed to load file"));
    } finally { if (isCurrent()) setLoadingContent(false); }
  }, [invalidateNavigation, fileLoadGuard, isDemoMode, hasCredential, activateRepo, loadTree, setHash]);

  const openFile = useCallback((file: RepoFile): Promise<void> => {
    let result = Promise.resolve();
    guardNavigation(`open ${file.name}`, () => { result = _openFileInternal(file); });
    return result;
  }, [guardNavigation, _openFileInternal]);

  const refreshDocument = useCallback(() => {
    if (selectedFile && !selectedFile.path.startsWith("__")) {
      guardNavigation("refresh this document", () => { void _openFileInternal(selectedFile); });
    }
  }, [selectedFile, guardNavigation, _openFileInternal]);

  // PR-scoped new file state
  const [prBranchForNewFile, setPRBranchForNewFile] = useState<string | null>(null);
  const [prNumberForNewFile, setPRNumberForNewFile] = useState<number | null>(null);

  // Create a new (unsaved) file and open it in the editor
  const createNewFile = useCallback(() => {
    invalidateNavigation();
    const newFile: RepoFile = {
      id: `new-${Date.now()}`,
      name: "untitled.md",
      path: "__new__/untitled.md",
      type: "file",
    };
    setSelectedFile(newFile);
    setSelectedPR(null);
    setPRBranchForNewFile(null);
    setPRNumberForNewFile(null);
    setCurrentView("editor");
    setFileContent("");
  }, [invalidateNavigation]);

  // Add a new file to an existing PR branch
  const addFileToPR = useCallback((pr: PullRequest) => {
    invalidateNavigation();
    const newFile: RepoFile = {
      id: `pr-new-${Date.now()}`,
      name: "untitled.md",
      path: "__new__/untitled.md",
      type: "file",
    };
    setSelectedFile(newFile);
    setPRBranchForNewFile(pr.headBranch);
    setPRNumberForNewFile(pr.number);
    setCurrentView("editor");
    setFileContent("");
  }, [invalidateNavigation]);

  // Open a local file from the filesystem
  const openLocalFile = useCallback((name: string, content: string) => {
    invalidateNavigation();
    const localFile: RepoFile = {
      id: `local-${Date.now()}`,
      name,
      path: `__local__/${name}`,
      type: "file",
    };
    setSelectedFile(localFile);
    setSelectedPR(null);
    setPRBranchForNewFile(null);
    setPRNumberForNewFile(null);
    setCurrentView(isHtmlFile(name) ? "html-viewer" : "editor");
    setFileContent(content);
  }, [invalidateNavigation]);


  const _openPRInternal = useCallback(async (pr: PullRequest,
    repo = locationRef.current.repo, fileIdx = 0, anchor = "") => {
    invalidateNavigation();
    const isCurrent = prLoadGuard.begin();
    setSelectedPR(pr); setSelectedFile(null); setCurrentView("pr-diff");
    setSelectedPRFileIdx(fileIdx); setError(null); setPRFiles([]); setPRComments([]);
    if (repo) setHash(buildPRHash(repo, pr.number, fileIdx, anchor));
    if (isDemoMode) { setPRFiles(pr.files); setPRComments(pr.comments); return; }
    if (!repo || !hasCredential) return;
    activateRepo(repo, pr.headBranch);
    setLoadingPRFiles(true);
    void fetchPRComments(repo, pr.number, navigationController.current.signal).then(comments => {
      if (isCurrent()) setPRComments(comments);
    }).catch(err => {
      if (isCurrent()) setError(formatApiError(err, "Failed to load PR comments"));
    });
    try {
      const files = await fetchPRFileManifest(repo, pr.number, navigationController.current.signal);
      if (!isCurrent()) return;
      if (fileIdx >= files.length && files.length) throw new Error("The linked PR file no longer exists. Open the PR to select a file.");
      setPRFiles(files);
    } catch (err) {
      if (isCurrent()) setError(formatApiError(err, `Failed to load PR #${pr.number}`));
    } finally { if (isCurrent()) setLoadingPRFiles(false); }
  }, [invalidateNavigation, prLoadGuard, setHash, isDemoMode, hasCredential, activateRepo]);

  const selectedPRFile = prFiles[selectedPRFileIdx];
  useEffect(() => {
    if (currentView !== "pr-diff" || !selectedPR || !hasCredential || !selectedPRFile || selectedPRFile.loadState !== "pending") return;
    let cancelled = false;
    const controller = new AbortController();
    const index = selectedPRFileIdx;
    void fetchPRFile(selectedPRFile, controller.signal).then(file => {
      if (!cancelled) setPRFiles(files => files.map((old, i) => i === index ? file : old));
    }).catch(err => {
      if (!cancelled) setPRFiles(files => files.map((old, i) => i === index
        ? { ...old, loadState: "error", loadError: formatApiError(err, "Failed to load document") } : old));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [selectedPRFile, selectedPRFileIdx, currentView, selectedPR, hasCredential]);

  const openPR = useCallback((pr: PullRequest) => {
    setDocumentAnchor("");
    guardNavigation(`open PR #${pr.number}`, () => { void _openPRInternal(pr); });
  }, [guardNavigation, _openPRInternal]);

  const setSelectedPRFileIdxWithHash = useCallback((idx: number, anchor = "") => {
    setDocumentAnchor(anchor);
    setSelectedPRFileIdx(idx);
    setPRFiles(files => files.map((file, i) => i === idx && file.loadState === "error"
      ? { ...file, loadState: "pending", loadError: undefined } : file));
    if (currentRepo && selectedPR) setHash(buildPRHash(currentRepo, selectedPR.number, idx, anchor));
  }, [currentRepo, selectedPR, setHash]);

  const navigateToHash = useCallback(async (hash: string) => {
    const route = parseHash(hash);
    if (route.type === "none") { if (hash) setError("Invalid document link."); return; }
    if (route.type === "file" && route.filePath && route.branch) {
      await _openFileInternal({ id: `hash-${route.filePath}`, name: route.filePath.split("/").pop()!,
        path: route.filePath, type: "file" }, route.repoFullName, route.branch);
    } else if (route.type === "pr" && route.prNumber) {
      setDocumentAnchor(route.anchor || "");
      if (selectedPR?.number === route.prNumber && currentRepo === route.repoFullName && prFiles.length) {
        if ((route.prFileIdx || 0) >= prFiles.length) { setError("The linked PR file no longer exists. Open the PR to select a file."); return; }
        setSelectedPRFileIdxWithHash(route.prFileIdx || 0, route.anchor || "");
        setCurrentView("pr-diff");
        return;
      }
      if (isDemoMode) {
        const pr = mockPRs.find(p => p.number === route.prNumber);
        if (pr) await _openPRInternal(pr, null, route.prFileIdx, route.anchor);
        return;
      }
      invalidateNavigation();
      const isCurrent = navigationGuard.begin();
      setError(null); setSelectedFile(null); setSelectedPR(null); setLoadingPRFiles(true);
      try {
        const pr = await fetchPullRequest(route.repoFullName!, route.prNumber, navigationController.current.signal);
        if (isCurrent()) await _openPRInternal(pr, route.repoFullName, route.prFileIdx, route.anchor);
      } catch (err) {
        if (isCurrent()) { setError(formatApiError(err, "Failed to open linked PR")); setLoadingPRFiles(false); }
      }
    } else if (route.repoFullName && !isDemoMode) {
      await loadRepoRoot(route.repoFullName, route.branch);
    }
  }, [_openFileInternal, _openPRInternal, isDemoMode, invalidateNavigation, navigationGuard, loadRepoRoot, selectedPR, currentRepo, prFiles.length, setSelectedPRFileIdxWithHash]);

  // Read the latest callback without replaying navigation on every state update.
  const navigateRef = useRef(navigateToHash);
  navigateRef.current = navigateToHash;
  // Keyed on sessionKey, not the token: a same-login token swap keeps the
  // key, so the open document is not re-opened (F-35).
  useEffect(() => {
    if (!authReady || pendingInitRef.current || vsCodeInitData || awaitingSignIn) return;
    const hash = window.location.hash;
    if (hash) void navigateRef.current(hash);
    else if (sessionKey !== null) {
      const saved = safeStorage.getItem(REPO_KEY);
      if (saved) void navigateRef.current(buildRepoHash(saved));
    }
    const onHashChange = () => {
      const target = window.location.hash;
      if (target === lastWrittenHash.current) return;
      if (editorIsDirtyRef.current) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + lastWrittenHash.current);
      }
      guardNavigation("open the linked document", () => { void navigateRef.current(target); });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [authReady, sessionKey, awaitingSignIn, guardNavigation]);

  // Refresh sidebar metadata after a write without changing the open document or URL.
  const refreshRepo = useCallback(async () => {
    const { repo, branch } = locationRef.current;
    if (repo && hasCredential) {
      loadMetadata(repo);
      await loadTree(repo, fetchRevision(repo, branch, navigationController.current.signal));
    }
  }, [hasCredential, loadMetadata, loadTree]);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        hasCredential,
        sessionKey,
        session,
        dispatchSession,
        startSignIn,
        setGithubToken,
        isDemoMode,
        currentRepo,
        defaultBranch,
        selectedBranch,
        availableBranches,
        loadSidebarMetadata,
        loadingBranches,
        setSelectedBranch,
        setCurrentRepo,
        repoFiles: repoFilesList,
        pullRequests: prList,
        prStateFilter,
        setPRStateFilter,
        currentView,
        setCurrentView,
        selectedFile,
        setSelectedFile,
        selectedPR,
        setSelectedPR,
        fileContent,
        fileRevision,
        refreshDocument,
        prFiles,
        prComments,
        selectedPRFileIdx,
        documentAnchor,
        setSelectedPRFileIdx: setSelectedPRFileIdxWithHash,
        loadingPRFiles,
        loadingFiles,
        loadingPRs,
        loadingContent,
        error,
        prBranchForNewFile,
        prNumberForNewFile,
        refreshRepo,
        openFile,
        openPR,
        createNewFile,
        addFileToPR,
        openLocalFile,
        isEmbedded,
        isFramed,
        reloadNonce,
        requestEmbedReload,
        editorIsDirty,
        setEditorIsDirty,
      }}
    >
      {children}
      {pendingNavigation && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={cancelPendingNavigation}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              Discard unsaved changes?
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              You have unsaved edits. Continuing will discard them and{" "}
              {pendingNavigation.description}.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelPendingNavigation}
                className="text-xs px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={pendingNavigation.onConfirm}
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
