// DISPOSABLE SPIKE PROBE (SP-3). Read-only GETs. Prints statuses, selected
// headers and PASS/FAIL; never prints bodies beyond a diff offset.
// Usage: node docs/spikes/sp-3/probe.mjs [base-url]     (default https://mardoc.app)
// Compares the served callback page (a bare GET /api/auth/callback renders the
// real page with {"error":"state_mismatch"}, no GitHub call) and the opener
// page against what the product code renders locally, nonce normalised, to
// show whether the zone's HTML rewriting (Email Address Obfuscation, Automatic
// HTTPS Rewrites, Rocket Loader) changed a byte.
import { renderCallbackPage } from "../../../worker/src/domain/page.ts";
import { renderOpenerPage, openerCsp } from "./opener.ts";

const base = process.argv[2] ?? "https://mardoc.app";
let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) fails++;
};
const NONCE = "NONCE";
const norm = (s, n) => s.split(n).join(NONCE);
// The bundler and Node strip TypeScript types differently, so the stringified
// checkMessage differs in whitespace; its text is compared by the unit test.
const dropFn = (s) => s.replace(/function checkMessage[\s\S]*?\n\}\n/, "function checkMessage(){}\n");

async function get(path) {
  const r = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "mardoc-sp3-probe" } });
  return { r, body: await r.text() };
}
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `offset ${i}: served=${JSON.stringify(a.slice(i, i + 60))} expected=${JSON.stringify(b.slice(i, i + 60))}`;
}
const hdr = (r, k) => r.headers.get(k) ?? "";
console.log(`== probe ${base} ${new Date().toISOString()} ==`);

// Health and routing.
{
  const { r, body } = await get("/api/auth/health");
  console.log(`-- health status=${r.status} cache-control=${hdr(r, "cache-control")} cf-cache-status=${hdr(r, "cf-cache-status")} x-github-request-id=${hdr(r, "x-github-request-id")}`);
  check(r.status === 200 && body.includes('"ok":true'), "health is the Worker's JSON 200");
  check(!hdr(r, "x-github-request-id"), "health not served by Pages");
}

// Callback page: bytes, CSP, rewriting markers.
{
  const { r, body } = await get("/api/auth/callback");
  const csp = hdr(r, "content-security-policy");
  const n = (csp.match(/'nonce-([^']+)'/) ?? [])[1] ?? "";
  console.log(`-- callback status=${r.status} content-type=${hdr(r, "content-type")} cache-control=${hdr(r, "cache-control")} cf-cache-status=${hdr(r, "cf-cache-status")}`);
  console.log(`-- callback csp=${csp}`);
  const result = { type: "mardoc-sign-in-result", v: 1, nonce: null, ok: false, error: "state_mismatch" };
  const expected = renderCallbackPage(result, "https://mardoc.app", n || NONCE);
  const same = n !== "" && norm(body, n) === norm(expected, n);
  check(r.status === 200, "callback is 200");
  check(n !== "" && body.includes(`<script nonce="${n}">`), "inline script nonce matches the CSP nonce");
  check(csp === `default-src 'none'; script-src 'nonce-${n}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, "callback CSP unchanged by the zone");
  check(same, "callback body byte-identical to the product render (nonce normalised)");
  if (!same) console.log(`      ${firstDiff(norm(body, n), norm(expected, n))}`);
  check(!/cdn-cgi|email-protection|data-cfemail|rocket-loader|rocketloader|data-cf-/i.test(body), "no Cloudflare rewriting markers in the callback body");
  const j = (body.match(/<script type="application\/json" id="result">([^<]*)<\/script>/) ?? [])[1];
  let parsed = null;
  try { parsed = JSON.parse(j); } catch { /* reported below */ }
  check(parsed !== null && parsed.type === "mardoc-sign-in-result" && parsed.error === "state_mismatch", "JSON result block parses and holds the expected fields");
  check(!hdr(r, "x-github-request-id"), "callback not served by Pages");
  check(hdr(r, "cache-control") === "no-store", "callback cache-control is no-store");
}

// Opener page.
{
  const { r, body } = await get("/api/auth/__sp3");
  const csp = hdr(r, "content-security-policy");
  const n = (csp.match(/'nonce-([^']+)'/) ?? [])[1] ?? "";
  console.log(`-- opener status=${r.status} content-type=${hdr(r, "content-type")} cache-control=${hdr(r, "cache-control")}`);
  const same = n !== "" && dropFn(norm(body, n)) === dropFn(norm(renderOpenerPage(n), n));
  check(r.status === 200, "opener page is 200 (spike Worker routed)");
  check(csp === openerCsp(n), "opener CSP unchanged by the zone");
  check(same, "opener body byte-identical to the local render (nonce normalised, checkMessage body excluded)");
  if (!same) console.log(`      ${firstDiff(dropFn(norm(body, n)), dropFn(norm(renderOpenerPage(n), n)))}`);
  check(!/cdn-cgi|email-protection|data-cfemail|rocket-loader|rocketloader|data-cf-/i.test(body), "no Cloudflare rewriting markers in the opener body");
}

// Pages still serves everything else; refresh stays 404.
{
  const { r } = await get("/");
  check(!!hdr(r, "x-github-request-id"), "/ still served by Pages");
  const rf = await get("/api/auth/refresh");
  check(rf.r.status === 404, "/api/auth/refresh is 404");
}
console.log(`== done: ${fails} failure(s) ==`);
process.exit(fails ? 1 : 0);
