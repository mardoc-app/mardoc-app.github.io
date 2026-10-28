import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import {
  APP,
  ENV,
  NAV,
  NONCE,
  SECRET,
  assertCommonHeaders,
  call,
  ghJson,
  startLogin,
  stubGitHub,
} from "./helpers";

const s256 = (v: string) => createHash("sha256").update(v, "ascii").digest("base64url");
const n = (c: string) => c.repeat(22);
const oldCookie = (nonce: string) => `__Secure-mardoc_auth_${nonce}=${nonce}.${"s".repeat(43)}.${"v".repeat(43)}`;

describe("health and unknown routes (T-21, T-22, T-23)", () => {
  it("t23_health_is_200_with_ok_true (F-27)", async () => {
    const r = await call("/api/auth/health");
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(r.body)).toEqual({ ok: true, version: "dev" });
    const v = await call("/api/auth/health", {}, { ...ENV, VERSION: "abc123" });
    expect(JSON.parse(v.body)).toEqual({ ok: true, version: "abc123" });
  });

  it("t21_no_refresh_route_get_and_post_are_404 (F-25, C-16)", async () => {
    const calls = stubGitHub(ghJson({}));
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const r = await call("/api/auth/refresh", { method, headers: { origin: APP } });
      expect(r.status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it("t22_unknown_paths_and_methods_are_404", async () => {
    for (const [method, path] of [
      ["GET", "/"],
      ["GET", "/api/auth"],
      ["GET", "/api/auth/"],
      ["GET", "/api/auth/health/"],
      ["GET", "/api/auth/token"],
      ["GET", "/api/auth/refresh_token"],
      ["POST", "/api/auth/health"],
      ["POST", "/api/auth/login"],
      ["POST", "/api/auth/callback"],
      ["GET", "/api/auth/revoke"],
      ["OPTIONS", "/api/auth/revoke"],
    ]) {
      const r = await call(path, { method });
      expect(r.status, `${method} ${path}`).toBe(404);
    }
  });

  it("t22_a_thrown_error_still_gets_the_common_headers", async () => {
    // A request whose body read throws mid-revoke.
    const body = new ReadableStream({
      pull() {
        throw new Error("boom");
      },
    });
    const res = await worker.fetch(
      new Request(`${APP}/api/auth/revoke`, {
        method: "POST",
        headers: { origin: APP, "content-type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit),
      ENV,
    );
    assertCommonHeaders(res);
    expect(res.status).toBe(500);
  });

  it("t22_missing_app_origin_fails_closed", async () => {
    for (const APP_ORIGIN of ["", "*", "https://mardoc.app/", "mardoc.app"]) {
      const r = await call(`/api/auth/login?n=${NONCE}`, { headers: NAV }, { ...ENV, APP_ORIGIN });
      expect(r.status).toBe(500);
    }
  });

  it("t22_no_env_at_all_is_safe", async () => {
    const res = await worker.fetch(new Request(`${APP}/api/auth/callback?code=c&state=${NONCE}.x`));
    assertCommonHeaders(res);
    expect(res.status).toBe(500);
  });
});

describe("login (T-20, T-22)", () => {
  it("t20_login_bad_n_is_400 (F-20)", async () => {
    for (const q of ["", "?n=", "?n=short", `?n=${"a".repeat(65)}`, `?n=${NONCE.slice(1)}.`, `?n=${NONCE.slice(1)}%3C`]) {
      const r = await call(`/api/auth/login${q}`, { headers: NAV });
      expect(r.status, q).toBe(400);
      expect(r.res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(r.cookies).toEqual([]);
      expect(r.res.headers.get("location")).toBeNull();
    }
  });

  it("t22_login_refuses_missing_or_cross_site_sec_fetch (F-28)", async () => {
    for (const headers of <Array<Record<string, string>>>[
      {},
      { "sec-fetch-site": "same-origin" },
      { "sec-fetch-dest": "document" },
      { "sec-fetch-site": "cross-site", "sec-fetch-dest": "document" },
      { "sec-fetch-site": "same-site", "sec-fetch-dest": "document" },
      { "sec-fetch-site": "none", "sec-fetch-dest": "document" },
      { "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty" },
      { "sec-fetch-site": "same-origin", "sec-fetch-dest": "iframe" },
    ]) {
      const r = await call(`/api/auth/login?n=${NONCE}`, { headers });
      expect(r.status, JSON.stringify(headers)).toBe(403);
      expect(r.cookies).toEqual([]);
    }
  });

  it("t20_login_redirects_to_authorize_with_s256 (F-20, F-21)", async () => {
    const { location, state, cookie, cookies, res } = await startLogin();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("Iv1.testclient");
    expect(location.searchParams.get("redirect_uri")).toBe("https://mardoc.app/api/auth/callback");
    expect(state).toMatch(new RegExp(`^${NONCE}\\.[A-Za-z0-9_-]{43}$`));
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      new RegExp(
        `^__Secure-mardoc_auth_${NONCE}=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600$`,
      ),
    );
    expect(cookie.split("=")[1].startsWith(`${state}.`)).toBe(true);
  });

  it("t22_login_prunes_all_but_the_newest_two_older_attempts (F-28)", async () => {
    const header = [oldCookie(n("A")), "other=1", oldCookie(n("B")), oldCookie(n("C"))].join("; ");
    const { cookies } = await startLogin(NONCE, header);
    const cleared = cookies.filter((c) => c.endsWith("Max-Age=0"));
    expect(cleared).toEqual([
      `__Secure-mardoc_auth_${n("A")}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0`,
    ]);
    const kept = cookies.filter((c) => c.endsWith("Max-Age=600"));
    expect(kept).toHaveLength(1);
    // The browser then holds B, C and the new attempt: at most three.
  });

  it("t22_login_with_two_or_fewer_older_attempts_clears_nothing", async () => {
    const { cookies } = await startLogin(NONCE, [oldCookie(n("A")), oldCookie(n("B"))].join("; "));
    expect(cookies.filter((c) => c.endsWith("Max-Age=0"))).toEqual([]);
  });

  it("t20_login_each_attempt_gets_fresh_state_and_verifier", async () => {
    const a = await startLogin();
    const b = await startLogin();
    expect(a.state).not.toBe(b.state);
    expect(a.cookie).not.toBe(b.cookie);
  });
});

describe("callback over HTTP (T-20, T-21, T-22)", () => {
  it("t20_callback_full_flow_exchanges_with_secret_and_verifier (F-20, F-21)", async () => {
    const { state, cookie, location } = await startLogin();
    const calls = stubGitHub(ghJson({ access_token: "ghu_abc", expires_in: 28800, token_type: "bearer" }));
    const r = await call(`/api/auth/callback?code=thecode&state=${state}`, { headers: { cookie } });
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(1);
    const ex = calls[0];
    expect(ex.url).toBe("https://github.com/login/oauth/access_token");
    expect(ex.method).toBe("POST");
    expect(ex.headers.accept).toBe("application/json");
    expect(ex.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = Object.fromEntries(new URLSearchParams(ex.body));
    expect(Object.keys(form).sort()).toEqual(["client_id", "client_secret", "code", "code_verifier", "redirect_uri"]);
    expect(form.client_id).toBe("Iv1.testclient");
    expect(form.client_secret).toBe(SECRET);
    expect(form.code).toBe("thecode");
    expect(form.redirect_uri).toBe("https://mardoc.app/api/auth/callback");
    // F-21: the challenge sent at login is the S256 of the verifier sent at exchange.
    expect(s256(form.code_verifier)).toBe(location.searchParams.get("code_challenge"));
    expect(r.body).not.toContain(SECRET);
    expect(r.body).not.toContain(form.code_verifier);
    expect(r.body).not.toContain("thecode");
  });

  it("t20_callback_state_mismatch_over_http_makes_zero_calls (F-20, I-12)", async () => {
    const { cookie } = await startLogin();
    const calls = stubGitHub(ghJson({ access_token: "ghu_abc", expires_in: 28800 }));
    const r = await call(`/api/auth/callback?code=c&state=${NONCE}.${"x".repeat(43)}`, { headers: { cookie } });
    expect(r.status).toBe(200);
    expect(r.body).toContain('"error":"state_mismatch"');
    const none = await call(`/api/auth/callback?code=c&state=${NONCE}.${"x".repeat(43)}`);
    expect(none.body).toContain('"error":"state_mismatch"');
    expect(calls).toHaveLength(0);
  });

  it("t20_callback_install_return_page_no_script_no_exchange (F-29)", async () => {
    const calls = stubGitHub(ghJson({}));
    const r = await call("/api/auth/callback?installation_id=1&setup_action=install");
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.body).toContain("MarDoc is installed. Go back to the MarDoc tab and press Refresh.");
    expect(r.body).not.toContain("<script");
    expect(r.res.headers.get("content-security-policy")).not.toContain("script-src");
    expect(r.cookies).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("t20_callback_github_500_or_network_error_is_exchange_failed", async () => {
    for (const reply of [new Response("oops", { status: 500 }), new Error("network"), new Response("not json")]) {
      const { state, cookie } = await startLogin();
      stubGitHub(reply);
      const r = await call(`/api/auth/callback?code=c&state=${state}`, { headers: { cookie } });
      expect(r.status).toBe(200);
      expect(r.body).toContain('"error":"exchange_failed"');
    }
  });

  it("t20_callback_github_json_error_is_that_code", async () => {
    const { state, cookie } = await startLogin();
    stubGitHub(ghJson({ error: "bad_verification_code", error_description: "The code passed is incorrect" }));
    const r = await call(`/api/auth/callback?code=c&state=${state}`, { headers: { cookie } });
    expect(r.body).toContain('"error":"bad_verification_code"');
    expect(r.body).not.toContain("incorrect");
  });

  it("t20_callback_no_expires_in_is_non_expiring_token", async () => {
    const { state, cookie } = await startLogin();
    stubGitHub(ghJson({ access_token: "ghu_forever", token_type: "bearer" }));
    const r = await call(`/api/auth/callback?code=c&state=${state}`, { headers: { cookie } });
    expect(r.body).toContain('"error":"non_expiring_token"');
    expect(r.body).not.toContain("ghu_forever");
  });

  it("t22_callback_clears_the_attempt_cookie (F-28)", async () => {
    const { state, cookie } = await startLogin();
    stubGitHub(ghJson({ access_token: "ghu_abc", expires_in: 28800 }));
    for (const query of [`code=c&state=${state}`, `error=access_denied&state=${state}`, `state=${NONCE}.${"x".repeat(43)}`]) {
      const r = await call(`/api/auth/callback?${query}`, { headers: { cookie } });
      expect(r.cookies).toEqual([
        `__Secure-mardoc_auth_${NONCE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0`,
      ]);
    }
    const nullNonce = await call("/api/auth/callback?code=c");
    expect(nullNonce.cookies).toEqual([]);
  });

  it("t21_callback_never_redirects_or_puts_the_token_in_a_url_or_cookie (F-23, I-10)", async () => {
    const { state, cookie } = await startLogin();
    stubGitHub(ghJson({ access_token: "ghu_abc", expires_in: 28800 }));
    const r = await call(`/api/auth/callback?code=c&state=${state}`, { headers: { cookie } });
    expect(r.res.headers.get("location")).toBeNull();
    const headerText = [...r.res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    expect(headerText).not.toContain("ghu_abc");
    expect(r.body).toContain("ghu_abc");
  });
});

describe("revoke (T-23)", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    call("/api/auth/revoke", {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json", ...headers },
      body,
    });

  it("t23_revoke_missing_or_foreign_origin_is_403 (F-61)", async () => {
    const calls = stubGitHub(new Response(null, { status: 204 }));
    for (const origin of [undefined, "https://evil.example", "null", "https://mardoc.app.evil.example", "http://mardoc.app"]) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (origin !== undefined) headers.origin = origin;
      const r = await call("/api/auth/revoke", { method: "POST", headers, body: '{"token":"ghu_abc"}' });
      expect(r.status, String(origin)).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });

  it("t23_revoke_bad_body_is_400", async () => {
    const calls = stubGitHub(new Response(null, { status: 204 }));
    for (const [body, headers] of [
      ["", {}],
      ["not json", {}],
      ["[]", {}],
      ["null", {}],
      ['{"token":""}', {}],
      ['{"token":42}', {}],
      ['{"tok":"ghu_abc"}', {}],
      ['{"token":"ghu abc"}', {}],
      [`{"token":"${"a".repeat(256)}"}`, {}],
      [`{"token":"ghu_abc","pad":"${"x".repeat(5000)}"}`, {}],
      ['{"token":"ghu_abc"}', { "content-type": "text/plain" }],
      ['{"token":"ghu_abc"}', { "content-type": "application/x-www-form-urlencoded" }],
    ] as Array<[string, Record<string, string>]>) {
      const r = await post(body, headers);
      expect(r.status, body.slice(0, 40)).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("t23_revoke_calls_github_with_basic_auth (F-61)", async () => {
    const calls = stubGitHub(new Response(null, { status: 204 }));
    const r = await post('{"token":"ghu_abc"}', { "content-type": "application/json; charset=utf-8" });
    expect(r.status).toBe(204);
    expect(r.body).toBe("");
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.method).toBe("DELETE");
    expect(c.url).toBe("https://api.github.com/applications/Iv1.testclient/token");
    expect(c.headers.authorization).toBe(`Basic ${btoa(`Iv1.testclient:${SECRET}`)}`);
    expect(c.headers.accept).toBe("application/vnd.github+json");
    expect(c.headers["user-agent"]).toBeTruthy();
    expect(JSON.parse(c.body)).toEqual({ access_token: "ghu_abc" });
  });

  it("t23_revoke_github_404_is_204", async () => {
    stubGitHub(new Response('{"message":"Not Found"}', { status: 404 }));
    const r = await post('{"token":"ghu_abc"}');
    expect(r.status).toBe(204);
  });

  it("t23_revoke_github_500_or_network_error_is_502_revoke_failed", async () => {
    for (const reply of [new Response("x", { status: 500 }), new Response("x", { status: 422 }), new Error("net")]) {
      stubGitHub(reply);
      const r = await post('{"token":"ghu_abc"}');
      expect(r.status).toBe(502);
      expect(JSON.parse(r.body)).toEqual({ error: "revoke_failed" });
      expect(r.body).not.toContain("ghu_abc");
    }
  });
});
