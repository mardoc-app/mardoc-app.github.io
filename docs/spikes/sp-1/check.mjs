// DISPOSABLE SPIKE CODE. Run: node --test docs/spikes/sp-1/check.mjs
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

const TOKEN = "gho_TOPSECRETTOKEN123";
const REFRESH = "ghr_REFRESHSECRET456";
const env = {
  CLIENT_ID: "Iv1.testclient",
  CLIENT_SECRET_A: "secretAAAA",
  CLIENT_SECRET_B: "secretBBBB",
  INSTALLED_REPO: "o/in",
  UNINSTALLED_REPO: "o/out",
  ORG_REPO: "org/r",
};
const call = (path, headers = {}) =>
  worker.fetch(new Request("https://mardoc.app" + path, { headers }), env);

function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u === "https://github.com/login/oauth/access_token")
      return Response.json({ access_token: TOKEN, expires_in: 28800, refresh_token: REFRESH });
    if (u === "https://api.github.com/user") return Response.json({ login: "octo" });
    if (u === "https://api.github.com/repos/o/in") return Response.json({ private: true }, { status: 200 });
    return Response.json({ message: "Not Found" }, { status: 404 });
  };
  return calls;
}

const realFetch = globalThis.fetch;
const logged = [];
const origLog = console.log;
test.before(() => { console.log = (...a) => logged.push(a); });
test.after(() => { console.log = origLog; globalThis.fetch = realFetch; });

async function doLogin(which) {
  const r = await call("/api/auth/login?secret=" + which);
  const sc = r.headers.getSetCookie();
  const cookie = sc.map((s) => s.split(";")[0]).join("; ");
  const loc = new URL(r.headers.get("location"));
  return { r, sc, cookie, loc };
}

test("health", async () => {
  const r = await call("/api/auth/health");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, worker: "sp-1" });
});

test("login sets cookies and redirects with S256", async () => {
  const { r, sc, loc } = await doLogin("a");
  assert.equal(r.status, 302);
  assert.equal(loc.origin + loc.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(loc.searchParams.get("client_id"), env.CLIENT_ID);
  assert.equal(loc.searchParams.get("redirect_uri"), "https://mardoc.app/api/auth/callback");
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  assert.equal(sc.length, 3);
  for (const s of sc)
    for (const a of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/api/auth", "Max-Age=600"])
      assert.ok(s.includes(a), `${s} lacks ${a}`);
  // the challenge really is S256 of the verifier cookie
  const verifier = sc.find((s) => s.startsWith("sp1_verifier=")).split(";")[0].split("=")[1];
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const exp = btoa(String.fromCharCode(...new Uint8Array(d)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(loc.searchParams.get("code_challenge"), exp);
});

test("state mismatch gives 400 and no exchange", async () => {
  const calls = stubFetch();
  const { cookie } = await doLogin("a");
  const r = await call("/api/auth/callback?code=c&state=WRONG", { cookie });
  assert.equal(r.status, 400);
  assert.equal(calls.length, 0);
});

test("callback happy path: login, statuses, no token leaked", async () => {
  const calls = stubFetch();
  const { cookie, loc } = await doLogin("a");
  const r = await call("/api/auth/callback?code=thecode&state=" + loc.searchParams.get("state"), { cookie });
  assert.equal(r.status, 200);
  const text = await r.text();
  const body = JSON.parse(text);
  assert.equal(body.login, "octo");
  assert.equal(body.secret_used, "a");
  assert.deepEqual(body.checks, [
    { repo: "o/in", status: 200, private: true },
    { repo: "o/out", status: 404, private: null },
    { repo: "org/r", status: 404, private: null },
  ]);
  assert.equal(body.token_expires_in_present, true);
  assert.equal(body.refresh_token_present, true);
  const all = text + [...r.headers].map(([k, v]) => k + v).join("") + r.headers.getSetCookie().join("");
  for (const s of [TOKEN, REFRESH, "thecode", env.CLIENT_SECRET_A, env.CLIENT_SECRET_B])
    assert.ok(!all.includes(s), "leaked " + s);
  const ex = new URLSearchParams(calls[0].init.body);
  assert.equal(calls[0].init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(ex.get("client_secret"), "secretAAAA");
  assert.ok(ex.get("code_verifier").length > 20);
  assert.equal(calls[0].init.headers.accept, "application/json");
  assert.equal(calls[1].init.headers.authorization, "Bearer " + TOKEN);
  assert.ok(r.headers.getSetCookie().every((s) => s.includes("Max-Age=0")));
});

test("secret=b uses CLIENT_SECRET_B", async () => {
  const calls = stubFetch();
  const { cookie, loc } = await doLogin("b");
  const r = await call("/api/auth/callback?code=c&state=" + loc.searchParams.get("state"), { cookie });
  assert.equal((await r.json()).secret_used, "b");
  assert.equal(new URLSearchParams(calls[0].init.body).get("client_secret"), "secretBBBB");
});

test("GitHub error maps to the error code only", async () => {
  globalThis.fetch = async () => Response.json({ error: "bad_verification_code", error_description: "x" });
  const { cookie, loc } = await doLogin("a");
  const r = await call("/api/auth/callback?code=c&state=" + loc.searchParams.get("state"), { cookie });
  const b = await r.json();
  assert.equal(b.error, "bad_verification_code");
  assert.ok(!("error_description" in b));
});

test("no-store on every response; unknown path 404", async () => {
  stubFetch();
  const { r: l, cookie, loc } = await doLogin("a");
  const rs = [
    await call("/api/auth/health"),
    l,
    await call("/api/auth/nope"),
    await call("/api/auth/callback?state=x"),
    await call("/api/auth/callback?code=c&state=" + loc.searchParams.get("state"), { cookie }),
  ];
  for (const r of rs) assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(rs[2].status, 404);
});

test("nothing calls console.log", () => {
  assert.equal(logged.length, 0);
});
