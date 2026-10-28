// The tab's one active GitHub credential, held in this module's closure and
// never in React state, the session reducer, events or effects (I-10).
// design.md § App auth state.
//
// - `setCredential` makes a credential active and points the GitHub client at
//   it; `clearCredential` drops it and resets the client and caches (F-60).
// - `applySignInCredential` is the sign-in path. It never writes or removes
//   `localStorage.mardoc_github_token` (I-10, F-53); persisting a PAT stays in
//   app-context.tsx's `setGithubToken`.
// - The pending slot holds a sign-in attempt's new token from the moment the
//   sign-in window adapter accepts the result until the effect runner applies
//   or discards it (CP-6).
// - The sign-in marker is the only thing sign-in writes to web storage (Q-20).
import { initOctokit, resetGitHubSession } from "../github-api";
import * as safeStorage from "../safe-storage";
import { SIGN_IN_MARKER_KEY } from "./contract";

export type CredentialKind = "pat" | "embed" | "sign-in";

export type Credential = {
  kind: CredentialKind;
  token: string;
  login?: string;
  expiresAt?: number;
};

/** Everything about the active credential except the token. */
export type CredentialInfo = Omit<Credential, "token">;

export const SIGN_IN_MARKER_VALUE = "github-app";

let active: Credential | null = null;
let pendingToken: string | null = null;

export function getToken(): string | null {
  return active?.token ?? null;
}

export function getCredentialInfo(): CredentialInfo | null {
  if (!active) return null;
  const { token: _token, ...info } = active;
  return info;
}

/**
 * Makes `credential` the active one and initialises the GitHub client with it.
 * Returns true when the token differs from the previous active token.
 */
export function setCredential(credential: Credential): boolean {
  const changed = active?.token !== credential.token;
  active = { ...credential };
  initOctokit(credential.token, {
    kind: credential.kind,
    expiresAt: credential.kind === "sign-in" ? credential.expiresAt ?? null : null,
  });
  return changed;
}

/** Drops the active credential and resets the GitHub client and caches. */
export function clearCredential(): void {
  active = null;
  resetGitHubSession();
}

/** The sign-in path: in memory only; `mardoc_github_token` is not touched. */
export function applySignInCredential(token: string, login: string, expiresAt: number): boolean {
  return setCredential({ kind: "sign-in", token, login, expiresAt });
}

// ─── Pending sign-in token ──────────────────────────────────────────────────

export function setPendingToken(token: string): void {
  pendingToken = token;
}

export function hasPendingToken(): boolean {
  return pendingToken !== null;
}

/** Reads the pending token without taking it (for `GET /user`). */
export function peekPendingToken(): string | null {
  return pendingToken;
}

/** Takes the pending token out of the slot, leaving it empty. */
export function takePendingToken(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}

export function discardPendingToken(): void {
  pendingToken = null;
}

// ─── Sign-in marker (Q-20) ──────────────────────────────────────────────────

export function setSignInMarker(): void {
  safeStorage.setItem(SIGN_IN_MARKER_KEY, SIGN_IN_MARKER_VALUE);
}

export function removeSignInMarker(): void {
  safeStorage.removeItem(SIGN_IN_MARKER_KEY);
}

export function hasSignInMarker(): boolean {
  return safeStorage.getItem(SIGN_IN_MARKER_KEY) === SIGN_IN_MARKER_VALUE;
}

/** Test hook: forget the active and pending credential without side effects. */
export function __resetCredentialForTests(): void {
  active = null;
  pendingToken = null;
}
