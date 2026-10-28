import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RANDOM_32_PATTERN,
  authorizeUrl,
  base64url,
  challengeFor,
  isNonce,
  makeState,
  makeVerifier,
  startAttempt,
} from "../src/domain/login";
import { nonceFromState } from "../../src/lib/auth/contract";

const NONCE = "N".repeat(22);
const fixed = (byte: number) => (n: number) => new Uint8Array(n).fill(byte);
// Independent oracle for S256: Node's own hash, not Web Crypto.
const s256 = (v: string) => createHash("sha256").update(v, "ascii").digest("base64url");

describe("login domain (T-20)", () => {
  it("t20_login_state_is_nonce_dot_32_random_bytes (F-20)", () => {
    const state = makeState(NONCE);
    const parts = state.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(NONCE);
    expect(parts[1]).toMatch(RANDOM_32_PATTERN);
    expect(nonceFromState(state)).toBe(NONCE);
    expect(makeState(NONCE)).not.toBe(state);
  });

  it("t20_login_state_draws_32_random_bytes", () => {
    const asked: number[] = [];
    const state = makeState(NONCE, (n) => {
      asked.push(n);
      return new Uint8Array(n).fill(0xff);
    });
    expect(asked).toEqual([32]);
    expect(state).toBe(`${NONCE}.${"_".repeat(42)}8`);
  });

  it("t20_login_verifier_is_43_chars_base64url (F-21)", () => {
    const asked: number[] = [];
    makeVerifier((n) => {
      asked.push(n);
      return new Uint8Array(n);
    });
    expect(asked).toEqual([32]);
    const v = makeVerifier();
    expect(v).toMatch(RANDOM_32_PATTERN);
    expect(makeVerifier()).not.toBe(v);
  });

  it("t20_login_challenge_is_s256_of_verifier (F-21)", async () => {
    for (let i = 0; i < 20; i++) {
      const v = makeVerifier();
      expect(await challengeFor(v)).toBe(s256(v));
    }
  });

  it("t20_login_base64url_has_no_padding_or_unsafe_chars", () => {
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(base64url(new Uint8Array(32))).toHaveLength(43);
  });

  it("t20_login_nonce_pattern_check", () => {
    expect(isNonce("a".repeat(22))).toBe(true);
    expect(isNonce("a".repeat(21))).toBe(false);
    expect(isNonce("a".repeat(65))).toBe(false);
    expect(isNonce(`${"a".repeat(22)}.`)).toBe(false);
    expect(isNonce(null)).toBe(false);
  });

  it("t20_login_authorize_url_has_every_parameter (F-20, F-21)", () => {
    const url = new URL(
      authorizeUrl({
        clientId: "Iv1.abc",
        redirectUri: "https://mardoc.app/api/auth/callback",
        state: `${NONCE}.s`,
        challenge: "ch",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "Iv1.abc",
      redirect_uri: "https://mardoc.app/api/auth/callback",
      state: `${NONCE}.s`,
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("t20_login_start_attempt_ties_state_verifier_and_challenge (F-21)", async () => {
    const a = await startAttempt(NONCE, {
      clientId: "cid",
      redirectUri: "https://mardoc.app/api/auth/callback",
    });
    const url = new URL(a.location);
    expect(url.searchParams.get("state")).toBe(a.state);
    expect(url.searchParams.get("code_challenge")).toBe(s256(a.verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(a.location).not.toContain(a.verifier);
  });

  it("t20_login_start_attempt_uses_the_random_source", async () => {
    const a = await startAttempt(NONCE, { clientId: "c", redirectUri: "r" }, fixed(1));
    const b = await startAttempt(NONCE, { clientId: "c", redirectUri: "r" }, fixed(1));
    expect(a).toEqual(b);
  });
});
