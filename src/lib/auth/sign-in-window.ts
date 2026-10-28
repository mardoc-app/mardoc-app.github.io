// The sign-in window adapter (design.md § App auth state): the browser side
// of an attempt. It opens the pop-up, runs the health check, the attempt
// timers and close detection, and accepts a sign-in result only when it
// passes I-11's checks, in this order:
//   1. `event.origin` is the app's own origin;
//   2. `event.source` is the pop-up this attempt opened (not another window
//      or a rendered-document iframe);
//   3. `parseSignInResult` accepts the data;
//   4. the result's nonce is this attempt's nonce, and the session is still
//      `signing-in` on that attempt.
// An accepted token goes to the credential module's pending slot; the event
// dispatched is token-free (I-10, CP-6). Everything else is ignored.
//
// The adapter holds no session state of its own beyond the pop-up handle: it
// reads the session through `getSession` and reports through `dispatch`. All
// browser APIs come in through `deps`, so tests use a fake window and clock.
import {
  AUTH_ROUTES,
  HEALTH_TIMEOUT_MS,
  REVOKE_TIMEOUT_MS,
  SIGN_IN_POPUP_FEATURES,
  SIGN_IN_POPUP_NAME,
  parseSignInResult,
  type RevokeRequest,
} from "./contract";
import type { SessionEffect, SessionEvent, SessionState, TimerName } from "./types";

/** How often the adapter checks whether the pop-up was closed. */
export const CLOSE_POLL_MS = 500;
/** 16 random bytes: 22 base64url characters, inside NONCE_PATTERN. */
export const NONCE_BYTES = 16;

/** The parts of the pop-up's WindowProxy the adapter uses. */
export type PopupHandle = { readonly closed: boolean; focus(): void; close(): void };

/** The parts of the opener window the adapter uses. */
export type SignInHost = {
  location: { origin: string };
  open(url: string, target: string, features: string): PopupHandle | null | undefined;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};

type TimerId = ReturnType<typeof setTimeout>;

export type SignInWindowDeps = {
  window: SignInHost;
  getSession: () => SessionState;
  dispatch: (event: SessionEvent) => void;
  setPendingToken: (token: string) => void;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => TimerId;
  clearTimeout?: (id: TimerId) => void;
  setInterval?: (fn: () => void, ms: number) => TimerId;
  clearInterval?: (id: TimerId) => void;
};

export interface SignInWindow {
  /** Begins an attempt; the pop-up opens before this returns (inside the click). */
  start(): void;
  /** Runs a window or timer effect. Returns false for effects it does not own. */
  run(effect: SessionEffect): boolean;
  /** `POST /api/auth/revoke`, best effort: never throws, gives up after 5 s (F-61). */
  revoke(token: string): Promise<void>;
  /** Removes the listener and stops every timer. */
  dispose(): void;
}

export function makeNonce(getRandomValues: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = getRandomValues(new Uint8Array(NONCE_BYTES));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TIMER_EVENTS: Record<TimerName, (nonce: string) => SessionEvent> = {
  deadline: (nonce) => ({ type: "deadline", nonce }),
  "close-grace": (nonce) => ({ type: "close-grace-passed", nonce }),
  // The 10 s deadline on `GET /user` is a failed user check (F-52).
  "user-check": (nonce) => ({ type: "user-failed", nonce }),
};

export function createSignInWindow(deps: SignInWindowDeps): SignInWindow {
  const win = deps.window;
  const doFetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const randomValues = deps.getRandomValues ?? ((bytes) => globalThis.crypto.getRandomValues(bytes));
  const now = deps.now ?? (() => Date.now());
  const later = deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((id) => globalThis.clearTimeout(id));
  const every = deps.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const stopEvery = deps.clearInterval ?? ((id) => globalThis.clearInterval(id));

  // The pop-up of the latest attempt. `settled` is set once a result has been
  // accepted, so a second message for the same attempt changes nothing.
  type Attempt = { nonce: string; popup: PopupHandle; settled: boolean; poll: TimerId | null };
  let attempt: Attempt | null = null;
  const timers = new Map<TimerName, { nonce: string; id: TimerId }>();
  const healthTimers = new Set<TimerId>();
  let disposed = false;

  const awaitingResult = (nonce: string): boolean => {
    const session = deps.getSession();
    return session.status === "signing-in" && session.attempt?.nonce === nonce;
  };

  const stopPolling = () => {
    if (attempt?.poll != null) stopEvery(attempt.poll);
    if (attempt) attempt.poll = null;
  };

  const onMessage = (event: MessageEvent) => {
    const a = attempt;
    if (!a || a.settled) return;
    if (event.origin !== win.location.origin) return;
    if (event.source !== a.popup) return;
    const result = parseSignInResult(event.data);
    if (!result) return;
    if (result.nonce !== a.nonce) return;
    if (!awaitingResult(a.nonce)) return;
    a.settled = true;
    stopPolling();
    if (result.ok) {
      deps.setPendingToken(result.token);
      deps.dispatch({ type: "result", nonce: a.nonce, ok: true, expiresIn: result.expiresIn });
    } else {
      deps.dispatch({ type: "result", nonce: a.nonce, ok: false, error: result.error });
    }
  };
  win.addEventListener("message", onMessage);

  const openPopup = (nonce: string) => {
    stopPolling();
    attempt = null;
    let popup: PopupHandle | null | undefined = null;
    try {
      popup = win.open(`${AUTH_ROUTES.login}?n=${nonce}`, SIGN_IN_POPUP_NAME, SIGN_IN_POPUP_FEATURES);
    } catch {
      popup = null;
    }
    if (!popup) {
      deps.dispatch({ type: "popup-blocked", nonce });
      return;
    }
    const a: Attempt = { nonce, popup, settled: false, poll: null };
    attempt = a;
    a.poll = every(() => {
      if (attempt !== a || a.settled || !awaitingResult(nonce)) {
        if (a.poll != null) stopEvery(a.poll);
        a.poll = null;
        return;
      }
      let closed = false;
      try {
        closed = a.popup.closed;
      } catch {
        closed = true;
      }
      if (closed) {
        if (a.poll != null) stopEvery(a.poll);
        a.poll = null;
        deps.dispatch({ type: "popup-closed", nonce });
      }
    }, CLOSE_POLL_MS);
  };

  // `GET /api/auth/health`: anything but a 200 JSON `{"ok": true}` within 5 s
  // is a failure (a Pages 404, a 5xx, a network error or no answer) (F-51).
  const healthCheck = (nonce: string) => {
    if (!attempt || attempt.nonce !== nonce) return;
    let done = false;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      cancel(timer);
      healthTimers.delete(timer);
      if (disposed) return;
      if (!ok) {
        controller?.abort();
        deps.dispatch({ type: "health-failed", nonce });
      }
    };
    const timer = later(() => finish(false), HEALTH_TIMEOUT_MS);
    healthTimers.add(timer);
    let request: Promise<Response>;
    try {
      request = doFetch(AUTH_ROUTES.health, { cache: "no-store", signal: controller?.signal });
    } catch (e) {
      request = Promise.reject(e);
    }
    request
      .then(async (res) => {
        if (!res.ok) return false;
        const body: unknown = await res.json();
        return typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;
      })
      .catch(() => false)
      .then(finish);
  };

  const armTimer = (name: TimerName, nonce: string, at: number) => {
    const old = timers.get(name);
    if (old) cancel(old.id);
    const id = later(() => {
      if (timers.get(name)?.id === id) timers.delete(name);
      if (disposed) return;
      deps.dispatch(TIMER_EVENTS[name](nonce));
    }, Math.max(0, at - now()));
    timers.set(name, { nonce, id });
  };

  const clearTimer = (name: TimerName, nonce: string) => {
    const timer = timers.get(name);
    if (timer && timer.nonce === nonce) {
      cancel(timer.id);
      timers.delete(name);
    }
  };

  return {
    start() {
      if (disposed) return;
      deps.dispatch({ type: "start", nonce: makeNonce(randomValues) });
    },
    run(effect) {
      switch (effect.type) {
        case "open-popup":
          openPopup(effect.nonce);
          return true;
        case "focus-popup":
          try {
            attempt?.popup.focus();
          } catch {
            /* the pop-up is gone; close detection reports it */
          }
          return true;
        case "close-popup":
          stopPolling();
          try {
            attempt?.popup.close();
          } catch {
            /* already closed */
          }
          return true;
        case "health-check":
          healthCheck(effect.nonce);
          return true;
        case "arm-timer":
          armTimer(effect.name, effect.nonce, effect.at);
          return true;
        case "clear-timer":
          clearTimer(effect.name, effect.nonce);
          return true;
        default:
          return false;
      }
    },
    async revoke(token) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = later(() => controller?.abort(), REVOKE_TIMEOUT_MS);
      const body: RevokeRequest = { token };
      try {
        // Same-origin POST: the browser sends `Origin`, which the Worker checks.
        await doFetch(AUTH_ROUTES.revoke, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          keepalive: true,
          signal: controller?.signal,
        });
      } catch {
        // Best effort: the token expires on its own within 8 hours.
      } finally {
        cancel(timer);
      }
    },
    dispose() {
      disposed = true;
      win.removeEventListener("message", onMessage);
      stopPolling();
      attempt = null;
      timers.forEach((t) => cancel(t.id));
      timers.clear();
      healthTimers.forEach(cancel);
      healthTimers.clear();
    },
  };
}
