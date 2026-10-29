// T-14 (state part), T-13 (state), T-24 (effects): the session reducer against
// every row of design.md § Session status (F-31 to F-36, F-53, F-60, I-14,
// I-15, NF-12). Pure, fake clock: `now` is passed in.
import { describe, it, expect } from "vitest";
import {
  next,
  computeExpiresAt,
  initialSessionState,
  startupCredential,
} from "@/lib/auth/session";
import type { SessionEffect, SessionEvent, SessionState, SessionStatus } from "@/lib/auth/types";
import {
  ATTEMPT_DEADLINE_MS,
  CLOSE_GRACE_MS,
  EXPIRING_WARNING_MS,
  USER_CHECK_DEADLINE_MS,
} from "@/lib/auth/contract";

const N = "nonce_aaaaaaaaaaaaaaaaaaaa";
const OTHER = "nonce_bbbbbbbbbbbbbbbbbbbb";
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);
const at = (h: number, m: number, s = 0) => Date.UTC(2026, 9, 27, h, m, s);
const types = (effects: SessionEffect[]) => effects.map((e) => e.type);
const clears = (nonce = N): SessionEffect[] => [
  { type: "clear-timer", name: "deadline", nonce },
  { type: "clear-timer", name: "close-grace", nonce },
  { type: "clear-timer", name: "user-check", nonce },
];

function base(over: Partial<SessionState> = {}): SessionState {
  return { ...initialSessionState("none"), ...over };
}
function signedIn(login = "alice", expiresAt = at(19, 59)): SessionState {
  return base({
    status: "signed-in",
    statusBeforeAttempt: "signed-in",
    sessionKey: `sign-in:${login}`,
    lastLogin: login,
    expiresAt,
  });
}
function run(state: SessionState, events: SessionEvent[], now = T0): SessionState {
  return events.reduce((s, e) => next(s, e, now).state, state);
}
function signingInFrom(state: SessionState, now = T0): SessionState {
  return next(state, { type: "start", nonce: N }, now).state;
}
function checkingUserFrom(state: SessionState, now = T0, expiresIn = 28800): SessionState {
  return run(signingInFrom(state, now), [{ type: "result", nonce: N, ok: true, expiresIn }], now);
}

describe("session start-up (decision order)", () => {
  it("t14_session_startup_saved_pat_then_marker_then_none", () => {
    expect(startupCredential({ embedMode: false, savedPat: true, marker: true })).toBe("pat");
    expect(startupCredential({ embedMode: false, savedPat: false, marker: true })).toBe("sign-in-again");
    expect(startupCredential({ embedMode: true, savedPat: false, marker: true })).toBe("none");
    expect(startupCredential({ embedMode: false, savedPat: false, marker: false })).toBe("none");
    expect(initialSessionState("pat")).toMatchObject({ status: "signed-out", sessionKey: "pat" });
    expect(initialSessionState("sign-in-again")).toMatchObject({ status: "sign-in-again", sessionKey: null });
    expect(initialSessionState()).toMatchObject({ status: "signed-out", sessionKey: null, expiresAt: null });
  });
});

describe("session expiry arithmetic (F-33, NF-12)", () => {
  it("t14_session_worked_example_28800_from_noon", () => {
    expect(computeExpiresAt(at(12, 0), 28800)).toBe(at(19, 59, 0));
    const s = checkingUserFrom(base(), at(12, 0));
    const done = next(s, { type: "user", nonce: N, login: "alice", dirty: false }, at(12, 0)).state;
    expect(done.expiresAt).toBe(at(19, 59, 0));
    expect(next(done, { type: "tick" }, at(19, 48, 59)).state).toBe(done);
    const expiring = next(done, { type: "tick" }, at(19, 49, 0)).state;
    expect(expiring.status).toBe("expiring");
    expect(next(expiring, { type: "tick" }, at(19, 58, 59)).state).toBe(expiring);
    const expired = next(expiring, { type: "tick" }, at(19, 59, 0));
    expect(expired.state.status).toBe("expired");
    expect(expired.effects).toEqual([{ type: "reset-client" }]);
  });

  it("t14_session_worked_example_90s_gives_9s_margin", () => {
    expect(computeExpiresAt(T0, 90)).toBe(T0 + 81_000);
    const s = checkingUserFrom(base(), T0, 90);
    expect(s.pendingExpiresAt).toBe(T0 + 81_000);
  });
});

describe("session table rows", () => {
  it("t14_session_start_from_idle_opens_popup_health_and_deadline", () => {
    const s = base({ lastError: "timeout" });
    const r = next(s, { type: "start", nonce: N }, T0);
    expect(r.state).toMatchObject({
      status: "signing-in",
      statusBeforeAttempt: "signed-out",
      lastError: null,
      attempt: { nonce: N, deadline: T0 + ATTEMPT_DEADLINE_MS },
    });
    expect(r.effects).toEqual([
      { type: "open-popup", nonce: N },
      { type: "health-check", nonce: N },
      { type: "arm-timer", name: "deadline", nonce: N, at: T0 + ATTEMPT_DEADLINE_MS },
    ]);
    // start is allowed from every non-attempt status, which it saves.
    for (const status of ["signed-in", "expiring", "expired", "sign-in-again"] as SessionStatus[]) {
      expect(next(base({ status }), { type: "start", nonce: N }, T0).state.statusBeforeAttempt).toBe(status);
    }
  });

  it("t14_session_start_while_signing_in_focuses_popup", () => {
    const s = signingInFrom(base());
    const r = next(s, { type: "start", nonce: OTHER }, T0);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([{ type: "focus-popup" }]);
  });

  it("t14_session_start_while_checking_user_is_ignored", () => {
    const s = checkingUserFrom(base());
    expect(next(s, { type: "start", nonce: OTHER }, T0)).toEqual({ state: s, effects: [] });
  });

  it("t14_session_popup_blocked_fails_with_popup_blocked", () => {
    const r = next(signingInFrom(base()), { type: "popup-blocked", nonce: N }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "popup_blocked", attempt: null });
    expect(r.effects).toEqual(clears());
  });

  it("t14_session_popup_blocked_while_expiring_stays_expiring", () => {
    const s = { ...signedIn(), status: "expiring" as const };
    const r = next(signingInFrom(s), { type: "popup-blocked", nonce: N }, T0);
    expect(r.state.status).toBe("expiring");
    expect(r.state.lastError).toBe("popup_blocked");
    // The banner still moves to "ended" at expiry.
    expect(next(r.state, { type: "tick" }, at(19, 59)).state.status).toBe("expired");
  });

  it("t14_session_health_failed_fails_worker_unavailable_and_closes_popup", () => {
    const r = next(signingInFrom(base()), { type: "health-failed", nonce: N }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "worker_unavailable" });
    expect(r.effects).toEqual([{ type: "close-popup" }, ...clears()]);
  });

  it("t14_session_result_with_wrong_nonce_is_ignored", () => {
    const s = signingInFrom(base());
    const r = next(s, { type: "result", nonce: OTHER, ok: true, expiresIn: 28800 }, T0);
    expect(r).toEqual({ state: s, effects: [] });
    expect(r.state).toBe(s);
  });

  it("t14_session_result_ok_moves_to_checking_user_without_applying", () => {
    const before = signedIn("alice", at(19, 0));
    const s = signingInFrom(before);
    const r = next(s, { type: "result", nonce: N, ok: true, expiresIn: 28800 }, T0);
    expect(r.state).toMatchObject({
      status: "checking-user",
      pendingExpiresAt: computeExpiresAt(T0, 28800),
      // The old credential's expiry and key are untouched (CP-3).
      expiresAt: at(19, 0),
      sessionKey: "sign-in:alice",
      attempt: { nonce: N, deadline: T0 + USER_CHECK_DEADLINE_MS },
    });
    expect(r.effects).toEqual([
      { type: "clear-timer", name: "close-grace", nonce: N },
      { type: "clear-timer", name: "deadline", nonce: N },
      { type: "get-user", nonce: N },
      { type: "arm-timer", name: "user-check", nonce: N, at: T0 + USER_CHECK_DEADLINE_MS },
    ]);
  });

  it("t14_session_result_with_unbounded_lifetime_is_refused", () => {
    const r = next(signingInFrom(base()), { type: "result", nonce: N, ok: true, expiresIn: 1e21 }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "non_expiring_token" });
    expect(types(r.effects)).toContain("discard-pending-token");
  });

  it("t14_session_result_error_fails_and_keeps_previous_credential", () => {
    const before = signedIn();
    const r = next(signingInFrom(before), { type: "result", nonce: N, ok: false, error: "access_denied" }, T0);
    expect(r.state).toMatchObject({
      status: "signed-in",
      lastError: "access_denied",
      sessionKey: before.sessionKey,
      lastLogin: "alice",
      expiresAt: before.expiresAt,
    });
    expect(types(r.effects)).not.toContain("reset-client");
    expect(types(r.effects)).not.toContain("apply-new-login");
  });

  it("t14_session_popup_closed_waits_for_grace", () => {
    const s = signingInFrom(base());
    const r = next(s, { type: "popup-closed", nonce: N }, T0);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([{ type: "arm-timer", name: "close-grace", nonce: N, at: T0 + CLOSE_GRACE_MS }]);
  });

  it("t14_session_close_grace_passed_fails_window_closed", () => {
    const s = run(signingInFrom(base()), [{ type: "popup-closed", nonce: N }]);
    const r = next(s, { type: "close-grace-passed", nonce: N }, T0 + CLOSE_GRACE_MS);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "window_closed", attempt: null });
  });

  it("t14_session_result_in_grace_cancels_close_grace", () => {
    const s = run(signingInFrom(base()), [{ type: "popup-closed", nonce: N }]);
    const r = next(s, { type: "result", nonce: N, ok: true, expiresIn: 28800 }, T0 + 500);
    expect(r.state.status).toBe("checking-user");
    expect(r.effects[0]).toEqual({ type: "clear-timer", name: "close-grace", nonce: N });
  });

  it("t14_session_deadline_fails_timeout_and_closes_popup", () => {
    const r = next(signingInFrom(base()), { type: "deadline", nonce: N }, T0 + ATTEMPT_DEADLINE_MS);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "timeout" });
    expect(r.effects).toEqual([{ type: "close-popup" }, ...clears()]);
  });

  it("t14_session_checking_user_ignores_popup_closed", () => {
    const s = checkingUserFrom(base());
    expect(next(s, { type: "popup-closed", nonce: N }, T0)).toEqual({ state: s, effects: [] });
  });

  it("t14_session_same_login_keeps_ui_and_session_key", () => {
    const before = { ...signedIn("alice", at(19, 0)), status: "expired" as const };
    const s = checkingUserFrom(before, at(19, 5));
    const r = next(s, { type: "user", nonce: N, login: "alice", dirty: true }, at(19, 5));
    const expiresAt = computeExpiresAt(at(19, 5), 28800);
    expect(r.state).toMatchObject({
      status: "signed-in",
      sessionKey: "sign-in:alice",
      lastLogin: "alice",
      expiresAt,
      attempt: null,
      pendingExpiresAt: null,
    });
    expect(r.effects).toEqual([
      { type: "clear-timer", name: "user-check", nonce: N },
      { type: "apply-same-login", login: "alice", expiresAt },
      { type: "schedule-expiry", expiresAt },
    ]);
    // A dirty editor is not asked: nothing is reset (F-35).
    expect(types(r.effects)).not.toContain("confirm-discard");
  });

  it("t14_session_other_login_clean_editor_resets", () => {
    const s = checkingUserFrom(signedIn("alice"));
    const r = next(s, { type: "user", nonce: N, login: "bob", dirty: false }, T0);
    const expiresAt = computeExpiresAt(T0, 28800);
    expect(r.state).toMatchObject({
      status: "signed-in",
      sessionKey: "sign-in:bob",
      lastLogin: "bob",
      expiresAt,
    });
    expect(r.effects).toEqual([
      { type: "clear-timer", name: "user-check", nonce: N },
      { type: "apply-new-login", login: "bob", expiresAt },
      { type: "remove-user-repos" },
      { type: "set-marker" },
      { type: "schedule-expiry", expiresAt },
    ]);
  });

  it("t14_session_pat_user_signing_in_as_own_login_counts_as_new", () => {
    const s = checkingUserFrom(initialSessionState("pat"));
    const r = next(s, { type: "user", nonce: N, login: "alice", dirty: false }, T0);
    expect(types(r.effects)).toContain("apply-new-login");
    expect(types(r.effects)).toContain("remove-user-repos");
    // The PAT stays saved: no effect touches it (F-53).
    expect(types(r.effects)).not.toContain("remove-saved-pat");
  });

  it("t14_session_other_login_dirty_editor_asks", () => {
    const s = checkingUserFrom(signedIn("alice"));
    const r = next(s, { type: "user", nonce: N, login: "bob", dirty: true }, T0);
    expect(r.state).toMatchObject({ status: "checking-user", pendingLogin: "bob", sessionKey: "sign-in:alice" });
    expect(r.effects).toEqual([
      { type: "clear-timer", name: "user-check", nonce: N },
      { type: "confirm-discard", nonce: N, login: "bob" },
    ]);
  });

  it("t14_session_discard_confirmed_runs_the_clean_row", () => {
    const s = run(checkingUserFrom(signedIn("alice")), [{ type: "user", nonce: N, login: "bob", dirty: true }]);
    const r = next(s, { type: "discard-confirmed", nonce: N }, T0);
    expect(r.state).toMatchObject({ status: "signed-in", sessionKey: "sign-in:bob", lastLogin: "bob", pendingLogin: null });
    expect(types(r.effects)).toEqual(["clear-timer", "apply-new-login", "remove-user-repos", "set-marker", "schedule-expiry"]);
  });

  it("t14_session_discard_cancelled_fails_cancelled_and_discards_token", () => {
    const before = signedIn("alice");
    const s = run(checkingUserFrom(before), [{ type: "user", nonce: N, login: "bob", dirty: true }]);
    const r = next(s, { type: "discard-cancelled", nonce: N }, T0);
    expect(r.state).toMatchObject({ status: "signed-in", lastError: "cancelled", sessionKey: "sign-in:alice", pendingLogin: null });
    expect(r.effects).toEqual([{ type: "discard-pending-token" }, ...clears()]);
  });

  it("t14_session_user_failed_fails_exchange_failed", () => {
    const r = next(checkingUserFrom(base()), { type: "user-failed", nonce: N }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "exchange_failed", pendingExpiresAt: null });
    expect(r.effects).toEqual([{ type: "discard-pending-token" }, ...clears()]);
  });

  it("t14_session_user_check_deadline_fails_exchange_failed", () => {
    const r = next(checkingUserFrom(base()), { type: "deadline", nonce: N }, T0 + USER_CHECK_DEADLINE_MS);
    expect(r.state).toMatchObject({ status: "signed-out", lastError: "exchange_failed" });
  });

  it("t14_session_tick_during_attempt_moves_status_before_attempt", () => {
    const s = signingInFrom(signedIn("alice", at(19, 59)), at(19, 45));
    const warn = next(s, { type: "tick" }, at(19, 49));
    expect(warn.state).toMatchObject({ status: "signing-in", statusBeforeAttempt: "expiring" });
    expect(warn.effects).toEqual([]);
    const end = next(warn.state, { type: "tick" }, at(19, 59));
    expect(end.state).toMatchObject({ status: "signing-in", statusBeforeAttempt: "expired" });
    expect(end.effects).toEqual([{ type: "reset-client" }]);
    // The attempt then fails back to `expired`.
    expect(next(end.state, { type: "deadline", nonce: N }, at(19, 59)).state.status).toBe("expired");
  });

  it("t14_session_auth_error_during_checking_user_moves_status_before_attempt", () => {
    const s = checkingUserFrom(signedIn());
    const r = next(s, { type: "auth-error" }, T0);
    expect(r.state).toMatchObject({ status: "checking-user", statusBeforeAttempt: "expired" });
    expect(r.effects).toEqual([{ type: "reset-client" }]);
  });

  it("t14_session_late_result_or_user_outside_attempt_is_ignored", () => {
    for (const s of [base(), signedIn(), initialSessionState("pat"), initialSessionState("sign-in-again")]) {
      for (const e of [
        { type: "result", nonce: N, ok: true, expiresIn: 28800 },
        { type: "user", nonce: N, login: "x", dirty: false },
      ] as SessionEvent[]) {
        const r = next(s, e, T0);
        expect(r.state).toBe(s);
        expect(r.effects).toEqual([]);
      }
    }
  });

  it("t14_session_late_events_from_earlier_attempt_are_ignored", () => {
    // Attempt 1 fails; attempt 2 reaches checking-user; attempt 1's late user
    // must not apply attempt 2's token under attempt 1's login (CP-5).
    let s = run(signingInFrom(base()), [{ type: "deadline", nonce: N }]);
    s = run(s, [
      { type: "start", nonce: OTHER },
      { type: "result", nonce: OTHER, ok: true, expiresIn: 28800 },
    ]);
    for (const e of [
      { type: "user", nonce: N, login: "mallory", dirty: false },
      { type: "user-failed", nonce: N },
      { type: "deadline", nonce: N },
      { type: "discard-confirmed", nonce: N },
    ] as SessionEvent[]) {
      expect(next(s, e, T0).state).toBe(s);
    }
  });

  it("t14_session_signed_in_moves_to_expiring_at_warning_time", () => {
    const s = signedIn("alice", at(19, 59));
    expect(next(s, { type: "tick" }, at(19, 59) - EXPIRING_WARNING_MS - 1).state).toBe(s);
    expect(next(s, { type: "tick" }, at(19, 59) - EXPIRING_WARNING_MS)).toEqual({
      state: { ...s, status: "expiring" },
      effects: [],
    });
  });

  it("t14_session_expiry_or_auth_error_moves_to_expired_keeping_session_key", () => {
    for (const from of ["signed-in", "expiring"] as SessionStatus[]) {
      const s = { ...signedIn(), status: from };
      for (const [e, now] of [[{ type: "tick" }, at(19, 59)], [{ type: "auth-error" }, T0]] as [SessionEvent, number][]) {
        const r = next(s, e, now);
        expect(r.state).toMatchObject({ status: "expired", sessionKey: "sign-in:alice", lastLogin: "alice" });
        expect(r.effects).toEqual([{ type: "reset-client" }]);
      }
    }
    // Already expired: nothing more happens.
    const expired = { ...signedIn(), status: "expired" as const };
    expect(next(expired, { type: "auth-error" }, T0).state).toBe(expired);
  });

  it("t14_session_continue_without_leaves_sign_in_again", () => {
    const s = initialSessionState("sign-in-again");
    const r = next(s, { type: "continue-without" }, T0);
    expect(r.state.status).toBe("signed-out");
    expect(r.effects).toEqual([{ type: "remove-marker" }]);
    expect(next(base(), { type: "continue-without" }, T0).effects).toEqual([]);
  });

  it("t13_session_connect_pat_from_any_status", () => {
    for (const s of [base(), signedIn(), initialSessionState("sign-in-again"), { ...signedIn(), status: "expired" as const }]) {
      const r = next(s, { type: "connect-pat" }, T0);
      expect(r.state).toMatchObject({ status: "signed-out", sessionKey: "pat", lastLogin: null, expiresAt: null });
      expect(r.effects).toEqual([{ type: "remove-marker" }, { type: "remove-user-repos" }]);
    }
    // During an attempt the attempt ends too.
    const r = next(signingInFrom(base()), { type: "connect-pat" }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", sessionKey: "pat", attempt: null });
    expect(types(r.effects)).toEqual([
      "close-popup", "discard-pending-token", "clear-timer", "clear-timer", "clear-timer", "remove-marker", "remove-user-repos",
    ]);
  });

  it("t13_session_connect_embed_sets_embed_key", () => {
    const r = next(initialSessionState("pat"), { type: "connect-embed" }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", sessionKey: "embed" });
    expect(r.effects).toEqual([{ type: "remove-marker" }, { type: "remove-user-repos" }]);
    // The same embed key again keeps the repo list.
    expect(next(r.state, { type: "connect-embed" }, T0).effects).toEqual([{ type: "remove-marker" }]);
  });

  it("t24_session_disconnect_with_sign_in_revokes_resets_and_keeps_pat", () => {
    const r = next(signedIn(), { type: "disconnect" }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", sessionKey: null, lastLogin: null, expiresAt: null });
    expect(r.effects).toEqual([
      { type: "revoke" },
      { type: "reset-client" },
      { type: "remove-marker" },
      { type: "remove-user-repos" },
    ]);
    expect(types(r.effects)).not.toContain("remove-saved-pat");
    // Expired is still a sign-in credential.
    expect(types(next({ ...signedIn(), status: "expired" }, { type: "disconnect" }, T0).effects)).toContain("revoke");
  });

  it("t24_session_disconnect_and_remove_pat_removes_saved_pat", () => {
    const r = next(signedIn(), { type: "disconnect-and-remove-pat" }, T0);
    expect(r.state).toMatchObject({ status: "signed-out", sessionKey: null });
    expect(types(r.effects)).toEqual(["revoke", "reset-client", "remove-marker", "remove-user-repos", "remove-saved-pat"]);
    // Only a sign-in credential has this row.
    const pat = initialSessionState("pat");
    expect(next(pat, { type: "disconnect-and-remove-pat" }, T0).state).toBe(pat);
  });

  it("t24_session_disconnect_with_pat_or_embed_is_todays_disconnect", () => {
    for (const key of ["pat", "embed"] as const) {
      const r = next(base({ sessionKey: key }), { type: "disconnect" }, T0);
      expect(r.state).toMatchObject({ status: "signed-out", sessionKey: null });
      expect(types(r.effects)).toEqual(["reset-client", "remove-saved-pat", "remove-marker", "remove-user-repos"]);
      expect(types(r.effects)).not.toContain("revoke");
    }
    const none = base();
    expect(next(none, { type: "disconnect" }, T0).state).toBe(none);
  });

  it("t14_session_no_event_or_effect_carries_a_token", () => {
    // I-10: walk a whole sign-in and check every record for token-like fields.
    const s0 = initialSessionState("pat");
    const events: SessionEvent[] = [
      { type: "start", nonce: N },
      { type: "result", nonce: N, ok: true, expiresIn: 28800 },
      { type: "user", nonce: N, login: "alice", dirty: false },
      { type: "tick" },
      { type: "disconnect" },
    ];
    let s = s0;
    for (const e of events) {
      const r = next(s, e, T0);
      s = r.state;
      for (const rec of [e, r.state, ...r.effects]) {
        expect(Object.keys(rec)).not.toContain("token");
        expect(JSON.stringify(rec)).not.toMatch(/gh[pousr]_/);
      }
    }
  });
});

// ─── Fuzz: total, and unlisted pairs change nothing ─────────────────────────

const STATUSES: SessionStatus[] = [
  "signed-out", "signing-in", "checking-user", "signed-in", "expiring", "expired", "sign-in-again",
];

function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function randomState(r: () => number): SessionState {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const status = pick(STATUSES);
  const attempt = status === "signing-in" || status === "checking-user" || r() < 0.2
    ? { nonce: pick([N, OTHER]), deadline: T0 + 1000 }
    : null;
  return {
    status,
    sessionKey: pick([null, "pat", "embed", "sign-in:alice", "sign-in:bob"] as SessionState["sessionKey"][]),
    lastLogin: pick([null, "alice", "bob"]),
    lastError: pick([null, "timeout"]),
    statusBeforeAttempt: pick(STATUSES.filter((s) => s !== "signing-in" && s !== "checking-user")),
    expiresAt: pick([null, T0 - 1, T0 + 60_000, T0 + 3_600_000]),
    attempt,
    pendingLogin: pick([null, null, "bob"]),
    pendingExpiresAt: pick([null, T0 + 28_000_000]),
  };
}

function randomEvent(r: () => number): SessionEvent {
  const nonce = r() < 0.5 ? N : OTHER;
  const all: SessionEvent[] = [
    { type: "start", nonce },
    { type: "popup-blocked", nonce },
    { type: "health-failed", nonce },
    { type: "result", nonce, ok: true, expiresIn: 28800 },
    { type: "result", nonce, ok: false, error: "access_denied" },
    { type: "popup-closed", nonce },
    { type: "close-grace-passed", nonce },
    { type: "deadline", nonce },
    { type: "user", nonce, login: r() < 0.5 ? "alice" : "bob", dirty: r() < 0.5 },
    { type: "user-failed", nonce },
    { type: "discard-confirmed", nonce },
    { type: "discard-cancelled", nonce },
    { type: "tick" },
    { type: "auth-error" },
    { type: "continue-without" },
    { type: "connect-pat" },
    { type: "connect-embed" },
    { type: "disconnect" },
    { type: "disconnect-and-remove-pat" },
  ];
  return all[Math.floor(r() * all.length)];
}

const ATTEMPT_EVENTS = new Set([
  "popup-blocked", "health-failed", "result", "popup-closed", "close-grace-passed",
  "deadline", "user", "user-failed", "discard-confirmed", "discard-cancelled",
]);
const SIGN_IN_ONLY_IN = { "signing-in": true, "checking-user": true } as Record<string, boolean>;

/** Pairs the table does not list (an independent statement of the table). */
function isUnlisted(s: SessionState, e: SessionEvent): boolean {
  if (ATTEMPT_EVENTS.has(e.type)) {
    const nonce = (e as { nonce: string }).nonce;
    if (!SIGN_IN_ONLY_IN[s.status] || !s.attempt || s.attempt.nonce !== nonce) return true;
    if (s.status === "signing-in") return ["user", "user-failed", "discard-confirmed", "discard-cancelled"].includes(e.type);
    return ["popup-blocked", "health-failed", "result", "popup-closed", "close-grace-passed"].includes(e.type);
  }
  if (e.type === "start") return s.status === "checking-user";
  if (e.type === "continue-without") return s.status !== "sign-in-again";
  if (e.type === "disconnect") return s.sessionKey === null;
  if (e.type === "disconnect-and-remove-pat") return !(s.sessionKey ?? "").startsWith("sign-in:");
  if (e.type === "tick" || e.type === "auth-error") {
    const st = SIGN_IN_ONLY_IN[s.status] ? s.statusBeforeAttempt : s.status;
    return !(st === "signed-in" || st === "expiring") || s.expiresAt === null;
  }
  return false;
}

describe("session fuzz", () => {
  it("t14_session_fuzz_total_and_unlisted_pairs_unchanged", () => {
    const r = rng(20261027);
    let unlisted = 0;
    const failures: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const s = randomState(r);
      const snapshot = JSON.stringify(s);
      const e = randomEvent(r);
      const now = T0 + Math.floor(r() * 30_000_000) - 1_000_000;
      let out: ReturnType<typeof next>;
      try {
        out = next(s, e, now);
      } catch (err) {
        failures.push(`threw on ${s.status} + ${e.type}: ${err}`);
        continue;
      }
      if (JSON.stringify(s) !== snapshot) failures.push(`mutated input on ${s.status} + ${e.type}`);
      if (!STATUSES.includes(out.state.status)) failures.push(`bad status ${out.state.status}`);
      if (!Array.isArray(out.effects)) failures.push(`effects not an array on ${e.type}`);
      if (isUnlisted(s, e)) {
        unlisted++;
        if (out.state !== s || out.effects.length) failures.push(`unlisted ${s.status} + ${e.type} changed something`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(unlisted).toBeGreaterThan(5000);
  });
});
