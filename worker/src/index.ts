// The Auth Worker: routing, request checks and the headers every response
// carries (design.md § Worker routes). Decisions live in ./domain; GitHub
// calls live in ./adapters/github.ts. Nothing here logs (I-16).
import { AUTH_ROUTES, type HealthResponse } from "../../src/lib/auth/contract";
import { createGitHub } from "./adapters/github";
import { decideCallback } from "./domain/callback";
import { clearAttemptCookie, setAttemptCookie, staleAttemptNonces } from "./domain/cookies";
import { base64url, cryptoRandom, isNonce, startAttempt } from "./domain/login";
import { STATIC_CSP, callbackCsp, renderCallbackPage, renderInstallPage } from "./domain/page";

export interface Env {
  /** GitHub App client ID (var). */
  CLIENT_ID: string;
  /** The app's origin, the only postMessage target and allowed revoke Origin (var). */
  APP_ORIGIN: string;
  /** GitHub App client secret (secret; set by the owner with wrangler secret). */
  CLIENT_SECRET: string;
  /** Git SHA of the deployed commit (optional var); health reports "dev" without it. */
  VERSION?: string;
}

const UNCONFIGURED = {} as Env;

/** Revoke bodies are tiny; a bigger declared length is refused unread, and a body is read only up to this cap. */
const MAX_REVOKE_BODY_BYTES = 4096;
/** GitHub tokens are base62 plus `_`, at most 255 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_]{1,255}$/;

const COMMON_HEADERS: ReadonlyArray<[string, string]> = [
  ["cache-control", "no-store"],
  ["referrer-policy", "no-referrer"],
  ["x-content-type-options", "nosniff"],
];

type HeaderList = Array<[string, string]>;

/** Every response goes through here: no-store, no referrer, nosniff, and no Access-Control-*. */
function respond(status: number, body: string | null, headers: HeaderList = []): Response {
  const h = new Headers();
  for (const [k, v] of COMMON_HEADERS) h.set(k, v);
  for (const [k, v] of headers) {
    if (k.toLowerCase().startsWith("access-control-")) continue;
    h.append(k, v);
  }
  return new Response(body, { status, headers: h });
}

const TEXT: [string, string] = ["content-type", "text/plain; charset=utf-8"];
const JSON_TYPE: [string, string] = ["content-type", "application/json"];
const HTML: [string, string] = ["content-type", "text/html; charset=utf-8"];

const text = (status: number, body: string) => respond(status, `${body}\n`, [TEXT]);
const json = (status: number, body: unknown) => respond(status, JSON.stringify(body), [JSON_TYPE]);
const notFound = () => text(404, "Not found");

function isOrigin(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

function callbackUrl(env: Env): string {
  return `${env.APP_ORIGIN}${AUTH_ROUTES.callback}`;
}

/** The App's configuration; the one place the secret is read from env (C-13). */
function appConfig(env: Env) {
  return {
    clientId: env.CLIENT_ID,
    clientSecret: env.CLIENT_SECRET,
    redirectUri: callbackUrl(env),
  };
}

function github(env: Env) {
  return createGitHub(appConfig(env));
}

function health(env: Env): Response {
  // A deploy without the client ID or secret cannot sign anyone in; saying so
  // here makes the tab report worker_unavailable within 5 s (F-51, CR-4).
  // The body never names which value is missing.
  const config = appConfig(env);
  if (!config.clientId || !config.clientSecret) return json(503, { ok: false });
  const body: HealthResponse = { ok: true, version: env.VERSION || "dev" };
  return json(200, body);
}

async function login(request: Request, url: URL, env: Env): Promise<Response> {
  // Only a top-level navigation from MarDoc itself may start an attempt.
  if (
    request.headers.get("sec-fetch-site") !== "same-origin" ||
    request.headers.get("sec-fetch-dest") !== "document"
  ) {
    return text(403, "Sign-in must start from MarDoc.");
  }
  const nonce = url.searchParams.get("n");
  if (!isNonce(nonce)) return text(400, "Sign-in request is not valid. Close this window and try again.");

  const attempt = await startAttempt(nonce, { clientId: env.CLIENT_ID, redirectUri: callbackUrl(env) });
  const cookieHeader = request.headers.get("cookie");
  const headers: HeaderList = [
    ["location", attempt.location],
    ["set-cookie", setAttemptCookie(nonce, { state: attempt.state, verifier: attempt.verifier })],
  ];
  for (const stale of staleAttemptNonces(cookieHeader, nonce)) {
    headers.push(["set-cookie", clearAttemptCookie(stale)]);
  }
  return respond(302, null, headers);
}

async function callback(request: Request, url: URL, env: Env): Promise<Response> {
  const outcome = await decideCallback(url.searchParams, request.headers.get("cookie"), github(env));
  if (outcome.kind === "install") {
    return respond(200, renderInstallPage(), [HTML, ["content-security-policy", STATIC_CSP]]);
  }
  const cspNonce = base64url(cryptoRandom(16));
  const headers: HeaderList = [HTML, ["content-security-policy", callbackCsp(cspNonce)]];
  if (outcome.clearNonce !== null) headers.push(["set-cookie", clearAttemptCookie(outcome.clearNonce)]);
  return respond(200, renderCallbackPage(outcome.result, env.APP_ORIGIN, cspNonce), headers);
}

/**
 * The body as text, or null once more than `max` bytes have arrived. It stops
 * reading at the cap, so a chunked body is never buffered whole (SR-2).
 */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function revoke(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("origin") !== env.APP_ORIGIN) return json(403, { error: "forbidden" });
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return json(400, { error: "bad_request" });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!(declared <= MAX_REVOKE_BODY_BYTES)) return json(400, { error: "bad_request" });
  // A body without a Content-Length (chunked) is read through the cap too (SR-2).
  const raw = await readCapped(request, MAX_REVOKE_BODY_BYTES);
  if (raw === null) return json(400, { error: "bad_request" });
  let token: unknown;
  try {
    const body: unknown = JSON.parse(raw);
    token = typeof body === "object" && body !== null ? (body as Record<string, unknown>).token : undefined;
  } catch {
    return json(400, { error: "bad_request" });
  }
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return json(400, { error: "bad_request" });
  const outcome = await github(env).revoke(token);
  return outcome === "revoked" ? respond(204, null) : json(502, { error: "revoke_failed" });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  switch (url.pathname) {
    case AUTH_ROUTES.health:
      return method === "GET" ? health(env) : notFound();
    case AUTH_ROUTES.login:
    case AUTH_ROUTES.callback:
    case AUTH_ROUTES.revoke: {
      const expected = url.pathname === AUTH_ROUTES.revoke ? "POST" : "GET";
      if (method !== expected) return notFound();
      // Without a valid app origin there is nowhere safe to send a result.
      if (!isOrigin(env.APP_ORIGIN)) return text(500, "Sign-in is not configured.");
      if (url.pathname === AUTH_ROUTES.login) return login(request, url, env);
      if (url.pathname === AUTH_ROUTES.callback) return callback(request, url, env);
      return revoke(request, env);
    }
    default:
      // Includes /api/auth/refresh: stage 1 has no refresh route (F-25, C-16).
      return notFound();
  }
}

export default {
  async fetch(request: Request, env: Env = UNCONFIGURED): Promise<Response> {
    try {
      return await route(request, env);
    } catch {
      return text(500, "Internal error");
    }
  },
};
