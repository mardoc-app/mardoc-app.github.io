"use client";

// The sign-in banner (WP-6; F-19, F-32, F-33, F-37, F-38, NF-22): a strip above the
// main pane, inside an aria-live region that is always present so each prompt
// and error is announced. It holds no state and never opens the pop-up itself.
import React from "react";
import { useApp } from "@/lib/app-context";
import { isAttemptStatus } from "@/lib/auth/session";
import { parseHash } from "@/lib/hash-router";
import { signInErrorText } from "./sign-in-text";
import OpenInNewTabLink from "./OpenInNewTabLink";

const btn =
  "text-xs px-3 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors";

/** What the hash route will open, for "Sign in again to open <path>" (F-37). */
export function routeLabel(hash: string): string | null {
  const route = parseHash(hash);
  if (route.type === "file") return route.filePath ?? null;
  if (route.type === "pr") return `${route.repoFullName} pull request #${route.prNumber}`;
  if (route.type === "repo") return route.repoFullName ?? null;
  return null;
}

interface Props {
  /** Opens Settings on the token form (the PAT option beside an error). */
  onUseToken?: () => void;
}

export default function SignInBanner({ onUseToken }: Props) {
  const { session, startSignIn, dispatchSession, isEmbedded, isFramed } = useApp();
  // During an attempt the banner keeps showing the state it started from.
  const status = isAttemptStatus(session.status) ? session.statusBeforeAttempt : session.status;
  const showable = !isEmbedded && (status === "expiring" || status === "expired" || status === "sign-in-again");
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const target = status === "sign-in-again" ? routeLabel(hash) : null;
  const attempting = isAttemptStatus(session.status);

  let message: React.ReactNode = null;
  if (showable) {
    if (status === "expiring") message = "Your GitHub sign-in ends in 10 minutes";
    else if (status === "expired") message = "Your GitHub sign-in has ended";
    else message = target ? <>Sign in again to open <span className="font-mono">{target}</span></> : "Sign in again to continue";
  }

  return (
    <div aria-live="polite" role="status" data-testid="sign-in-banner-region">
      {showable && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b border-[var(--border)] bg-[var(--accent-muted)] text-xs text-[var(--text-primary)]"
          data-testid="sign-in-banner"
        >
          <span>{message}</span>
          {session.lastError && !attempting && (
            <span className="text-red-600 dark:text-red-400" data-testid="banner-error">
              {signInErrorText(session.lastError)}
            </span>
          )}
          {isFramed ? (
            // Inside another page's frame sign-in is not offered (F-19, SR-1).
            <OpenInNewTabLink className={`${btn} inline-flex items-center gap-1`} />
          ) : (
            <button type="button" className={btn} onClick={() => startSignIn()}>
              {attempting ? "Signing in…" : "Sign in again"}
            </button>
          )}
          {status === "sign-in-again" && (
            <button type="button" className={btn} onClick={() => dispatchSession({ type: "continue-without" })}>
              Continue without signing in
            </button>
          )}
          {session.lastError && !attempting && onUseToken && (
            <button type="button" className={btn} onClick={onUseToken}>
              Use a personal access token
            </button>
          )}
        </div>
      )}
    </div>
  );
}
