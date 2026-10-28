"use client";

// The GitHub Connection tab of Settings (WP-6; F-10, F-13, F-15, F-17, F-18,
// F-19, F-41, F-54, F-55, F-71, F-72). It owns only whether the PAT form is open.
// It never holds a token beyond the text field's own value, which is passed
// to setGithubToken and cleared.
import React, { useState } from "react";
import { Github, LogIn, LogOut } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { isSignInKey } from "@/lib/auth/session";
import * as safeStorage from "@/lib/safe-storage";
import {
  INSTALL_URL,
  PAT_GUIDE_URL,
  DATA_AND_SECURITY_URL,
  signInErrorText,
} from "./sign-in-text";
import OpenInNewTabLink, { FRAMED_HINT } from "./OpenInNewTabLink";

const TOKEN_KEY = "mardoc_github_token";
const link = "text-[var(--accent)] underline";
const primaryBtn =
  "flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40";
const dangerBtn =
  "flex items-center gap-2 text-sm px-3 py-2 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors";
const quietBtn =
  "flex items-center gap-2 text-sm px-3 py-2 text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors";

interface Props {
  patOpen: boolean;
  setPatOpen: (open: boolean) => void;
  onPatConnected: () => void;
  onDisconnected: () => void;
}

export default function GitHubConnectionTab({ patOpen, setPatOpen, onPatConnected, onDisconnected }: Props) {
  const { session, sessionKey, hasCredential, startSignIn, setGithubToken, dispatchSession, isEmbedded, isFramed } = useApp();
  const [tokenInput, setTokenInput] = useState("");
  const [savedPatRevision, setSavedPatRevision] = useState(0);

  const signedIn = isSignInKey(sessionKey);
  const status = session.status;
  const attempting = status === "signing-in" || status === "checking-user";
  const expired = status === "expired";
  const patActive = sessionKey === "pat";
  // Only whether a saved PAT exists, never its value (F-55).
  const hasSavedPat = signedIn && safeStorage.getItem(TOKEN_KEY) !== null;
  void savedPatRevision; // re-read the saved-PAT flag after Remove saved token
  const login = signedIn ? sessionKey.slice("sign-in:".length) : null;
  // The token option is always offered where a failure or an ended sign-in leaves the user stuck (F-51, F-52),
  // and whenever a message elsewhere asked for the token form (F-42, F-44; M1-5).
  const showPatOption = !patActive && sessionKey !== "embed" && (!signedIn || expired || !!session.lastError || patOpen);

  const connectPat = () => {
    const token = tokenInput.trim();
    if (!token) return;
    setGithubToken(token);
    setTokenInput("");
    onPatConnected();
  };
  const disconnect = () => {
    setGithubToken(null);
    setTokenInput("");
    setPatOpen(false);
    onDisconnected();
  };
  const removeSavedPat = () => {
    safeStorage.removeItem(TOKEN_KEY);
    setSavedPatRevision((n) => n + 1);
  };
  const disconnectAndRemove = () => {
    dispatchSession({ type: "disconnect-and-remove-pat" });
    setTokenInput("");
    onDisconnected();
  };

  // Inside another page's frame, sign-in is not offered: a link opens MarDoc
  // in its own tab instead (F-19, SR-1). The token option stays.
  const signInButton = (label: string) =>
    isFramed ? (
      <div className="space-y-1" data-testid="framed-sign-in">
        <p className="text-xs text-[var(--text-muted)]">{FRAMED_HINT}</p>
        <OpenInNewTabLink className={`${primaryBtn} w-fit`} />
      </div>
    ) : (
      <button type="button" onClick={() => startSignIn()} className={primaryBtn}>
        <Github size={14} />
        {label}
      </button>
    );

  return (
    <div className="space-y-4">
      {/* Prompts and errors are announced (NF-22). The region is always present. */}
      <div aria-live="polite" role="status" data-testid="sign-in-status">
        {attempting && <p className="text-sm text-[var(--text-secondary)]">Signing in with GitHub…</p>}
        {session.lastError && !attempting && (
          <p className="text-sm text-red-600 dark:text-red-400" data-testid="sign-in-error">
            {signInErrorText(session.lastError)}
          </p>
        )}
      </div>

      {signedIn ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Github size={16} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Signed in with GitHub as {login}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {expired ? "This sign-in has ended." : "Signed in through the MarDoc GitHub App"}
              </p>
            </div>
          </div>
          {expired && signInButton("Sign in again")}
          {hasSavedPat && (
            <div className="rounded-lg bg-[var(--surface-secondary)] p-3 space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">
                A saved personal access token will be used after you disconnect.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={removeSavedPat} className={quietBtn}>Remove saved token</button>
                <button type="button" onClick={disconnectAndRemove} className={dangerBtn}>
                  <LogOut size={14} />
                  Disconnect and remove saved token
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={disconnect} className={dangerBtn}>
              <LogOut size={14} />
              Disconnect
            </button>
            <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" className={`text-sm ${link}`}>
              Install MarDoc on more repositories
            </a>
          </div>
        </div>
      ) : patActive ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Github size={16} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Connected with a personal access token</p>
              <p className="text-xs text-[var(--text-muted)]">Token active</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={disconnect} className={dangerBtn}>
              <LogOut size={14} />
              Disconnect
            </button>
            {!isEmbedded && signInButton("Sign in with GitHub")}
          </div>
        </div>
      ) : sessionKey === "embed" ? (
        <div className="flex items-center gap-2">
          <Github size={16} className="text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Connected through the VS Code extension</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Sign in with GitHub to browse your repositories. The app also works in demo mode with sample data.
          </p>
          {!isEmbedded && signInButton("Sign in with GitHub")}
        </div>
      )}

      {showPatOption && (
        <div>
          {!patOpen ? (
            <button
              type="button"
              onClick={() => setPatOpen(true)}
              className="text-sm text-[var(--accent)] underline"
            >
              Use a personal access token
            </button>
          ) : (
            <div data-testid="pat-form">
              <div className="bg-[var(--surface-secondary)] rounded-lg p-3 mb-4">
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  <strong>Connect with a personal access token.</strong> MarDoc supports classic and
                  fine-grained tokens; choose one your organization permits and scope it to the work you need.
                </p>
                <p className="text-xs text-[var(--text-secondary)] mb-1"><strong>Fine-grained token</strong></p>
                <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal ml-4 mb-3">
                  <li>
                    Open <a className={link} href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub token settings</a>
                  </li>
                  <li>Choose a descriptive name, expiration and resource owner</li>
                  <li>Select the repositories MarDoc should access</li>
                  <li>
                    Choose <strong>Contents</strong> and <strong>Pull requests</strong> permissions: Read to browse and read PRs;
                    Pull requests write to review; Contents write to edit, create and upload images
                  </li>
                  <li>Generate the token; obtain organization approval if required</li>
                </ol>
                <p className="text-xs text-[var(--text-secondary)] mb-1"><strong>Classic token</strong></p>
                <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal ml-4">
                  <li>
                    Open <a className={link} href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">classic token settings</a> and
                    choose <strong>Generate new token (classic)</strong>
                  </li>
                  <li>Set a descriptive name and expiration</li>
                  <li>
                    Select <strong>repo</strong> for the private-repository review and edit workflow. This grants
                    broad repository access within your account&rsquo;s permissions
                  </li>
                  <li>
                    Generate and copy the token. For an organization using SAML SSO, click
                    <strong> Configure SSO</strong> next to the token and authorize it
                  </li>
                </ol>
                <p className="text-[10px] text-[var(--text-muted)] mt-2">
                  Paste the token below. See the{" "}
                  <a className={link} href={PAT_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                    personal access token guide
                  </a>{" "}
                  for permissions and troubleshooting.
                </p>
              </div>

              <label htmlFor="pat-input" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Personal Access Token
              </label>
              <div className="flex gap-2">
                <input
                  id="pat-input"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") connectPat();
                  }}
                />
                <button type="button" onClick={connectPat} disabled={!tokenInput.trim()} className={primaryBtn}>
                  <LogIn size={14} />
                  Connect
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--text-muted)]">
                  MarDoc sends your token directly to GitHub and saves it in this browser&rsquo;s local storage until you
                  disconnect. MarDoc does not send repository content to a MarDoc server. Rendered documents can still
                  request resources from other hosts. See{" "}
                  <a className={link} href={DATA_AND_SECURITY_URL} target="_blank" rel="noopener noreferrer">
                    data storage and security
                  </a>.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
