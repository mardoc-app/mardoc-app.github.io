// DISPOSABLE SPIKE CODE (SP-1 / SP-2). Not product source. Do not reuse
// without an ADR. Never returns, logs or console.logs a token, code or secret.

const CB = "https://mardoc.app/api/auth/callback";
const COOKIE_ATTRS = "HttpOnly; Secure; SameSite=Lax; Path=/api/auth";

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

function json(body, status = 200, extraHeaders = []) {
  const h = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  for (const [k, v] of extraHeaders) h.append(k, v);
  return new Response(JSON.stringify(body), { status, headers: h });
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.get("cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

const setCookie = (name, value, maxAge) =>
  ["set-cookie", `${name}=${value}; ${COOKIE_ATTRS}; Max-Age=${maxAge}`];

const clearAll = () =>
  ["sp1_state", "sp1_verifier", "sp1_secret"].map((n) => setCookie(n, "", 0));

async function login(url, env) {
  const which = url.searchParams.get("secret") === "b" ? "b" : "a";
  const state = rand();
  const verifier = rand(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const loc = new URL("https://github.com/login/oauth/authorize");
  loc.searchParams.set("client_id", env.CLIENT_ID);
  loc.searchParams.set("redirect_uri", CB);
  loc.searchParams.set("state", state);
  loc.searchParams.set("code_challenge", b64url(digest));
  loc.searchParams.set("code_challenge_method", "S256");
  const h = new Headers({ location: loc.toString(), "cache-control": "no-store" });
  for (const [k, v] of [
    setCookie("sp1_state", state, 600),
    setCookie("sp1_verifier", verifier, 600),
    setCookie("sp1_secret", which, 600),
  ]) h.append(k, v);
  return new Response(null, { status: 302, headers: h });
}

const GH_HEADERS = (token) => ({
  "user-agent": "mardoc-sp1",
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
});

async function callback(req, url, env) {
  const c = cookies(req);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !c.sp1_state || state !== c.sp1_state || !code) {
    return json({ error: "state_mismatch" }, 400, clearAll());
  }
  const which = c.sp1_secret === "b" ? "b" : "a";
  const secret = which === "b" ? env.CLIENT_SECRET_B : env.CLIENT_SECRET_A;
  const tokRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "mardoc-sp1" },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: secret,
      code,
      redirect_uri: CB,
      code_verifier: c.sp1_verifier,
    }),
  });
  let tok = {};
  try { tok = await tokRes.json(); } catch { /* ignore */ }
  if (tok.error || !tok.access_token) {
    const err = String(tok.error || "exchange_failed").replace(/[^a-z_]/g, "").slice(0, 64) || "exchange_failed";
    return json({ error: err, secret_used: which }, 502, clearAll());
  }
  const token = tok.access_token;
  const userRes = await fetch("https://api.github.com/user", { headers: GH_HEADERS(token) });
  const user = userRes.ok ? await userRes.json() : {};
  const checks = [];
  for (const repo of [env.INSTALLED_REPO, env.UNINSTALLED_REPO, env.ORG_REPO]) {
    if (!repo) continue;
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: GH_HEADERS(token) });
    checks.push({ repo, status: r.status });
  }
  return json({
    login: user.login ?? null,
    secret_used: which,
    checks,
    token_expires_in_present: tok.expires_in !== undefined,
    refresh_token_present: tok.refresh_token !== undefined,
  }, 200, clearAll());
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== "GET") return json({ error: "not_found" }, 404);
    switch (url.pathname) {
      case "/api/auth/health": return json({ ok: true, worker: "sp-1" });
      case "/api/auth/login": return login(url, env);
      case "/api/auth/callback": return callback(req, url, env);
      default: return json({ error: "not_found" }, 404);
    }
  },
};
