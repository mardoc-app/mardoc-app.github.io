import { describe, expect, it } from "vitest";
import { escapedJson, renderCallbackPage } from "../src/domain/page";
import { parseSignInResult } from "../../src/lib/auth/contract";
import {
  APP,
  NONCE,
  call,
  ghJson,
  pageScript,
  resultText,
  runPageScript,
  startLogin,
  stubGitHub,
} from "./helpers";

const CSP = /^default-src 'none'; script-src 'nonce-([A-Za-z0-9_-]{22})'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/;

async function signedInPage(github: unknown = { access_token: "ghu_abc", expires_in: 28800 }) {
  const { state, cookie } = await startLogin();
  stubGitHub(ghJson(github));
  return call(`/api/auth/callback?code=c&state=${state}`, { headers: { cookie } });
}

// Hostile inputs for property-style checks (I-17).
const HOSTILE = [
  "<script>alert(1)</script>",
  "</script><script>alert(1)</script>",
  '"><img src=x onerror=alert(1)>',
  "&lt;&amp;&#x3c;",
  "<!--",
  "]]>",
  "\u2028\u2029",
  "'; alert(1); '",
  "${alert(1)}",
  "\\u003c",
];
function randomHostile(seed: number): string {
  const alphabet = "<>&\"'/\\`=;:()[]{} \n\tazAZ09_-.\u2028%";
  let s = "";
  let x = seed * 2654435761;
  for (let i = 0; i < 24; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    s += alphabet[x % alphabet.length];
  }
  return s;
}
const ALL_HOSTILE = [...HOSTILE, ...Array.from({ length: 200 }, (_, i) => randomHostile(i + 1))];

describe("callback page (T-21)", () => {
  it("t21_page_csp_exactly_as_designed_with_fresh_16_byte_nonce (F-23)", async () => {
    const a = await signedInPage();
    const b = await signedInPage();
    const ma = CSP.exec(a.res.headers.get("content-security-policy") ?? "");
    const mb = CSP.exec(b.res.headers.get("content-security-policy") ?? "");
    expect(ma).not.toBeNull();
    expect(mb).not.toBeNull();
    expect(ma![1]).not.toBe(mb![1]);
    expect(pageScript(a.body).nonce).toBe(ma![1]);
    expect(a.res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    // Exactly one executable script, and it carries the nonce.
    expect(a.body.match(/<script\b/g)).toHaveLength(2);
    expect(a.body.match(/<script nonce=/g)).toHaveLength(1);
  });

  it("t21_page_error_results_also_carry_the_csp", async () => {
    const r = await call("/api/auth/callback?code=c");
    expect(CSP.test(r.res.headers.get("content-security-policy") ?? "")).toBe(true);
  });

  it("t21_page_posts_result_to_app_origin_then_closes (F-23)", async () => {
    const r = await signedInPage();
    const run = runPageScript(r.body, true);
    expect(run.posted).toEqual([
      [{ type: "mardoc-sign-in-result", v: 1, nonce: NONCE, ok: true, token: "ghu_abc", expiresIn: 28800 }, APP],
    ]);
    expect(run.closed).toBe(true);
    expect(parseSignInResult(run.posted[0][0])).not.toBeNull();
  });

  it("t21_page_post_message_never_targets_star (F-23)", async () => {
    for (const r of [await signedInPage(), await call("/api/auth/callback?code=c")]) {
      const { source } = pageScript(r.body);
      expect(source).toContain('postMessage(r,"https://mardoc.app")');
      expect(source).not.toContain('"*"');
      expect(source).not.toContain("'*'");
      expect(source.match(/postMessage\(/g)).toHaveLength(1);
    }
  });

  it("t21_page_without_opener_shows_return_to_mardoc", async () => {
    const r = await call("/api/auth/callback?code=c");
    const run = runPageScript(r.body, false);
    expect(run.posted).toEqual([]);
    expect(run.closed).toBe(false);
    expect(run.msg).toBe("Return to MarDoc and try again.");
  });

  it("t21_page_hostile_error_never_appears_unescaped (I-17)", async () => {
    stubGitHub(ghJson({}));
    for (const hostile of ALL_HOSTILE) {
      const { state, cookie } = await startLogin();
      const r = await call(`/api/auth/callback?error=${encodeURIComponent(hostile)}&state=${state}`, {
        headers: { cookie },
      });
      const json = resultText(r.body);
      expect(json).not.toMatch(/[<>&]/);
      expect(JSON.parse(json).error).toBe("exchange_failed");
      if (hostile.length > 3) expect(r.body).not.toContain(hostile);
    }
  });

  it("t21_page_hostile_state_never_appears_unescaped (I-17)", async () => {
    for (const hostile of ALL_HOSTILE) {
      for (const state of [hostile, `${NONCE}.${hostile}`, `${hostile}.${NONCE}`]) {
        const r = await call(
          `/api/auth/callback?code=${encodeURIComponent(hostile)}&state=${encodeURIComponent(state)}`,
        );
        const json = resultText(r.body);
        expect(json).not.toMatch(/[<>&]/);
        const parsed = JSON.parse(json);
        expect(parsed.error).toBe("state_mismatch");
        expect(parsed.nonce === null || parsed.nonce === NONCE).toBe(true);
        if (hostile.length > 3) expect(r.body).not.toContain(hostile);
        expect(r.res.headers.get("set-cookie") ?? "").not.toContain(hostile);
      }
    }
  });

  it("t21_page_hostile_github_error_never_appears (I-17)", async () => {
    for (const hostile of HOSTILE) {
      const r = await signedInPage({ error: hostile, error_description: hostile, error_uri: hostile });
      expect(JSON.parse(resultText(r.body)).error).toBe("exchange_failed");
      expect(r.body).not.toContain(hostile);
    }
  });

  it("t21_page_escaping_covers_lt_gt_amp_in_any_value (I-17)", () => {
    expect(escapedJson({ a: "</script>&" })).toBe('{"a":"\\u003c/script\\u003e\\u0026"}');
    const page = renderCallbackPage(
      { type: "mardoc-sign-in-result", v: 1, nonce: null, ok: false, error: "</script><b>&" },
      "https://mardoc.app",
      "n".repeat(22),
    );
    expect(resultText(page)).not.toMatch(/[<>&]/);
    expect(JSON.parse(resultText(page)).error).toBe("</script><b>&");
  });

  it("t21_no_refresh_token_in_any_body_header_or_cookie (F-24, I-13)", async () => {
    const { state, cookie, res: loginRes } = await startLogin();
    stubGitHub(
      ghJson({
        access_token: "ghu_abc",
        expires_in: 28800,
        refresh_token: "ghr_refresh_secret",
        refresh_token_expires_in: 15897600,
        token_type: "bearer",
        scope: "",
      }),
    );
    const r = await call(`/api/auth/callback?code=c&state=${state}`, { headers: { cookie } });
    const everything = [
      r.body,
      ...[...r.res.headers.entries()].map(([k, v]) => `${k}: ${v}`),
      ...r.cookies,
      ...[...loginRes.headers.entries()].map(([k, v]) => `${k}: ${v}`),
    ].join("\n");
    expect(everything).not.toContain("ghr_");
    expect(everything).not.toContain("refresh_token");
    expect(everything).not.toContain("15897600");
    expect(JSON.parse(resultText(r.body))).toEqual({
      type: "mardoc-sign-in-result",
      v: 1,
      nonce: NONCE,
      ok: true,
      token: "ghu_abc",
      expiresIn: 28800,
    });
  });
});
