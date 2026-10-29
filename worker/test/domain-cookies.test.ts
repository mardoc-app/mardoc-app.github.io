import { describe, expect, it } from "vitest";
import {
  attemptCookieName,
  attemptNonces,
  clearAttemptCookie,
  parseCookieHeader,
  readAttempt,
  setAttemptCookie,
  staleAttemptNonces,
} from "../src/domain/cookies";
import { makeState, makeVerifier } from "../src/domain/login";

const n = (c: string) => c.repeat(22);
const cookie = (nonce: string, value = "x") => `__Secure-mardoc_auth_${nonce}=${value}`;

describe("attempt cookies (T-22)", () => {
  it("t22_cookie_has_prefix_attributes_and_max_age_600 (F-28)", () => {
    const value = { state: makeState(n("A")), verifier: makeVerifier() };
    expect(setAttemptCookie(n("A"), value)).toBe(
      `__Secure-mardoc_auth_${n("A")}=${value.state}.${value.verifier}; ` +
        "HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600",
    );
  });

  it("t22_cookie_clear_sets_max_age_0 (F-28)", () => {
    expect(clearAttemptCookie(n("A"))).toBe(
      `__Secure-mardoc_auth_${n("A")}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0`,
    );
  });

  it("t22_cookie_round_trips_state_and_verifier", () => {
    const value = { state: makeState(n("A")), verifier: makeVerifier() };
    const set = setAttemptCookie(n("A"), value);
    const header = `other=1; ${set.split(";")[0]}; more=2`;
    expect(readAttempt(header, n("A"))).toEqual(value);
    expect(readAttempt(header, n("B"))).toBeNull();
    expect(readAttempt(null, n("A"))).toBeNull();
  });

  it("t22_cookie_malformed_values_read_as_absent", () => {
    const s = makeState(n("A"));
    const v = makeVerifier();
    for (const bad of [
      "",
      "garbage",
      `${s}`,
      `${s}.short`,
      `${makeState(n("B"))}.${v}`,
      `${n("A")}.short.${v}`,
      `${n("A")}.${v}`,
    ]) {
      expect(readAttempt(cookie(n("A"), bad), n("A"))).toBeNull();
    }
  });

  it("t22_cookie_header_parse_keeps_order_and_ignores_junk", () => {
    expect(parseCookieHeader(" a=1;b=2 ; =x; junk; c=3=4")).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3=4"],
    ]);
    expect(parseCookieHeader(null)).toEqual([]);
  });

  it("t22_cookie_attempt_nonces_need_the_prefix_and_pattern", () => {
    const header = [cookie(n("A")), "mardoc_auth_x=1", cookie("short"), cookie(n("B"))].join("; ");
    expect(attemptNonces(header)).toEqual([n("A"), n("B")]);
    expect(attemptCookieName(n("A"))).toBe(`__Secure-mardoc_auth_${n("A")}`);
  });

  it("t22_cookie_three_older_attempts_prune_all_but_newest_two (F-28)", () => {
    // Oldest first, as browsers send same-path cookies.
    const header = [cookie(n("A")), cookie(n("B")), cookie(n("C"))].join("; ");
    expect(staleAttemptNonces(header, n("D"))).toEqual([n("A")]);
  });

  it("t22_cookie_prune_keeps_two_or_fewer_and_ignores_the_new_attempt", () => {
    expect(staleAttemptNonces(null, n("D"))).toEqual([]);
    expect(staleAttemptNonces([cookie(n("A")), cookie(n("B"))].join("; "), n("D"))).toEqual([]);
    const five = ["A", "B", "C", "D", "E"].map((c) => cookie(n(c))).join("; ");
    expect(staleAttemptNonces(five, n("E"))).toEqual([n("A"), n("B")]);
    expect(staleAttemptNonces(five, n("Z"))).toEqual([n("A"), n("B"), n("C")]);
  });
});
