import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  AUTH_BASE,
  AUTH_ROUTES,
  ATTEMPT_COOKIE_PREFIX,
  ATTEMPT_MAX_AGE_SECONDS,
  NONCE_PATTERN,
  ERROR_CODE_PATTERN,
  nonceFromState,
  parseSignInResult,
  type SignInResultCode,
} from "@/lib/auth/contract";
import type { SessionEvent, SessionEffect, SessionState } from "@/lib/auth/types";

const NONCE = "A".repeat(22);

describe("auth contract", () => {
  it("auth_contract_parses_design_samples", () => {
    const ok = {
      type: "mardoc-sign-in-result",
      v: 1,
      nonce: NONCE,
      ok: true,
      token: "ghu_abc",
      expiresIn: 28800,
    };
    const bad = {
      type: "mardoc-sign-in-result",
      v: 1,
      nonce: NONCE,
      ok: false,
      error: "access_denied",
    };
    expect(parseSignInResult(ok)).toEqual(ok);
    expect(parseSignInResult(bad)).toEqual(bad);
    expect(parseSignInResult({ ...bad, nonce: null })?.nonce).toBeNull();
    expect(AUTH_BASE).toBe("/api/auth");
    expect(Object.values(AUTH_ROUTES)).toEqual([
      "/api/auth/health",
      "/api/auth/login",
      "/api/auth/callback",
      "/api/auth/revoke",
    ]);
    expect(ATTEMPT_COOKIE_PREFIX).toBe("__Secure-mardoc_auth_");
    expect(ATTEMPT_MAX_AGE_SECONDS).toBe(600);
    expect(NONCE_PATTERN.source).toBe("^[A-Za-z0-9_-]{22,64}$");
    expect(ERROR_CODE_PATTERN.source).toBe("^[a-z_]{1,40}$");
  });

  it("auth_contract_rejects_malformed_results (I-11)", () => {
    const base = { type: "mardoc-sign-in-result", v: 1, nonce: NONCE };
    const okMsg = { ...base, ok: true, token: "t", expiresIn: 10 };
    expect(parseSignInResult({ ...okMsg, type: "other" })).toBeNull();
    expect(parseSignInResult({ ...okMsg, v: 2 })).toBeNull();
    expect(parseSignInResult({ ...okMsg, nonce: "short" })).toBeNull();
    expect(parseSignInResult({ ...okMsg, nonce: undefined })).toBeNull();
    expect(parseSignInResult({ ...base, ok: true, expiresIn: 10 })).toBeNull();
    expect(parseSignInResult({ ...okMsg, token: "" })).toBeNull();
    expect(parseSignInResult({ ...okMsg, expiresIn: 0 })).toBeNull();
    expect(parseSignInResult({ ...okMsg, expiresIn: 1.5 })).toBeNull();
    expect(parseSignInResult({ ...base, ok: false, error: "<script>" })).toBeNull();
    expect(parseSignInResult({ ...base, ok: false })).toBeNull();
    expect(parseSignInResult({ ...base })).toBeNull();
    for (const v of [null, undefined, 42, "str", [], true]) {
      expect(() => parseSignInResult(v)).not.toThrow();
      expect(parseSignInResult(v)).toBeNull();
    }
    const hostile = {
      get type(): string {
        throw new Error("boom");
      },
    };
    expect(parseSignInResult(hostile)).toBeNull();
  });

  it("auth_contract_nonce_from_state", () => {
    expect(nonceFromState("abc.def")).toBeNull();
    expect(nonceFromState(`${NONCE}.${"r".repeat(43)}`)).toBe(NONCE);
    expect(nonceFromState(NONCE)).toBe(NONCE);
    expect(nonceFromState(`.${NONCE}`)).toBeNull();
  });

  it("auth_contract_codes_match_design_table", () => {
    const design = readFileSync(
      path.resolve(__dirname, "../../docs/design/github-sign-in/design.md"),
      "utf8",
    );
    const section = design.split("### Sign-in result codes")[1].split("### Data")[0];
    const fixed = Array.from(section.matchAll(/^\| `([a-z_]+)`/gm)).map((m) => m[1]);
    // "bad_verification_code" shares a row with "other GitHub error"; the regexp
    // captures only the first code in each row.
    const codes: SignInResultCode[] = [
      "access_denied",
      "state_mismatch",
      "bad_verification_code",
      "exchange_failed",
      "non_expiring_token",
      "popup_blocked",
      "worker_unavailable",
      "timeout",
      "window_closed",
      "cancelled",
    ];
    expect(fixed.sort()).toEqual([...codes].sort());
    for (const c of codes) expect(ERROR_CODE_PATTERN.test(c)).toBe(true);
    // Any other GitHub code matching the pattern is accepted by the type.
    const other: SignInResultCode = "some_other_code";
    expect(other).toBe("some_other_code");
  });

  it("auth_contract_rejects_unbounded_or_anonymous_success (I-15, CP-8)", () => {
    const ok = { type: "mardoc-sign-in-result", v: 1, nonce: NONCE, ok: true, token: "t" };
    expect(parseSignInResult({ ...ok, expiresIn: 28800 })).not.toBeNull();
    expect(parseSignInResult({ ...ok, expiresIn: 86401 })).toBeNull();
    expect(parseSignInResult({ ...ok, expiresIn: 1e21 })).toBeNull();
    expect(parseSignInResult({ ...ok, nonce: null, expiresIn: 28800 })).toBeNull();
    // A failure may still carry a null nonce (state_mismatch before a nonce is known).
    expect(
      parseSignInResult({ type: "mardoc-sign-in-result", v: 1, nonce: null, ok: false, error: "state_mismatch" }),
    ).not.toBeNull();
  });

  it("auth_types_event_and_effect_names_are_exhaustive (CP-10)", () => {
    // `satisfies` fails type-checking if a name is missing or extra.
    const events = {
      start: 1, "popup-blocked": 1, "health-failed": 1, result: 1, "popup-closed": 1,
      "close-grace-passed": 1, deadline: 1, user: 1, "user-failed": 1,
      "discard-confirmed": 1, "discard-cancelled": 1, tick: 1, "auth-error": 1,
      "continue-without": 1, "connect-pat": 1, "connect-embed": 1, disconnect: 1,
      "disconnect-and-remove-pat": 1,
    } satisfies Record<SessionEvent["type"], 1>;
    const effects = {
      "open-popup": 1, "focus-popup": 1, "close-popup": 1, "health-check": 1,
      "arm-timer": 1, "clear-timer": 1, "get-user": 1, "apply-same-login": 1,
      "apply-new-login": 1, "discard-pending-token": 1, "confirm-discard": 1,
      "reset-client": 1, revoke: 1, "remove-marker": 1, "set-marker": 1,
      "remove-user-repos": 1, "remove-saved-pat": 1, "schedule-expiry": 1,
    } satisfies Record<SessionEffect["type"], 1>;
    expect(Object.keys(events)).toHaveLength(18);
    expect(Object.keys(effects)).toHaveLength(18);
  });

  it("auth_types_carry_no_token (I-10)", () => {
    const state: SessionState = {
      status: "signed-out", sessionKey: null, lastLogin: null, lastError: null,
      statusBeforeAttempt: "signed-out", expiresAt: null, attempt: null,
      pendingLogin: null, pendingExpiresAt: null,
    };
    expect(Object.keys(state)).not.toContain("token");
    // @ts-expect-error events carry no token
    const bad: SessionEvent = { type: "result", nonce: NONCE, ok: true, expiresIn: 60, token: "t" };
    expect(bad.type).toBe("result");
  });
});
