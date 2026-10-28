import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  decideCallback,
  type ExchangeAnswer,
  type ExchangePort,
} from "../src/domain/callback";
import { setAttemptCookie } from "../src/domain/cookies";
import { makeVerifier } from "../src/domain/login";
import { parseSignInResult } from "../../src/lib/auth/contract";

const N = "N".repeat(22);
const S = "s".repeat(43);
const X = "x".repeat(43);
const STATE = `${N}.${S}`;
const VERIFIER = makeVerifier();
const COOKIE = setAttemptCookie(N, { state: STATE, verifier: VERIFIER }).split(";")[0];

function stub(answer: ExchangeAnswer | (() => Promise<ExchangeAnswer>)) {
  const calls: Array<[string, string]> = [];
  const port: ExchangePort = {
    async exchange(code, verifier) {
      calls.push([code, verifier]);
      return typeof answer === "function" ? answer() : answer;
    },
  };
  return { port, calls };
}

const OK: ExchangeAnswer = { kind: "answered", accessToken: "ghu_token", expiresIn: 28800 };
const q = (s: string) => new URLSearchParams(s);

async function run(query: string, cookie: string | null = COOKIE, answer: ExchangeAnswer = OK) {
  const s = stub(answer);
  const outcome = await decideCallback(q(query), cookie, s.port);
  return { outcome, calls: s.calls };
}

function errorOf(o: Awaited<ReturnType<typeof run>>["outcome"]) {
  if (o.kind !== "result" || o.result.ok) throw new Error("expected an error result");
  return { error: o.result.error, nonce: o.result.nonce, clear: o.clearNonce };
}

describe("callback decision order (T-20)", () => {
  it("t20_callback_install_return_without_state_shows_install_page (F-29)", async () => {
    const { outcome, calls } = await run("installation_id=1&setup_action=install", null);
    expect(outcome).toEqual({ kind: "install" });
    expect(calls).toHaveLength(0);
  });

  it("t20_callback_no_state_is_state_mismatch_with_null_nonce (F-20)", async () => {
    for (const query of ["code=c", "", "state=&code=c"]) {
      const { outcome, calls } = await run(query);
      expect(errorOf(outcome)).toEqual({ error: "state_mismatch", nonce: null, clear: null });
      expect(calls).toHaveLength(0);
    }
  });

  it("t20_callback_bad_nonce_is_state_mismatch_with_null_nonce (F-20)", async () => {
    for (const state of ["short.x", `${"a".repeat(65)}.x`, `${N.slice(1)}*.x`, ".x"]) {
      const { outcome, calls } = await run(`code=c&state=${encodeURIComponent(state)}`);
      expect(errorOf(outcome)).toEqual({ error: "state_mismatch", nonce: null, clear: null });
      expect(calls).toHaveLength(0);
    }
  });

  it("t20_callback_no_cookie_is_state_mismatch_and_no_exchange (F-20, I-12)", async () => {
    for (const cookie of [null, "", "other=1", `__Secure-mardoc_auth_${"M".repeat(22)}=${STATE}.${VERIFIER}`]) {
      const { outcome, calls } = await run(`code=c&state=${STATE}`, cookie);
      expect(errorOf(outcome)).toEqual({ error: "state_mismatch", nonce: N, clear: N });
      expect(calls).toHaveLength(0);
    }
  });

  it("t20_callback_different_cookie_state_is_state_mismatch_and_no_exchange (F-20, I-12)", async () => {
    // design.md worked example: ?code=c&state=N.x with the cookie holding N.s.
    const { outcome, calls } = await run(`code=c&state=${N}.${X}`);
    expect(errorOf(outcome)).toEqual({ error: "state_mismatch", nonce: N, clear: N });
    expect(calls).toHaveLength(0);
    // Also a state that is a prefix or extension of the cookie's.
    for (const state of [`${N}.${S.slice(1)}`, `${STATE}s`, `${N}.${S}.${S}`]) {
      const r = await run(`code=c&state=${state}`);
      expect(errorOf(r.outcome).error).toBe("state_mismatch");
      expect(r.calls).toHaveLength(0);
    }
  });

  it("t20_callback_mismatch_with_error_in_query_still_makes_no_exchange (I-12)", async () => {
    const { outcome, calls } = await run(`error=access_denied&state=${N}.${X}`);
    expect(errorOf(outcome).error).toBe("state_mismatch");
    expect(calls).toHaveLength(0);
  });

  it("t20_callback_access_denied_passes_through (F-20)", async () => {
    const { outcome, calls } = await run(`error=access_denied&state=${STATE}`);
    expect(errorOf(outcome)).toEqual({ error: "access_denied", nonce: N, clear: N });
    expect(calls).toHaveLength(0);
  });

  it("t20_callback_hostile_error_becomes_exchange_failed (I-17)", async () => {
    // design.md worked example: ?error=<script>&state=N.s with a matching cookie.
    for (const e of ["<script>", "", "A", "a".repeat(41), "access-denied", "x "]) {
      const { outcome, calls } = await run(`error=${encodeURIComponent(e)}&state=${STATE}`);
      expect(errorOf(outcome).error).toBe("exchange_failed");
      expect(calls).toHaveLength(0);
    }
  });

  it("t20_callback_no_code_is_state_mismatch", async () => {
    for (const query of [`state=${STATE}`, `state=${STATE}&code=`]) {
      const { outcome, calls } = await run(query);
      expect(errorOf(outcome)).toEqual({ error: "state_mismatch", nonce: N, clear: N });
      expect(calls).toHaveLength(0);
    }
  });

  it("t20_callback_exchange_gets_code_and_cookie_verifier (F-21)", async () => {
    const { calls } = await run(`code=the-code&state=${STATE}`);
    expect(calls).toEqual([["the-code", VERIFIER]]);
  });

  it("t20_callback_github_json_error_becomes_that_code", async () => {
    const { outcome } = await run(`code=c&state=${STATE}`, COOKIE, {
      kind: "answered",
      error: "bad_verification_code",
    });
    expect(errorOf(outcome)).toEqual({ error: "bad_verification_code", nonce: N, clear: N });
    const hostile = await run(`code=c&state=${STATE}`, COOKIE, {
      kind: "answered",
      error: "<img src=x>",
      accessToken: "ghu_x",
      expiresIn: 1,
    });
    expect(errorOf(hostile.outcome).error).toBe("exchange_failed");
  });

  it("t20_callback_network_error_or_5xx_is_exchange_failed", async () => {
    const failed = await run(`code=c&state=${STATE}`, COOKIE, { kind: "failed" });
    expect(errorOf(failed.outcome).error).toBe("exchange_failed");
    const s = stub(() => Promise.reject(new Error("network")));
    const thrown = await decideCallback(q(`code=c&state=${STATE}`), COOKIE, s.port);
    expect(errorOf(thrown).error).toBe("exchange_failed");
  });

  it("t20_callback_no_expires_in_is_non_expiring_token", async () => {
    for (const expiresIn of [undefined, null]) {
      const { outcome } = await run(`code=c&state=${STATE}`, COOKIE, {
        kind: "answered",
        accessToken: "ghu_x",
        expiresIn,
      });
      expect(errorOf(outcome).error).toBe("non_expiring_token");
    }
  });

  it("t20_callback_expires_in_above_cap_is_non_expiring (I-15)", async () => {
    for (const expiresIn of [86401, "86401", 2 ** 31]) {
      const { outcome } = await run(`code=c&state=${STATE}`, COOKIE, {
        kind: "answered",
        accessToken: "ghu_x",
        expiresIn,
      });
      expect(errorOf(outcome).error).toBe("non_expiring_token");
    }
    const atCap = await run(`code=c&state=${STATE}`, COOKIE, {
      kind: "answered",
      accessToken: "ghu_x",
      expiresIn: 86400,
    });
    expect(atCap.outcome.kind === "result" && atCap.outcome.result.ok).toBe(true);
  });

  it("t20_callback_bad_token_or_expiry_is_exchange_failed", async () => {
    for (const answer of [
      { kind: "answered", expiresIn: 28800 },
      { kind: "answered", accessToken: "", expiresIn: 28800 },
      { kind: "answered", accessToken: 7, expiresIn: 28800 },
      { kind: "answered", accessToken: "ghu_x", expiresIn: 0 },
      { kind: "answered", accessToken: "ghu_x", expiresIn: -5 },
      { kind: "answered", accessToken: "ghu_x", expiresIn: 1.5 },
      { kind: "answered", accessToken: "ghu_x", expiresIn: "soon" },
    ] as ExchangeAnswer[]) {
      const { outcome } = await run(`code=c&state=${STATE}`, COOKIE, answer);
      expect(errorOf(outcome).error).toBe("exchange_failed");
    }
  });

  it("t20_callback_success_is_ok_with_only_token_and_expires_in (I-13)", async () => {
    // design.md worked example: GitHub returns a refresh token; it never reaches the result.
    const { outcome, calls } = await run(`code=c&state=${STATE}`, COOKIE, {
      kind: "answered",
      accessToken: "ghu_token",
      expiresIn: 28800,
      ...({ refresh_token: "ghr_secret", refreshToken: "ghr_secret" } as object),
    } as ExchangeAnswer);
    expect(calls).toHaveLength(1);
    expect(outcome).toEqual({
      kind: "result",
      result: { type: "mardoc-sign-in-result", v: 1, nonce: N, ok: true, token: "ghu_token", expiresIn: 28800 },
      clearNonce: N,
    });
    expect(JSON.stringify(outcome)).not.toContain("ghr_");
    if (outcome.kind !== "result") throw new Error("unreachable");
    expect(parseSignInResult(outcome.result)).toEqual(outcome.result);
  });

  it("t20_callback_numeric_string_expiry_is_accepted", async () => {
    const { outcome } = await run(`code=c&state=${STATE}`, COOKIE, {
      kind: "answered",
      accessToken: "ghu_x",
      expiresIn: "28800",
    });
    expect(outcome.kind === "result" && outcome.result.ok && outcome.result.expiresIn).toBe(28800);
  });

  it("t20_callback_every_error_result_parses_under_the_contract", async () => {
    for (const query of ["code=c", `code=c&state=${N}.${X}`, `error=<b>&state=${STATE}`]) {
      const { outcome } = await run(query);
      if (outcome.kind !== "result") throw new Error("expected result");
      expect(parseSignInResult(outcome.result)).toEqual(outcome.result);
    }
  });

  it("t20_callback_constant_time_compare", () => {
    expect(constantTimeEqual(STATE, STATE)).toBe(true);
    expect(constantTimeEqual(STATE, `${N}.${X}`)).toBe(false);
    expect(constantTimeEqual(STATE, `${STATE}x`)).toBe(false);
    expect(constantTimeEqual(`${STATE}x`, STATE)).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("a\u0000", "a")).toBe(false);
  });
});
