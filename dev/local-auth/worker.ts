// DEVELOPMENT-ONLY WRAPPER WORKER (WP-8). Never deployed, never part of
// `out/` or the Auth Worker bundle (worker/wrangler.toml builds
// worker/src/index.ts only).
//
// It runs the product Auth Worker module, unchanged, behind one local origin:
// wrangler serves the built app (`out/`) as static assets, and every
// `/api/auth/*` request comes here first. App and Worker share the origin,
// as they do on mardoc.app.
//
// Two modes:
//   - STUB_GITHUB=1: GitHub is simulated in-process. The Worker's outbound
//     fetch calls to github.com and api.github.com go to the stub below, and
//     the browser's trip to GitHub's consent screen goes to a stub authorize
//     route on this origin, which redirects straight back to the real
//     callback with a code. Nothing leaves the machine.
//   - otherwise: a pass-through to the product module. With the development
//     GitHub App's client ID (`--var CLIENT_ID:<id>`) and its secret in
//     `dev/local-auth/.dev.vars`, this is a real sign-in at localhost (A-15).
//
// The stub lives here, never in worker/src: the shipped credential code has
// no test path (WP-8 § Risks).
import product, { type Env as ProductEnv } from "../../worker/src/index";

interface Env extends ProductEnv {
  /** "1" turns on the in-process GitHub stub. */
  STUB_GITHUB?: string;
}

const STUB_BASE = "/api/auth/__stub-github";
const STUB_AUTHORIZE = `${STUB_BASE}/authorize`;
const STUB_INSTALL = `${STUB_BASE}/install`;
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const STUB_CLIENT_ID = "Iv1.stubclientid0000";
const STUB_CLIENT_SECRET = "stub-client-secret";
const STUB_EXPIRES_IN = 28800;

/** Codes the stub authorize route issued and not yet exchanged. */
const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string }>();
/** Access tokens the stub issued and not yet revoked. */
const tokens = new Set<string>();

function randomId(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const plain = (status: number, body: string) =>
  new Response(`${body}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/** Stand-in for GitHub's consent screen: approve at once, back to the callback with a code. */
function stubAuthorize(url: URL, env: Env): Response {
  const p = url.searchParams;
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const state = p.get("state") ?? "";
  const challenge = p.get("code_challenge") ?? "";
  if (clientId !== env.CLIENT_ID) return plain(400, "stub: unknown client_id");
  if (redirectUri !== `${env.APP_ORIGIN}/api/auth/callback`) return plain(400, "stub: redirect_uri mismatch");
  if (!state || !challenge || p.get("code_challenge_method") !== "S256") return plain(400, "stub: bad PKCE request");
  const code = `stubcode${randomId(10)}`;
  codes.set(code, { clientId, redirectUri, challenge });
  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  back.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { location: back.toString(), "cache-control": "no-store" } });
}

/** Stand-in for GitHub's install return: no state, an installation_id. */
function stubInstall(env: Env): Response {
  const back = new URL(`${env.APP_ORIGIN}/api/auth/callback`);
  back.searchParams.set("installation_id", "4242");
  back.searchParams.set("setup_action", "install");
  return new Response(null, { status: 302, headers: { location: back.toString(), "cache-control": "no-store" } });
}

/** github.com and api.github.com as the product module calls them. */
async function stubGitHub(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === "github.com" && url.pathname === "/login/oauth/access_token" && request.method === "POST") {
    const form = new URLSearchParams(await request.text());
    const code = form.get("code") ?? "";
    const issued = codes.get(code);
    codes.delete(code); // single use, as on GitHub
    if (form.get("client_id") !== env.CLIENT_ID || form.get("client_secret") !== env.CLIENT_SECRET) {
      return json(200, { error: "incorrect_client_credentials" });
    }
    if (!issued || issued.redirectUri !== form.get("redirect_uri")) return json(200, { error: "bad_verification_code" });
    if ((await s256(form.get("code_verifier") ?? "")) !== issued.challenge) {
      return json(200, { error: "bad_verification_code" });
    }
    const token = `ghu_stub${randomId(16)}`;
    tokens.add(token);
    // GitHub's full answer, refresh token included: the product module must drop it (I-13).
    return json(200, {
      access_token: token,
      expires_in: STUB_EXPIRES_IN,
      refresh_token: `ghr_stubrefresh${randomId(16)}`,
      refresh_token_expires_in: 15897600,
      token_type: "bearer",
      scope: "",
    });
  }
  const revokePath = `/applications/${encodeURIComponent(env.CLIENT_ID)}/token`;
  if (url.hostname === "api.github.com" && url.pathname === revokePath && request.method === "DELETE") {
    const expected = `Basic ${btoa(`${env.CLIENT_ID}:${env.CLIENT_SECRET}`)}`;
    if (request.headers.get("authorization") !== expected) return json(401, { message: "Requires authentication" });
    let token: unknown;
    try {
      token = ((await request.json()) as Record<string, unknown>).access_token;
    } catch {
      return json(422, { message: "Invalid request" });
    }
    if (typeof token !== "string" || !tokens.delete(token)) return json(404, { message: "Not Found" });
    return new Response(null, { status: 204 });
  }
  return json(404, { message: "stub: not simulated" });
}

const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);

/** Sends github.com and api.github.com to the stub; nothing else is reachable in stub mode. */
function stubbedFetch(env: Env): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as RequestInfo, init);
    const host = new URL(request.url).hostname;
    if (host === "github.com" || host === "api.github.com") return stubGitHub(request, env);
    return json(502, { message: "stub mode: outbound network is off" });
  }) as typeof fetch;
}

/** Points the consent-screen redirect from /login at the stub authorize route. */
function redirectToStub(response: Response, env: Env): Response {
  const location = response.headers.get("location");
  if (response.status !== 302 || !location?.startsWith(`${GITHUB_AUTHORIZE}?`)) return response;
  const out = new Response(response.body, response);
  const target = new URL(location);
  out.headers.set("location", `${env.APP_ORIGIN}${STUB_AUTHORIZE}${target.search}`);
  return out;
}

export default {
  async fetch(request: Request, rawEnv: Env): Promise<Response> {
    const url = new URL(request.url);
    const stub = rawEnv.STUB_GITHUB === "1";
    if (!stub) {
      globalThis.fetch = realFetch;
      if (!rawEnv.CLIENT_ID && url.pathname === "/api/auth/login") {
        return plain(500, "dev/local-auth: set the development App's client ID with --var CLIENT_ID:<id>, or run with STUB_GITHUB=1.");
      }
      return product.fetch(request, rawEnv);
    }

    const env: Env = {
      ...rawEnv,
      CLIENT_ID: rawEnv.CLIENT_ID || STUB_CLIENT_ID,
      CLIENT_SECRET: rawEnv.CLIENT_SECRET || STUB_CLIENT_SECRET,
    };
    globalThis.fetch = stubbedFetch(env);
    if (request.method === "GET" && url.pathname === STUB_AUTHORIZE) return stubAuthorize(url, env);
    if (request.method === "GET" && url.pathname === STUB_INSTALL) return stubInstall(env);
    const response = await product.fetch(request, env);
    return url.pathname === "/api/auth/login" ? redirectToStub(response, env) : response;
  },
};
