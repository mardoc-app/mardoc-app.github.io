// Frozen auth types shared by the sign-in work packages. Types only.
import type { SignInResult, SignInResultCode } from "./contract";

export type SessionStatus =
  | "signed-out"
  | "signing-in"
  | "checking-user"
  | "signed-in"
  | "expiring"
  | "expired"
  | "sign-in-again";

export type SessionKey = "pat" | "embed" | `sign-in:${string}` | null;

export type SessionEvent =
  | { type: "start" }
  | { type: "health-failed" }
  // `source` is the message event's source, compared by identity; unknown here.
  | { type: "result"; result: SignInResult; source: unknown }
  | { type: "popup-closed" }
  | { type: "close-grace-passed" }
  | { type: "deadline" }
  | { type: "user"; login: string }
  | { type: "user-failed" }
  | { type: "tick" }
  | { type: "auth-error" }
  | { type: "continue-without" }
  | { type: "connect-pat" }
  | { type: "disconnect" }
  | { type: "disconnect-and-remove-pat" };

// The token is never a field: it is never in React state or this record (I-10).
export interface SessionState {
  status: SessionStatus;
  sessionKey: SessionKey;
  lastLogin: string | null;
  lastError: SignInResultCode | null;
  statusBeforeAttempt: SessionStatus;
  expiresAt: number | null;
  attempt: { nonce: string; deadline: number } | null;
}

export type SessionEffect =
  | { type: "open-popup" }
  | { type: "focus-popup" }
  | { type: "close-popup" }
  | { type: "health-check" }
  | { type: "get-user" }
  | { type: "apply-same-login" }
  | { type: "apply-new-login" }
  | { type: "confirm-discard" }
  | { type: "reset-client" }
  | { type: "revoke" }
  | { type: "remove-marker" }
  | { type: "set-marker" }
  | { type: "remove-user-repos" }
  | { type: "remove-saved-pat" }
  | { type: "schedule-expiry" };

export type SessionReducer = (
  state: SessionState,
  event: SessionEvent,
  now: number,
) => { state: SessionState; effects: SessionEffect[] };

// The function the Settings screen and banner call to begin a sign-in.
export type StartSignIn = () => void;
