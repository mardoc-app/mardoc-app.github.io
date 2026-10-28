// Session model for GitHub sign-in (design.md § Session status, App auth state).
//
// `next(state, event, now)` is a pure, total function: it holds no timers and
// makes no I/O (LR-10). Any (status, event) pair the design table does not list
// returns the same state object and no effects. Events and effects carry no
// token (I-10); the effect runner in app-context.tsx reads the active or
// pending token from credential.ts.
//
// Shorthand used below, as in the design: `failed(code)` returns the status to
// `statusBeforeAttempt` (saved by `start`) and sets `lastError = code`.
import type {
  SessionEffect,
  SessionEvent,
  SessionKey,
  SessionReducer,
  SessionState,
  SessionStatus,
  TimerName,
} from "./types";
import {
  ATTEMPT_DEADLINE_MS,
  CLOSE_GRACE_MS,
  EXPIRING_WARNING_MS,
  MAX_EXPIRES_IN_SECONDS,
  USER_CHECK_DEADLINE_MS,
  expiryMarginMs,
  type SignInResultCode,
} from "./contract";

type Result = { state: SessionState; effects: SessionEffect[] };

const TIMERS: TimerName[] = ["deadline", "close-grace", "user-check"];

/** `receivedAt + expiresIn·1000 − min(60 s, expiresIn·100 ms)` (F-33, I-15). */
export function computeExpiresAt(receivedAt: number, expiresInSeconds: number): number {
  return receivedAt + expiresInSeconds * 1000 - expiryMarginMs(expiresInSeconds);
}

export function isAttemptStatus(status: SessionStatus): boolean {
  return status === "signing-in" || status === "checking-user";
}

export function isSignInKey(key: SessionKey): key is `sign-in:${string}` {
  return typeof key === "string" && key.startsWith("sign-in:");
}

/** The credential found at start-up, in the design's decision order. */
export type StartupCredential = "none" | "pat" | "sign-in-again";

/**
 * Start-up decision (design.md § Session status): an embed token wins over
 * everything, then a saved PAT, then the sign-in marker. The embed token
 * arrives later, through `init`, as a `connect-embed` event; until then embed
 * mode keeps today's behaviour (a saved PAT is used) and never shows the
 * sign-in-again prompt.
 */
export function startupCredential(input: {
  embedMode: boolean;
  savedPat: boolean;
  marker: boolean;
}): StartupCredential {
  if (input.savedPat) return "pat";
  if (input.marker && !input.embedMode) return "sign-in-again";
  return "none";
}

export function initialSessionState(start: StartupCredential = "none"): SessionState {
  const status: SessionStatus = start === "sign-in-again" ? "sign-in-again" : "signed-out";
  return {
    status,
    sessionKey: start === "pat" ? "pat" : null,
    lastLogin: null,
    lastError: null,
    statusBeforeAttempt: status,
    expiresAt: null,
    attempt: null,
    pendingLogin: null,
    pendingExpiresAt: null,
  };
}

const unchanged = (state: SessionState): Result => ({ state, effects: [] });

function clearTimers(nonce: string): SessionEffect[] {
  return TIMERS.map((name) => ({ type: "clear-timer", name, nonce }));
}

/** `failed(code)`: back to the status before the attempt, with `lastError`. */
function failed(state: SessionState, code: SignInResultCode, effects: SessionEffect[]): Result {
  const nonce = state.attempt?.nonce ?? "";
  return {
    state: {
      ...state,
      status: state.statusBeforeAttempt,
      lastError: code,
      attempt: null,
      pendingLogin: null,
      pendingExpiresAt: null,
    },
    effects: [...effects, ...clearTimers(nonce)],
  };
}

/** Effects that end an attempt cut short by connect or disconnect. */
function abandonAttempt(state: SessionState): SessionEffect[] {
  if (!state.attempt || !isAttemptStatus(state.status)) return [];
  return [
    { type: "close-popup" },
    { type: "discard-pending-token" },
    ...clearTimers(state.attempt.nonce),
  ];
}

function signedInState(state: SessionState, sessionKey: SessionKey, lastLogin: string, expiresAt: number): SessionState {
  return {
    ...state,
    status: "signed-in",
    sessionKey,
    lastLogin,
    expiresAt,
    attempt: null,
    pendingLogin: null,
    pendingExpiresAt: null,
  };
}

/** `user(login = lastLogin)`: swap the token only; the UI is kept (F-35). */
function applySameLogin(state: SessionState, login: string): Result {
  const expiresAt = state.pendingExpiresAt!;
  const nonce = state.attempt!.nonce;
  const sessionKey = isSignInKey(state.sessionKey) ? state.sessionKey : (`sign-in:${login}` as const);
  return {
    state: signedInState(state, sessionKey, login, expiresAt),
    effects: [
      { type: "clear-timer", name: "user-check", nonce },
      { type: "apply-same-login", login, expiresAt },
      { type: "schedule-expiry", expiresAt },
    ],
  };
}

/** `user(other login)`, editor clean (or Discard confirmed): full reset (F-36). */
function applyNewLogin(state: SessionState, login: string): Result {
  const expiresAt = state.pendingExpiresAt!;
  const nonce = state.attempt!.nonce;
  return {
    state: signedInState(state, `sign-in:${login}`, login, expiresAt),
    effects: [
      { type: "clear-timer", name: "user-check", nonce },
      { type: "apply-new-login", login, expiresAt },
      { type: "remove-user-repos" },
      { type: "set-marker" },
      { type: "schedule-expiry", expiresAt },
    ],
  };
}

function validExpiresIn(expiresIn: number): boolean {
  return Number.isInteger(expiresIn) && expiresIn > 0 && expiresIn <= MAX_EXPIRES_IN_SECONDS;
}

function signingIn(state: SessionState, event: SessionEvent, now: number): Result {
  const nonce = state.attempt!.nonce;
  switch (event.type) {
    case "popup-blocked":
      return failed(state, "popup_blocked", []);
    case "health-failed":
      return failed(state, "worker_unavailable", [{ type: "close-popup" }]);
    case "result":
      if (!event.ok) return failed(state, event.error, []);
      // The parser already refuses these; a forged lifetime must never make
      // a token "never expire" (I-15).
      if (!validExpiresIn(event.expiresIn)) {
        return failed(state, "non_expiring_token", [{ type: "discard-pending-token" }]);
      }
      return {
        state: {
          ...state,
          status: "checking-user",
          attempt: { nonce, deadline: now + USER_CHECK_DEADLINE_MS },
          pendingLogin: null,
          pendingExpiresAt: computeExpiresAt(now, event.expiresIn),
        },
        effects: [
          { type: "clear-timer", name: "close-grace", nonce },
          { type: "clear-timer", name: "deadline", nonce },
          { type: "get-user", nonce },
          { type: "arm-timer", name: "user-check", nonce, at: now + USER_CHECK_DEADLINE_MS },
        ],
      };
    case "popup-closed":
      return {
        state,
        effects: [{ type: "arm-timer", name: "close-grace", nonce, at: now + CLOSE_GRACE_MS }],
      };
    case "close-grace-passed":
      return failed(state, "window_closed", []);
    case "deadline":
      return failed(state, "timeout", [{ type: "close-popup" }]);
    default:
      return unchanged(state);
  }
}

function checkingUser(state: SessionState, event: SessionEvent): Result {
  const nonce = state.attempt!.nonce;
  switch (event.type) {
    case "user": {
      if (state.pendingLogin !== null || state.pendingExpiresAt === null) return unchanged(state);
      if (state.lastLogin !== null && event.login === state.lastLogin) {
        return applySameLogin(state, event.login);
      }
      if (!event.dirty) return applyNewLogin(state, event.login);
      return {
        state: { ...state, pendingLogin: event.login },
        effects: [
          // The question waits for the reviewer, so the 10 s check stops here.
          { type: "clear-timer", name: "user-check", nonce },
          { type: "confirm-discard", nonce, login: event.login },
        ],
      };
    }
    case "user-failed":
    case "deadline":
      return failed(state, "exchange_failed", [{ type: "discard-pending-token" }]);
    case "discard-confirmed":
      if (state.pendingLogin === null || state.pendingExpiresAt === null) return unchanged(state);
      return applyNewLogin(state, state.pendingLogin);
    case "discard-cancelled":
      return failed(state, "cancelled", [{ type: "discard-pending-token" }]);
    default:
      // popup-closed, a late result or health-failed: ignored.
      return unchanged(state);
  }
}

/** `tick` or `auth-error` for the active sign-in credential. */
function expiry(state: SessionState, event: { type: "tick" } | { type: "auth-error" }, now: number): Result {
  const inAttempt = isAttemptStatus(state.status);
  const status = inAttempt ? state.statusBeforeAttempt : state.status;
  if (status !== "signed-in" && status !== "expiring") return unchanged(state);
  if (state.expiresAt === null) return unchanged(state);

  let to: SessionStatus | null = null;
  if (event.type === "auth-error" || now >= state.expiresAt) to = "expired";
  else if (status === "signed-in" && now >= state.expiresAt - EXPIRING_WARNING_MS) to = "expiring";
  if (to === null) return unchanged(state);

  const effects: SessionEffect[] = to === "expired" ? [{ type: "reset-client" }] : [];
  // While an attempt runs, the attempt's status stays; the status it returns
  // to on failure moves instead (checkpoint row).
  const nextState = inAttempt ? { ...state, statusBeforeAttempt: to } : { ...state, status: to };
  return { state: nextState, effects };
}

function connect(state: SessionState, key: "pat" | "embed"): Result {
  const keyChanged = state.sessionKey !== key;
  const effects: SessionEffect[] = [...abandonAttempt(state), { type: "remove-marker" }];
  // A PAT connect always drops the repo list, as setGithubToken does today; an
  // embed token drops it only when the session key changes.
  if (key === "pat" || keyChanged) effects.push({ type: "remove-user-repos" });
  return {
    state: {
      ...state,
      status: "signed-out",
      statusBeforeAttempt: "signed-out",
      sessionKey: key,
      lastLogin: null,
      expiresAt: null,
      attempt: null,
      pendingLogin: null,
      pendingExpiresAt: null,
    },
    effects,
  };
}

function disconnect(state: SessionState, removePat: boolean): Result {
  const key = state.sessionKey;
  let effects: SessionEffect[];
  if (isSignInKey(key)) {
    effects = [
      ...abandonAttempt(state),
      { type: "revoke" },
      { type: "reset-client" },
      { type: "remove-marker" },
      { type: "remove-user-repos" },
    ];
    if (removePat) effects.push({ type: "remove-saved-pat" });
  } else if ((key === "pat" || key === "embed") && !removePat) {
    // Today's setGithubToken(null): reset the client and UI, forget the saved
    // token and the repo list; then remove the marker.
    effects = [
      ...abandonAttempt(state),
      { type: "reset-client" },
      { type: "remove-saved-pat" },
      { type: "remove-marker" },
      { type: "remove-user-repos" },
    ];
  } else {
    return unchanged(state);
  }
  return {
    state: {
      ...state,
      status: "signed-out",
      statusBeforeAttempt: "signed-out",
      sessionKey: null,
      lastLogin: null,
      expiresAt: null,
      attempt: null,
      pendingLogin: null,
      pendingExpiresAt: null,
    },
    effects,
  };
}

export const next: SessionReducer = (state, event, now) => {
  switch (event.type) {
    case "start": {
      if (isAttemptStatus(state.status)) {
        return state.status === "signing-in"
          ? { state, effects: [{ type: "focus-popup" }] }
          : unchanged(state);
      }
      const deadline = now + ATTEMPT_DEADLINE_MS;
      return {
        state: {
          ...state,
          status: "signing-in",
          statusBeforeAttempt: state.status,
          lastError: null,
          attempt: { nonce: event.nonce, deadline },
          pendingLogin: null,
          pendingExpiresAt: null,
        },
        effects: [
          { type: "open-popup", nonce: event.nonce },
          { type: "health-check", nonce: event.nonce },
          { type: "arm-timer", name: "deadline", nonce: event.nonce, at: deadline },
        ],
      };
    }
    case "popup-blocked":
    case "health-failed":
    case "result":
    case "popup-closed":
    case "close-grace-passed":
    case "deadline":
    case "user":
    case "user-failed":
    case "discard-confirmed":
    case "discard-cancelled": {
      // A late event from another attempt, or any attempt event outside an
      // attempt, changes nothing (CP-5).
      if (!state.attempt || event.nonce !== state.attempt.nonce) return unchanged(state);
      if (state.status === "signing-in") return signingIn(state, event, now);
      if (state.status === "checking-user") return checkingUser(state, event);
      return unchanged(state);
    }
    case "tick":
    case "auth-error":
      return expiry(state, event, now);
    case "continue-without":
      if (state.status !== "sign-in-again") return unchanged(state);
      return {
        state: { ...state, status: "signed-out", statusBeforeAttempt: "signed-out" },
        effects: [{ type: "remove-marker" }],
      };
    case "connect-pat":
      return connect(state, "pat");
    case "connect-embed":
      return connect(state, "embed");
    case "disconnect":
      return disconnect(state, false);
    case "disconnect-and-remove-pat":
      return disconnect(state, true);
    default:
      return unchanged(state);
  }
};
