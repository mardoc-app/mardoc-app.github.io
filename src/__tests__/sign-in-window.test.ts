// I-11, F-14 (T-12), F-51 and F-52 (adapter part): the sign-in window adapter
// with a fake opener window, a fake pop-up and a fake clock, driving the real
// session reducer. Nothing here touches a real browser window or network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSignInWindow, makeNonce, CLOSE_POLL_MS, type PopupHandle, type SignInHost } from "@/lib/auth/sign-in-window";
import { next, initialSessionState } from "@/lib/auth/session";
import {
  ATTEMPT_DEADLINE_MS,
  AUTH_ROUTES,
  CLOSE_GRACE_MS,
  HEALTH_TIMEOUT_MS,
  NONCE_PATTERN,
  REVOKE_TIMEOUT_MS,
  SIGN_IN_POPUP_FEATURES,
  SIGN_IN_POPUP_NAME,
} from "@/lib/auth/contract";
import type { SessionEffect, SessionEvent, SessionState } from "@/lib/auth/types";

const ORIGIN = "https://mardoc.app";
const TOKEN = "ghu_fake_sign_in_token";

class FakePopup implements PopupHandle {
  closed = false;
  focus = vi.fn();
  close = vi.fn(() => {
    this.closed = true;
  });
}

type Listener = (event: MessageEvent) => void;

function harness(opts: { popup?: FakePopup | null; health?: () => Promise<Response> } = {}) {
  const listeners = new Set<Listener>();
  const popup = opts.popup === undefined ? new FakePopup() : opts.popup;
  const open = vi.fn((_url: string, _name: string, _features: string) => popup);
  const host: SignInHost = {
    location: { origin: ORIGIN },
    open,
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
  };
  const fetch = vi.fn(async (input: string, _init?: RequestInit): Promise<Response> => {
    if (input === AUTH_ROUTES.health) {
      return opts.health ? opts.health() : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(null, { status: 204 });
  });
  const setPendingToken = vi.fn();
  let state: SessionState = initialSessionState();
  const events: SessionEvent[] = [];
  const effects: SessionEffect[] = [];
  const queue: SessionEvent[] = [];
  let running = false;
  const dispatch = (event: SessionEvent) => {
    queue.push(event);
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const e = queue.shift()!;
        events.push(e);
        const r = next(state, e, Date.now());
        state = r.state;
        for (const effect of r.effects) {
          effects.push(effect);
          adapter.run(effect);
        }
      }
    } finally {
      running = false;
    }
  };
  const adapter = createSignInWindow({
    window: host,
    getSession: () => state,
    dispatch,
    setPendingToken,
    fetch,
  });
  const nonce = () => new URL(open.mock.calls[0][0], ORIGIN).searchParams.get("n")!;
  const post = (data: unknown, source: unknown = popup, origin = ORIGIN) => {
    for (const l of Array.from(listeners)) l({ data, source, origin } as MessageEvent);
  };
  const ok = (n: string | null = nonce(), extra: Record<string, unknown> = {}) => ({
    type: "mardoc-sign-in-result", v: 1, nonce: n, ok: true, token: TOKEN, expiresIn: 28800, ...extra,
  });
  return {
    adapter, host, popup, open, fetch, setPendingToken, dispatch, events, effects, listeners, nonce, post, ok,
    get state() { return state; },
  };
}

/** Lets the fake fetch and its body read settle (real macrotasks; timers stay fake). */
async function flush() {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("start", () => {
  it("t12_window_open_called_synchronously_in_start", () => {
    const h = harness();
    h.adapter.start();
    // Before start() returns: the browser's pop-up blocker allows only this.
    expect(h.open).toHaveBeenCalledTimes(1);
    const [url, name, features] = h.open.mock.calls[0];
    expect(url).toMatch(new RegExp(`^${AUTH_ROUTES.login}\\?n=[A-Za-z0-9_-]{22}$`));
    expect(NONCE_PATTERN.test(h.nonce())).toBe(true);
    expect(name).toBe(SIGN_IN_POPUP_NAME);
    expect(features).toBe(SIGN_IN_POPUP_FEATURES);
    expect(h.state.status).toBe("signing-in");
    expect(h.state.attempt?.nonce).toBe(h.nonce());
    expect(h.fetch).toHaveBeenCalledWith(AUTH_ROUTES.health, expect.anything());
  });

  it("t12_nonce_is_16_random_bytes_base64url", () => {
    const bytes = new Uint8Array(16).fill(0xff);
    const n = makeNonce((b) => { b.set(bytes); return b; });
    expect(n).toBe("_____________________w");
    expect(NONCE_PATTERN.test(makeNonce((b) => crypto.getRandomValues(b)))).toBe(true);
    expect(makeNonce((b) => crypto.getRandomValues(b))).not.toBe(makeNonce((b) => crypto.getRandomValues(b)));
  });

  it("f14_second_start_focuses_the_open_popup", () => {
    const h = harness();
    h.adapter.start();
    const first = h.nonce();
    h.adapter.start();
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.popup!.focus).toHaveBeenCalledTimes(1);
    expect(h.state.attempt?.nonce).toBe(first);
  });

  it("t18_null_popup_dispatches_popup_blocked", async () => {
    const h = harness({ popup: null });
    h.adapter.start();
    expect(h.events.map((e) => e.type)).toEqual(["start", "popup-blocked"]);
    expect(h.state.status).toBe("signed-out");
    expect(h.state.lastError).toBe("popup_blocked");
    expect(h.fetch).not.toHaveBeenCalled();
    await flush();
    vi.advanceTimersByTime(ATTEMPT_DEADLINE_MS);
    expect(h.events.map((e) => e.type)).toEqual(["start", "popup-blocked"]);
  });
});

describe("result checks (I-11)", () => {
  async function started() {
    const h = harness();
    h.adapter.start();
    await flush();
    return h;
  }
  function expectIgnored(h: ReturnType<typeof harness>) {
    expect(h.setPendingToken).not.toHaveBeenCalled();
    expect(h.events.some((e) => e.type === "result")).toBe(false);
    expect(h.state.status).toBe("signing-in");
  }

  it("f14_result_from_its_popup_is_accepted_token_free", async () => {
    const h = await started();
    h.post(h.ok());
    expect(h.setPendingToken).toHaveBeenCalledWith(TOKEN);
    const result = h.events.find((e) => e.type === "result")!;
    expect(result).toEqual({ type: "result", nonce: h.nonce(), ok: true, expiresIn: 28800 });
    expect(JSON.stringify(h.events)).not.toContain(TOKEN);
    expect(JSON.stringify(h.effects)).not.toContain(TOKEN);
    expect(h.state.status).toBe("checking-user");
  });

  it("t12_result_from_other_window_ignored", async () => {
    const h = await started();
    h.post(h.ok(), new FakePopup());
    h.post(h.ok(), null);
    expectIgnored(h);
  });

  it("t12_result_from_iframe_with_copied_nonce_ignored", async () => {
    const h = await started();
    const iframeWindow = { parent: "the app window" };
    h.post(h.ok(), iframeWindow);
    expectIgnored(h);
  });

  it("t12_wrong_origin_ignored", async () => {
    const h = await started();
    h.post(h.ok(), h.popup, "https://evil.example");
    h.post(h.ok(), h.popup, "null");
    h.post(h.ok(), h.popup, "http://mardoc.app");
    expectIgnored(h);
  });

  it("t12_wrong_nonce_ignored", async () => {
    const h = await started();
    h.post(h.ok("A".repeat(22)));
    h.post(h.ok(null));
    h.post({ type: "mardoc-sign-in-result", v: 1, nonce: null, ok: false, error: "access_denied" });
    expectIgnored(h);
  });

  it("t12_malformed_message_ignored", async () => {
    const h = await started();
    const n = h.nonce();
    for (const data of [
      "mardoc-sign-in-result",
      null,
      42,
      { ...h.ok(), type: "other" },
      { ...h.ok(), v: 2 },
      { ...h.ok(), token: "" },
      { ...h.ok(), token: 7 },
      { ...h.ok(), expiresIn: 0 },
      { ...h.ok(), expiresIn: 86401 },
      { ...h.ok(), expiresIn: 1.5 },
      { ...h.ok(), nonce: "short" },
      { type: "mardoc-sign-in-result", v: 1, nonce: n, ok: false, error: "Not A Code" },
      { type: "mardoc-sign-in-result", v: 1, nonce: n, ok: "yes", token: TOKEN, expiresIn: 28800 },
    ]) {
      h.post(data);
    }
    expectIgnored(h);
  });

  it("t12_result_after_attempt_ended_ignored", async () => {
    const h = await started();
    const n = h.nonce();
    vi.advanceTimersByTime(ATTEMPT_DEADLINE_MS);
    expect(h.state.lastError).toBe("timeout");
    h.post(h.ok(n));
    expect(h.setPendingToken).not.toHaveBeenCalled();
    expect(h.state.status).toBe("signed-out");
  });

  it("t12_second_result_for_the_same_attempt_ignored", async () => {
    const h = await started();
    h.post(h.ok());
    h.post(h.ok(h.nonce(), { token: "ghu_second" }));
    expect(h.setPendingToken).toHaveBeenCalledTimes(1);
    expect(h.setPendingToken).toHaveBeenCalledWith(TOKEN);
    expect(h.events.filter((e) => e.type === "result")).toHaveLength(1);
  });

  it("t12_result_from_an_earlier_attempts_popup_ignored", async () => {
    const first = new FakePopup();
    const h = harness({ popup: first });
    h.adapter.start();
    await flush();
    const oldNonce = h.nonce();
    first.closed = true;
    vi.advanceTimersByTime(CLOSE_POLL_MS + CLOSE_GRACE_MS);
    expect(h.state.lastError).toBe("window_closed");
    const second = new FakePopup();
    h.open.mockReturnValue(second);
    h.adapter.start();
    await flush();
    h.post(h.ok(oldNonce), first);
    h.post(h.ok(oldNonce), second);
    expect(h.setPendingToken).not.toHaveBeenCalled();
    expect(h.state.status).toBe("signing-in");
  });

  it("f52_error_result_from_its_popup_ends_the_attempt", async () => {
    const h = await started();
    h.post({ type: "mardoc-sign-in-result", v: 1, nonce: h.nonce(), ok: false, error: "access_denied" });
    expect(h.setPendingToken).not.toHaveBeenCalled();
    expect(h.state.status).toBe("signed-out");
    expect(h.state.lastError).toBe("access_denied");
  });
});

describe("close detection, deadline and health check", () => {
  it("f52_closed_popup_without_result_gives_close_grace_passed_after_1s", async () => {
    const h = harness();
    h.adapter.start();
    await flush();
    h.popup!.closed = true;
    vi.advanceTimersByTime(CLOSE_POLL_MS);
    expect(h.events.at(-1)?.type).toBe("popup-closed");
    vi.advanceTimersByTime(CLOSE_GRACE_MS - 1);
    expect(h.state.status).toBe("signing-in");
    vi.advanceTimersByTime(1);
    expect(h.events.at(-1)?.type).toBe("close-grace-passed");
    expect(h.state.lastError).toBe("window_closed");
    expect(h.events.filter((e) => e.type === "popup-closed")).toHaveLength(1);
  });

  it("f52_result_inside_the_close_grace_is_accepted", async () => {
    const h = harness();
    h.adapter.start();
    await flush();
    h.popup!.closed = true;
    vi.advanceTimersByTime(CLOSE_POLL_MS + CLOSE_GRACE_MS / 2);
    h.post(h.ok());
    expect(h.state.status).toBe("checking-user");
    vi.advanceTimersByTime(CLOSE_GRACE_MS);
    expect(h.events.some((e) => e.type === "close-grace-passed")).toBe(false);
  });

  it("t18_deadline_gives_timeout_and_closes_popup", async () => {
    const h = harness();
    h.adapter.start();
    await flush();
    vi.advanceTimersByTime(ATTEMPT_DEADLINE_MS - 1);
    expect(h.state.status).toBe("signing-in");
    vi.advanceTimersByTime(1);
    expect(h.state.lastError).toBe("timeout");
    expect(h.popup!.close).toHaveBeenCalled();
  });

  it("f51_health_200_ok_keeps_the_attempt", async () => {
    const h = harness();
    h.adapter.start();
    await flush();
    vi.advanceTimersByTime(HEALTH_TIMEOUT_MS);
    expect(h.state.status).toBe("signing-in");
  });

  for (const [name, health] of [
    ["pages_404", async () => new Response("<!DOCTYPE html><title>404</title>", { status: 404, headers: { "x-github-request-id": "X" } })],
    ["503", async () => new Response("Service Unavailable", { status: 503 })],
    ["network_error", async () => { throw new TypeError("Failed to fetch"); }],
    ["200_without_ok", async () => new Response(JSON.stringify({ status: "fine" }), { status: 200 })],
    ["200_html", async () => new Response("<html></html>", { status: 200 })],
  ] as const) {
    it(`f51_worker_unavailable_on_health_${name}`, async () => {
      const h = harness({ health });
      h.adapter.start();
      await flush();
      expect(h.events.at(-1)).toEqual({ type: "health-failed", nonce: h.nonce() });
      expect(h.state.lastError).toBe("worker_unavailable");
      expect(h.popup!.close).toHaveBeenCalled();
    });
  }

  it("f51_worker_unavailable_when_health_hangs_5s", async () => {
    const h = harness({ health: () => new Promise<Response>(() => {}) });
    h.adapter.start();
    vi.advanceTimersByTime(HEALTH_TIMEOUT_MS - 1);
    await flush();
    expect(h.state.status).toBe("signing-in");
    vi.advanceTimersByTime(1);
    expect(h.state.lastError).toBe("worker_unavailable");
    const init = h.fetch.mock.calls[0][1]!;
    expect(init.signal?.aborted).toBe(true);
  });
});

describe("revoke (F-61)", () => {
  it("f61_revoke_posts_the_token_as_json", async () => {
    const h = harness();
    await h.adapter.revoke(TOKEN);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe(AUTH_ROUTES.revoke);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN });
  });

  it("f61_revoke_is_best_effort_and_gives_up_after_5s", async () => {
    const h = harness();
    h.fetch.mockImplementationOnce(async () => { throw new TypeError("offline"); });
    await expect(h.adapter.revoke(TOKEN)).resolves.toBeUndefined();
    let signal: AbortSignal | undefined;
    h.fetch.mockImplementationOnce((_u, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_r, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    const pending = h.adapter.revoke(TOKEN);
    vi.advanceTimersByTime(REVOKE_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });
});

describe("dispose", () => {
  it("removes the listener and stops the timers", () => {
    const h = harness();
    h.adapter.start();
    h.adapter.dispose();
    expect(h.listeners.size).toBe(0);
    vi.advanceTimersByTime(ATTEMPT_DEADLINE_MS);
    expect(h.events.map((e) => e.type)).toEqual(["start"]);
  });
});
