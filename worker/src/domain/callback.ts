// The callback check (design.md § Callback check): given the query, the
// cookies and an exchange port, produce a sign-in result or the install page.
// Pure apart from the port (LR-11).
import {
  ERROR_CODE_PATTERN,
  MAX_EXPIRES_IN_SECONDS,
  nonceFromState,
  type SignInResult,
} from "../../../src/lib/auth/contract";
import { readAttempt } from "./cookies";

/**
 * What the exchange adapter hands back. `failed` covers a network error or a
 * non-2xx answer. `answered` carries only the three fields the Worker reads
 * from GitHub's JSON; everything else, the refresh token included, is
 * dropped in the adapter (I-13).
 */
export type ExchangeAnswer =
  | { kind: "failed" }
  | { kind: "answered"; accessToken?: unknown; expiresIn?: unknown; error?: unknown };

export interface ExchangePort {
  exchange(code: string, verifier: string): Promise<ExchangeAnswer>;
}

export type CallbackOutcome =
  | { kind: "install" }
  | {
      kind: "result";
      result: SignInResult;
      /** Nonce whose attempt cookie the response clears, if one was named. */
      clearNonce: string | null;
    };

/** Compares two strings in time that depends only on their lengths. */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

function failure(nonce: string | null, error: string): CallbackOutcome {
  return {
    kind: "result",
    result: { type: "mardoc-sign-in-result", v: 1, nonce, ok: false, error },
    clearNonce: nonce,
  };
}

function patternCode(value: unknown): string {
  return typeof value === "string" && ERROR_CODE_PATTERN.test(value) ? value : "exchange_failed";
}

/**
 * GitHub's `expires_in` as whole seconds. `undefined` means the token does
 * not expire usefully: absent, or above the contract's one-day cap, which the
 * tab would refuse (MAX_EXPIRES_IN_SECONDS). `null` means malformed.
 */
function expiresInSeconds(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "string" && /^[0-9]{1,10}$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n > MAX_EXPIRES_IN_SECONDS ? undefined : n;
}

export async function decideCallback(
  query: URLSearchParams,
  cookieHeader: string | null,
  port: ExchangePort,
): Promise<CallbackOutcome> {
  // 1. No state: the install page's return, or a mismatch.
  const state = query.get("state");
  if (!state) {
    if (query.has("installation_id")) return { kind: "install" };
    return failure(null, "state_mismatch");
  }

  // 2. The nonce names the attempt; it must match the pattern.
  const nonce = nonceFromState(state);
  if (nonce === null) return failure(null, "state_mismatch");

  // 3. The attempt cookie must hold exactly this state. No exchange otherwise (I-12).
  const attempt = readAttempt(cookieHeader, nonce);
  if (attempt === null || !constantTimeEqual(attempt.state, state)) {
    return failure(nonce, "state_mismatch");
  }

  // 4. GitHub reported an error.
  if (query.has("error")) return failure(nonce, patternCode(query.get("error")));

  // 5. Nothing to exchange.
  const code = query.get("code");
  if (!code) return failure(nonce, "state_mismatch");

  // 6. Exchange the code with the attempt's verifier.
  let answer: ExchangeAnswer;
  try {
    answer = await port.exchange(code, attempt.verifier);
  } catch {
    answer = { kind: "failed" };
  }
  if (answer.kind === "failed") return failure(nonce, "exchange_failed");
  if (answer.error !== undefined && answer.error !== null) {
    return failure(nonce, patternCode(answer.error));
  }
  const token = answer.accessToken;
  if (typeof token !== "string" || token.length === 0) return failure(nonce, "exchange_failed");
  const expiresIn = expiresInSeconds(answer.expiresIn);
  if (expiresIn === undefined) return failure(nonce, "non_expiring_token");
  if (expiresIn === null) return failure(nonce, "exchange_failed");
  return {
    kind: "result",
    result: { type: "mardoc-sign-in-result", v: 1, nonce, ok: true, token, expiresIn },
    clearNonce: nonce,
  };
}
