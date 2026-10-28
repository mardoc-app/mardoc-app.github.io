// Shared fixtures for the route tests: a test env, a stubbed GitHub (global
// fetch replaced, every call recorded) and a `call` that checks the common
// headers on every response it returns (T-22: no-store, no Access-Control-*).
import { expect, vi } from "vitest";
import worker, { type Env } from "../src/index";

export const APP = "https://mardoc.app";
export const SECRET = "dummy-test-secret-not-real";
export const ENV: Env = { CLIENT_ID: "Iv1.testclient", APP_ORIGIN: APP, CLIENT_SECRET: SECRET };
export const NONCE = "abcdefghijklmnopqrstuv"; // 22 chars
export const NAV = { "sec-fetch-site": "same-origin", "sec-fetch-dest": "document" };

export interface StubCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export type StubReply = Response | (() => Response | Promise<Response>) | Error;

/** Replaces global fetch; replies are used in order, the last one repeats. */
export function stubGitHub(...replies: StubReply[]) {
  const calls: StubCall[] = [];
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === "string" ? init.body : String(init.body ?? ""),
    });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply === undefined) throw new Error("no stub reply");
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply() : reply.clone();
  });
  return calls;
}

export const ghJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function assertCommonHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  const cors = [...res.headers.keys()].filter((k) => k.toLowerCase().startsWith("access-control-"));
  expect(cors).toEqual([]);
}

export async function call(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  env: Env = ENV,
) {
  const res = await worker.fetch(new Request(`${APP}${path}`, init), env);
  assertCommonHeaders(res);
  const body = await res.text();
  return { res, body, status: res.status, cookies: res.headers.getSetCookie() };
}

/** Runs /login and returns what a browser would hold afterwards. */
export async function startLogin(nonce = NONCE, extraCookie?: string) {
  const headers: Record<string, string> = { ...NAV };
  if (extraCookie) headers.cookie = extraCookie;
  const r = await call(`/api/auth/login?n=${nonce}`, { headers });
  expect(r.status).toBe(302);
  const location = new URL(r.res.headers.get("location") ?? "");
  const set = r.cookies.find((c) => c.startsWith(`__Secure-mardoc_auth_${nonce}=`)) ?? "";
  return { ...r, location, state: location.searchParams.get("state") ?? "", cookie: set.split(";")[0] };
}

/** The JSON text inside the callback page's result element. */
export function resultText(body: string): string {
  const m = /<script type="application\/json" id="result">([\s\S]*?)<\/script>/.exec(body);
  if (!m) throw new Error("no result element");
  return m[1];
}

/** The callback page's one executable script and its nonce attribute. */
export function pageScript(body: string): { nonce: string; source: string } {
  const m = /<script nonce="([^"]+)">([\s\S]*?)<\/script>/.exec(body);
  if (!m) throw new Error("no nonce'd script");
  return { nonce: m[1], source: m[2] };
}

/** Runs the page script against a fake window and document. */
export function runPageScript(body: string, opener: boolean) {
  const posted: Array<[unknown, string]> = [];
  let closed = false;
  const msg = { textContent: "" };
  // The result element as a DOM element: it can be removed, after which
  // getElementById no longer finds it (SR-3).
  let resultInDom = true;
  const result = {
    textContent: resultText(body),
    remove() {
      resultInDom = false;
    },
  };
  const fakeDocument = {
    getElementById(id: string) {
      if (id === "result") return resultInDom ? result : null;
      if (id === "msg") return msg;
      return null;
    },
  };
  const fakeWindow = {
    opener: opener ? { postMessage: (m: unknown, o: string) => posted.push([m, o]) } : null,
    close: () => {
      closed = true;
    },
  };
  new Function("window", "document", pageScript(body).source)(fakeWindow, fakeDocument);
  return {
    posted,
    closed,
    msg: msg.textContent,
    /** Whether a token-bearing result is still in the document after the script ran. */
    resultInDom: resultInDom && result.textContent !== "",
  };
}
