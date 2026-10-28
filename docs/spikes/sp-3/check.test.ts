// Run: node --test docs/spikes/sp-3/check.test.ts   (Node 22.18+ strips types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMessage, renderOpenerPage, openerCsp } from "./opener.ts";

const popup = {};
const nonce = "A".repeat(22);
const good = { type: "mardoc-sign-in-result", v: 1, nonce, ok: true, token: "t", expiresIn: 28800 };
const exp = { origin: "https://mardoc.app", popup, nonce };

test("accepts origin + source + nonce", () => {
  assert.deepEqual(checkMessage({ origin: exp.origin, source: popup, data: good }, exp), { ok: true });
});
test("rejects wrong origin", () => {
  assert.deepEqual(checkMessage({ origin: "https://evil.example", source: popup, data: good }, exp), { ok: false, reason: "origin" });
});
test("rejects wrong source", () => {
  assert.deepEqual(checkMessage({ origin: exp.origin, source: {}, data: good }, exp), { ok: false, reason: "source" });
});
test("rejects no popup", () => {
  assert.equal(checkMessage({ origin: exp.origin, source: null, data: good }, { ...exp, popup: null }).ok, false);
});
test("rejects wrong nonce and null nonce", () => {
  assert.deepEqual(checkMessage({ origin: exp.origin, source: popup, data: { ...good, nonce: "B".repeat(22) } }, exp), { ok: false, reason: "nonce" });
  assert.deepEqual(checkMessage({ origin: exp.origin, source: popup, data: { ...good, nonce: null } }, exp), { ok: false, reason: "nonce" });
});
test("rejects bad shapes", () => {
  for (const data of [null, "x", 1, { type: "other", v: 1, nonce }, { ...good, v: 2 }]) {
    assert.equal(checkMessage({ origin: exp.origin, source: popup, data }, exp).ok, false);
  }
});
test("page embeds checkMessage, CSP allows only the GitHub API, token never written to the DOM", () => {
  const html = renderOpenerPage("N0nce");
  assert.ok(html.includes("function checkMessage("));
  assert.ok(html.includes('nonce="N0nce"'));
  assert.ok(openerCsp("N0nce").includes("connect-src https://api.github.com;"));
  // The only textContent write is JSON.stringify(out); out never holds the token.
  assert.ok(!/out\s*=\s*\{[^}]*token:/.test(html));
  assert.ok(!/console\./.test(html));
});
test("embedded script is valid JS and its checkMessage behaves the same", () => {
  const html = renderOpenerPage("N0nce");
  const script = html.split('<script nonce="N0nce">')[1].split("</script>")[0];
  new Function(script); // syntax only; never called
  const fn = script.match(/function checkMessage[\s\S]*?\n\}/)![0];
  const check = new Function(`${fn}; return checkMessage;`)();
  assert.deepEqual(check({ origin: exp.origin, source: popup, data: good }, exp), { ok: true });
  assert.equal(check({ origin: "x", source: popup, data: good }, exp).ok, false);
});
