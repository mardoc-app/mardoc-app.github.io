// Frozen sign-in contract shared by the app and the auth Worker.
// Pure TypeScript: no DOM, no browser globals, no network calls.

export const AUTH_BASE = "/api/auth";
export const AUTH_ROUTES = {
  health: `${AUTH_BASE}/health`,
  login: `${AUTH_BASE}/login`,
  callback: `${AUTH_BASE}/callback`,
  revoke: `${AUTH_BASE}/revoke`,
} as const;

export const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
export const ERROR_CODE_PATTERN = /^[a-z_]{1,40}$/;

export const ATTEMPT_COOKIE_PREFIX = "__Secure-mardoc_auth_";
export const ATTEMPT_MAX_AGE_SECONDS = 600;

export type SignInResultCode =
  | "access_denied"
  | "state_mismatch"
  | "bad_verification_code"
  | "exchange_failed"
  | "non_expiring_token"
  | "popup_blocked"
  | "worker_unavailable"
  | "timeout"
  | "window_closed"
  | "cancelled"
  | (string & {});

export type SignInResult =
  | {
      type: "mardoc-sign-in-result";
      v: 1;
      nonce: string | null;
      ok: true;
      token: string;
      expiresIn: number;
    }
  | {
      type: "mardoc-sign-in-result";
      v: 1;
      nonce: string | null;
      ok: false;
      error: SignInResultCode;
    };

export function parseSignInResult(data: unknown): SignInResult | null {
  try {
    if (typeof data !== "object" || data === null) return null;
    const d = data as Record<string, unknown>;
    if (d.type !== "mardoc-sign-in-result" || d.v !== 1) return null;
    const nonce = d.nonce;
    if (nonce !== null) {
      if (typeof nonce !== "string" || !NONCE_PATTERN.test(nonce)) return null;
    }
    if (d.ok === true) {
      const { token, expiresIn } = d;
      if (typeof token !== "string" || token.length === 0) return null;
      if (typeof expiresIn !== "number" || !Number.isInteger(expiresIn) || expiresIn <= 0) return null;
      return { type: "mardoc-sign-in-result", v: 1, nonce, ok: true, token, expiresIn };
    }
    if (d.ok === false) {
      const { error } = d;
      if (typeof error !== "string" || !ERROR_CODE_PATTERN.test(error)) return null;
      return { type: "mardoc-sign-in-result", v: 1, nonce, ok: false, error };
    }
    return null;
  } catch {
    return null;
  }
}

export function nonceFromState(state: string): string | null {
  if (typeof state !== "string") return null;
  const i = state.indexOf(".");
  const head = i === -1 ? state : state.slice(0, i);
  return NONCE_PATTERN.test(head) ? head : null;
}
