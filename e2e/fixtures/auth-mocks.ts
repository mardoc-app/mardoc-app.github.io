/**
 * Shared Playwright mocks for GitHub sign-in (NF-19): the Auth Worker's
 * `/api/auth/*` routes and the GitHub API calls sign-in makes. WP-5, WP-6 and
 * WP-8 use them. Everything here is simulated; it proves the tab's logic, not
 * the real Worker or GitHub (SP-3 and T-32 cover those).
 *
 * Routes are installed on the browser context, not the page, so the sign-in
 * pop-up (a new page) is intercepted too. A spec's own `page.route` handlers
 * take precedence over these.
 *
 * The mocked `/api/auth/login` returns a small page that does what the real
 * callback page does: it posts a sign-in result to `window.opener` with the
 * app's origin as the target, then closes. The posted result is chosen per
 * attempt by `options.login` (default: a successful result).
 *
 * Usage:
 *   const auth = await mockAuth(context, { user: { login: "octo" } });
 *   auth.set({ health: 503 });        // change behaviour mid-test
 *   auth.requests.revoke              // what the tab sent
 */
import type { BrowserContext, Route } from "@playwright/test";

export const MOCK_SIGN_IN_TOKEN = "ghu_mock_sign_in_token_0123456789";
export const MOCK_EXPIRES_IN = 28800;

/** What `/api/auth/health` does. */
export type HealthMock =
  | "ok"
  /** A GitHub Pages 404: HTML with `x-github-request-id`, as when the Worker is unrouted. */
  | 404
  | 503
  /** The request fails at the network level. */
  | "network"
  /** No answer at all: the tab's 5 s timeout must fire. */
  | "hang";

/** What the mocked login page posts to `window.opener`. */
export type LoginMock =
  | { ok: true; token?: string; expiresIn?: number; nonce?: string | null }
  | { ok: false; error: string; nonce?: string | null }
  /** The page closes without posting anything. */
  | { close: true }
  /** The page stays open and posts nothing (for the timeout and focus cases). */
  | { stay: true }
  /** A raw message, posted as is (malformed results). */
  | { raw: unknown };

export type GitHubUserMock = { login: string } | { status: number };

export type InstallationMock = {
  id: number;
  account: string;
  repositories: string[];
};

export type AuthMockOptions = {
  health?: HealthMock;
  /** A fixed result, or one computed from the attempt nonce the tab sent. */
  login?: LoginMock | ((nonce: string) => LoginMock);
  /** `GET https://api.github.com/user`. Default `{ login: "octo" }`. */
  user?: GitHubUserMock;
  /** `GET /user/installations` and `/user/installations/:id/repositories`. Default none. */
  installations?: InstallationMock[];
  /** `POST /api/auth/revoke` status. Default 204. */
  revokeStatus?: number;
};

export type RecordedRevoke = { origin: string | null; contentType: string | null; body: unknown };
export type RecordedGitHub = { path: string; authorization: string | null };

export type AuthMocks = {
  /** Merge new options into the current ones. */
  set(options: AuthMockOptions): void;
  requests: {
    health: number;
    /** The `n` query value of each `/api/auth/login` request. */
    login: string[];
    revoke: RecordedRevoke[];
    /** GitHub requests handled by these mocks (`/user`, installations). */
    github: RecordedGitHub[];
  };
};

const JSON_ESCAPES: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" };

/** The page served at `/api/auth/login`, standing in for GitHub and the callback page. */
export function loginPage(nonce: string, result: LoginMock): string {
  if ("stay" in result) return "<!doctype html><title>Sign in</title><p>Waiting.</p>";
  if ("close" in result) return "<!doctype html><title>Sign in</title><script>window.close()</script>";
  let message: unknown;
  if ("raw" in result) message = result.raw;
  else if (result.ok) {
    message = {
      type: "mardoc-sign-in-result",
      v: 1,
      nonce: result.nonce === undefined ? nonce : result.nonce,
      ok: true,
      token: result.token ?? MOCK_SIGN_IN_TOKEN,
      expiresIn: result.expiresIn ?? MOCK_EXPIRES_IN,
    };
  } else {
    message = {
      type: "mardoc-sign-in-result",
      v: 1,
      nonce: result.nonce === undefined ? nonce : result.nonce,
      ok: false,
      error: result.error,
    };
  }
  const json = JSON.stringify(message).replace(/[<>&]/g, (c) => JSON_ESCAPES[c]);
  return `<!doctype html><title>Sign in</title>
<script type="application/json" id="result">${json}</script>
<script>
  var result = JSON.parse(document.getElementById("result").textContent);
  if (window.opener) window.opener.postMessage(result, location.origin);
  window.close();
</script>`;
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
}

export async function mockAuth(context: BrowserContext, initial: AuthMockOptions = {}): Promise<AuthMocks> {
  let options: AuthMockOptions = { ...initial };
  const requests: AuthMocks["requests"] = { health: 0, login: [], revoke: [], github: [] };

  await context.route("**/api/auth/health", async (route) => {
    requests.health++;
    const health = options.health ?? "ok";
    if (health === "ok") return json(route, 200, { ok: true, version: "mock" });
    if (health === 404) {
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        headers: { "x-github-request-id": "MOCK:0000" },
        body: "<!DOCTYPE html><title>Page not found · GitHub Pages</title>",
      });
    }
    if (health === 503) return route.fulfill({ status: 503, contentType: "text/html", body: "Service Unavailable" });
    if (health === "network") return route.abort("failed");
    // "hang": never answer; the tab's timeout ends it.
  });

  await context.route("**/api/auth/login?**", async (route) => {
    const nonce = new URL(route.request().url()).searchParams.get("n") ?? "";
    requests.login.push(nonce);
    const chosen = options.login ?? { ok: true };
    const result = typeof chosen === "function" ? chosen(nonce) : chosen;
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "cache-control": "no-store" },
      body: loginPage(nonce, result),
    });
  });

  await context.route("**/api/auth/revoke", async (route) => {
    const request = route.request();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    const headers = await request.allHeaders();
    requests.revoke.push({ origin: headers["origin"] ?? null, contentType: headers["content-type"] ?? null, body });
    await route.fulfill({ status: options.revokeStatus ?? 204, body: "" });
  });

  await context.route(/^https:\/\/api\.github\.com\/user(\/installations.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = (await request.allHeaders())["authorization"] ?? null;
    requests.github.push({ path: url.pathname, authorization });
    if (url.pathname === "/user") {
      const user = options.user ?? { login: "octo" };
      if ("status" in user) return json(route, user.status, { message: "Bad credentials" });
      return json(route, 200, { login: user.login, id: 1, type: "User" });
    }
    const installs = options.installations ?? [];
    if (url.pathname === "/user/installations") {
      return json(route, 200, {
        total_count: installs.length,
        installations: installs.map((i) => ({ id: i.id, account: { login: i.account }, app_slug: "mardoc" })),
      });
    }
    const m = url.pathname.match(/^\/user\/installations\/(\d+)\/repositories$/);
    const install = m ? installs.find((i) => i.id === Number(m[1])) : undefined;
    if (!install) return json(route, 404, { message: "Not Found" });
    return json(route, 200, {
      total_count: install.repositories.length,
      repositories: install.repositories.map((full_name, n) => ({
        id: install.id * 1000 + n,
        name: full_name.split("/")[1],
        full_name,
        owner: { login: full_name.split("/")[0] },
        private: false,
        default_branch: "main",
      })),
    });
  });

  return {
    set(next) {
      options = { ...options, ...next };
    },
    requests,
  };
}
