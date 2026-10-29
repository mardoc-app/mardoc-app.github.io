// Frozen auth types shared by the sign-in work packages. Types only.
// Frozen at the wave 1 checkpoint (docs/reviews/2026-10-28-m1-wave1-contract-checkpoint.md).
import type { SignInResultCode } from "./contract";

export type SessionStatus =
  | "signed-out"
  | "signing-in"
  | "checking-user"
  | "signed-in"
  | "expiring"
  | "expired"
  | "sign-in-again";

export type SessionKey = "pat" | "embed" | `sign-in:${string}` | null;

export type TimerName = "deadline" | "close-grace" | "user-check";

// Events never carry a token (I-10). The sign-in window adapter checks the
// message origin, event.source and nonce, keeps the token in the credential
// module's pending slot, and dispatches a token-free `result` (CP-6).
// Attempt-scoped events carry the attempt's nonce; the reducer ignores a
// mismatch, so a late event from an earlier attempt changes nothing (CP-5).
export type SessionEvent =
  | { type: "start"; nonce: string }
  | { type: "popup-blocked"; nonce: string }
  | { type: "health-failed"; nonce: string }
  | { type: "result"; nonce: string; ok: true; expiresIn: number }
  | { type: "result"; nonce: string; ok: false; error: SignInResultCode }
  | { type: "popup-closed"; nonce: string }
  | { type: "close-grace-passed"; nonce: string }
  | { type: "deadline"; nonce: string }
  | { type: "user"; nonce: string; login: string; dirty: boolean }
  | { type: "user-failed"; nonce: string }
  | { type: "discard-confirmed"; nonce: string }
  | { type: "discard-cancelled"; nonce: string }
  | { type: "tick" }
  | { type: "auth-error" }
  | { type: "continue-without" }
  | { type: "connect-pat" }
  | { type: "connect-embed" }
  | { type: "disconnect" }
  | { type: "disconnect-and-remove-pat" };

// The token is never a field: it is never in React state or this record (I-10).
// `expiresAt` belongs to the active credential; `pendingExpiresAt` and
// `pendingLogin` belong to the attempt's new token until it is applied (CP-2, CP-3).
export interface SessionState {
  status: SessionStatus;
  sessionKey: SessionKey;
  lastLogin: string | null;
  lastError: SignInResultCode | null;
  statusBeforeAttempt: SessionStatus;
  expiresAt: number | null;
  attempt: { nonce: string; deadline: number } | null;
  pendingLogin: string | null;
  pendingExpiresAt: number | null;
}

// Effects never carry a token either: the effect runner reads the active or
// pending token from the credential module (src/lib/auth/credential.ts).
export type SessionEffect =
  | { type: "open-popup"; nonce: string }
  | { type: "focus-popup" }
  | { type: "close-popup" }
  | { type: "health-check"; nonce: string }
  | { type: "arm-timer"; name: TimerName; nonce: string; at: number }
  | { type: "clear-timer"; name: TimerName; nonce: string }
  | { type: "get-user"; nonce: string }
  | { type: "apply-same-login"; login: string; expiresAt: number }
  | { type: "apply-new-login"; login: string; expiresAt: number }
  | { type: "discard-pending-token" }
  | { type: "confirm-discard"; nonce: string; login: string }
  | { type: "reset-client" }
  | { type: "revoke" }
  | { type: "remove-marker" }
  | { type: "set-marker" }
  | { type: "remove-user-repos" }
  | { type: "remove-saved-pat" }
  | { type: "schedule-expiry"; expiresAt: number };

export type SessionReducer = (
  state: SessionState,
  event: SessionEvent,
  now: number,
) => { state: SessionState; effects: SessionEffect[] };

// The function the Settings screen and banner call to begin a sign-in.
export type StartSignIn = () => void;
