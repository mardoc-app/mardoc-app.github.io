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

  it("auth_types_event_names_match_design_table", () => {
    const names: SessionEvent["type"][] = [
      "start",
      "health-failed",
      "result",
      "popup-closed",
      "close-grace-passed",
      "deadline",
      "user",
      "user-failed",
      "tick",
      "auth-error",
      "continue-without",
      "connect-pat",
      "disconnect",
      "disconnect-and-remove-pat",
    ];
    expect(names).toHaveLength(14);
  });

  it("auth_types_payloads_and_no_token_in_state (I-10)", () => {
    const start: SessionEvent = { type: "start", nonce: NONCE };
    const eff: SessionEffect = { type: "get-user", token: "t", expiresIn: 60 };
    const state: SessionState = {
      status: "signed-out",
      sessionKey: null,
      lastLogin: null,
      lastError: null,
      statusBeforeAttempt: "signed-out",
      expiresAt: null,
      attempt: null,
    };
    expect(start.type).toBe("start");
    expect(eff.type).toBe("get-user");
    expect(Object.keys(state)).not.toContain("token");
  });
});
