// Attempt cookies: one per sign-in attempt, named by its nonce, holding the
// attempt's `state` and PKCE verifier (design.md § Auth Worker, F-28).
import {
  ATTEMPT_COOKIE_PREFIX,
  ATTEMPT_MAX_AGE_SECONDS,
  NONCE_PATTERN,
} from "../../../src/lib/auth/contract";
import { RANDOM_32_PATTERN } from "./login";

export const ATTEMPT_COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/api/auth";

/** How many existing attempt cookies `/login` keeps besides the new one. */
export const KEEP_NEWEST_ATTEMPTS = 2;

export interface AttemptValue {
  state: string;
  verifier: string;
}

export function attemptCookieName(nonce: string): string {
  return `${ATTEMPT_COOKIE_PREFIX}${nonce}`;
}

/** `Set-Cookie` value that stores an attempt for 10 minutes. */
export function setAttemptCookie(nonce: string, value: AttemptValue): string {
  return (
    `${attemptCookieName(nonce)}=${value.state}.${value.verifier}; ` +
    `${ATTEMPT_COOKIE_ATTRIBUTES}; Max-Age=${ATTEMPT_MAX_AGE_SECONDS}`
  );
}

/** `Set-Cookie` value that expires an attempt cookie now. */
export function clearAttemptCookie(nonce: string): string {
  return `${attemptCookieName(nonce)}=; ${ATTEMPT_COOKIE_ATTRIBUTES}; Max-Age=0`;
}

/** The request's cookies as `[name, value]` pairs, in header order. */
export function parseCookieHeader(header: string | null): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name) out.push([name, value]);
  }
  return out;
}

/** Nonces of the attempt cookies on the request, in header order. */
export function attemptNonces(header: string | null): string[] {
  const nonces: string[] = [];
  for (const [name] of parseCookieHeader(header)) {
    if (!name.startsWith(ATTEMPT_COOKIE_PREFIX)) continue;
    const nonce = name.slice(ATTEMPT_COOKIE_PREFIX.length);
    if (NONCE_PATTERN.test(nonce) && !nonces.includes(nonce)) nonces.push(nonce);
  }
  return nonces;
}

/**
 * Attempt cookies `/login` should expire: all but the newest two, not
 * counting the attempt being started. Browsers send cookies with the same
 * path oldest first (RFC 6265 § 5.4 step 2), so the newest are last.
 */
export function staleAttemptNonces(header: string | null, starting: string): string[] {
  const others = attemptNonces(header).filter((n) => n !== starting);
  return others.slice(0, Math.max(0, others.length - KEEP_NEWEST_ATTEMPTS));
}

/** The attempt stored for `nonce`, or null when absent or malformed. */
export function readAttempt(header: string | null, nonce: string): AttemptValue | null {
  const name = attemptCookieName(nonce);
  const found = parseCookieHeader(header).find(([n]) => n === name);
  if (!found) return null;
  const raw = found[1];
  const i = raw.lastIndexOf(".");
  if (i === -1) return null;
  const state = raw.slice(0, i);
  const verifier = raw.slice(i + 1);
  if (!RANDOM_32_PATTERN.test(verifier)) return null;
  const j = state.indexOf(".");
  if (j === -1 || state.slice(0, j) !== nonce) return null;
  if (!RANDOM_32_PATTERN.test(state.slice(j + 1))) return null;
  return { state, verifier };
}
