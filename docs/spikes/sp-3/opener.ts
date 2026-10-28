// DISPOSABLE SPIKE CODE (SP-3). Not product source.
// The opener page served at /api/auth/__sp3 and the checks it runs on a
// message. checkMessage is also stringified into the page, so it must stay
// self-contained (no imports, no outer variables, erasable types only).

export interface Expected {
  origin: string;
  popup: unknown;
  nonce: string;
}
export type Verdict = { ok: true } | { ok: false; reason: string };

export function checkMessage(
  e: { origin: string; source: unknown; data: unknown },
  expected: Expected,
): Verdict {
  if (e.origin !== expected.origin) return { ok: false, reason: "origin" };
  if (!expected.popup || e.source !== expected.popup) return { ok: false, reason: "source" };
  const d = e.data as Record<string, unknown> | null;
  if (typeof d !== "object" || d === null) return { ok: false, reason: "shape" };
  if (d.type !== "mardoc-sign-in-result" || d.v !== 1) return { ok: false, reason: "shape" };
  if (d.nonce !== expected.nonce) return { ok: false, reason: "nonce" };
  return { ok: true };
}

export function openerCsp(cspNonce: string): string {
  return (
    `default-src 'none'; script-src 'nonce-${cspNonce}'; style-src 'nonce-${cspNonce}'; ` +
    "connect-src https://api.github.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
}

// The page script. The token is held in one variable, used for the GitHub
// calls and then dropped. Only its presence, length and expiresIn are shown.
// Written as plain JS (not a template of the TS) so what runs is what is read.
const SCRIPT = String.raw`
var APP_ORIGIN = location.origin;
var el = function (id) { return document.getElementById(id); };
var out = {};
var popup = null, nonce = null, started = 0, timer = null, tokenCache = null;
${"__CHECK__"}
function nonce22() {
  var b = new Uint8Array(16); crypto.getRandomValues(b);
  return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function show() { el("out").textContent = JSON.stringify(out, null, 2); }
function note(k, v) { out[k] = v; show(); }
async function gh(path) {
  var r = await fetch("https://api.github.com" + path, {
    headers: { authorization: "Bearer " + tokenCache, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }
  });
  return { status: r.status, body: r.ok ? await r.json() : null };
}
async function afterToken() {
  try {
    var u = await gh("/user");
    note("GET /user", { status: u.status, login: u.body && u.body.login });
    var repos = await gh("/user/repos?per_page=100&affiliation=owner,collaborator,organization_member");
    var names = repos.body ? repos.body.map(function (x) { return x.full_name; }) : [];
    note("GET /user/repos", { status: repos.status, count: names.length, names: names });
    var inst = await gh("/user/installations");
    var list = inst.body ? inst.body.installations : [];
    note("GET /user/installations", { status: inst.status, count: list.length, accounts: list.map(function (i) { return i.account && i.account.login; }) });
    var instNames = [];
    for (var i = 0; i < list.length; i++) {
      var rr = await gh("/user/installations/" + list[i].id + "/repositories?per_page=100");
      if (rr.body) instNames = instNames.concat(rr.body.repositories.map(function (x) { return x.full_name; }));
    }
    var extra = names.filter(function (n) { return instNames.indexOf(n) < 0; });
    note("A-16", { installationRepoCount: instNames.length, userReposNotInInstallations: extra, userReposLimitedToInstallations: extra.length === 0 });
  } catch (err) { note("github-error", String((err && err.message) || err)); }
  tokenCache = null;
}
window.addEventListener("message", function (e) {
  if (!nonce) return;
  var v = checkMessage(e, { origin: APP_ORIGIN, popup: popup, nonce: nonce });
  if (!v.ok) { note("rejected-" + Date.now(), { reason: v.reason, origin: e.origin }); return; }
  clearTimeout(timer);
  var d = e.data;
  out = {
    browser: navigator.userAgent,
    delivered: true,
    msToDeliver: Date.now() - started,
    eventOrigin: e.origin,
    sourceIsPopup: e.source === popup,
    nonceMatched: true,
    ok: d.ok,
    tokenArrived: typeof d.token === "string" && d.token.length > 0,
    tokenLength: typeof d.token === "string" ? d.token.length : 0,
    expiresIn: d.expiresIn,
    error: d.error
  };
  tokenCache = typeof d.token === "string" ? d.token : null;
  show();
  setTimeout(function () { note("popupClosedAfterMessage", popup ? popup.closed : null); }, 1500);
  if (tokenCache) afterToken();
});
el("go").addEventListener("click", function () {
  nonce = nonce22(); started = Date.now();
  out = { browser: navigator.userAgent, delivered: false, note: "waiting for the pop-up" };
  show();
  popup = window.open("/api/auth/login?n=" + nonce, "mardoc-sign-in", "popup,width=600,height=720");
  if (!popup) { note("popup", "blocked: window.open returned null"); return; }
  clearTimeout(timer);
  timer = setTimeout(function () {
    note("result", "NO MESSAGE within 180 s; popupClosed=" + (popup ? popup.closed : "n/a"));
  }, 180000);
});
`;

export function renderOpenerPage(cspNonce: string): string {
  const script = SCRIPT.replace("__CHECK__", () => checkMessage.toString());
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>SP-3 opener</title>" +
    `<style nonce="${cspNonce}">body{font:16px system-ui;margin:1rem}button{font-size:1.2rem;padding:.7rem 1.2rem}pre{white-space:pre-wrap;word-break:break-word;background:#eee;padding:.7rem}</style>` +
    "</head><body><h1>SP-3 opener (disposable)</h1>" +
    "<p>Press the button, sign in to GitHub in the pop-up, then copy the box below into the report.</p>" +
    '<button id="go" type="button">Sign in with GitHub</button><pre id="out">not started</pre>' +
    `<script nonce="${cspNonce}">${script}</script></body></html>\n`
  );
}
