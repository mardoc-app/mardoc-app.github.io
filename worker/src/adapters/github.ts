// The only module that talks to GitHub (LR-11). Two calls: the code
// exchange and token revoke. Neither logs, and the exchange keeps only
// access_token, expires_in and error from GitHub's answer (I-13, I-16).
import type { ExchangeAnswer, ExchangePort } from "../domain/callback";

export const TOKEN_URL = "https://github.com/login/oauth/access_token";
export const API_ORIGIN = "https://api.github.com";
const USER_AGENT = "mardoc-auth";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Defaults to the runtime's global fetch; tests pass a stub. */
  fetchImpl?: FetchLike;
}

export type RevokeOutcome = "revoked" | "failed";

export interface GitHubPort extends ExchangePort {
  revoke(token: string): Promise<RevokeOutcome>;
}

export function createGitHub(config: GitHubConfig): GitHubPort {
  const send: FetchLike = config.fetchImpl ?? ((input, init) => fetch(input, init));

  async function exchange(code: string, verifier: string): Promise<ExchangeAnswer> {
    let res: Response;
    try {
      res = await send(TOKEN_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": USER_AGENT,
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
          code_verifier: verifier,
        }).toString(),
        redirect: "manual",
      });
    } catch {
      return { kind: "failed" };
    }
    if (res.status < 200 || res.status > 299) return { kind: "failed" };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: "failed" };
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return { kind: "failed" };
    const b = body as Record<string, unknown>;
    // Pick the three fields by name; the refresh token and the rest stay here.
    return { kind: "answered", accessToken: b.access_token, expiresIn: b.expires_in, error: b.error };
  }

  async function revoke(token: string): Promise<RevokeOutcome> {
    let res: Response;
    try {
      const basic = btoa(`${config.clientId}:${config.clientSecret}`);
      res = await send(`${API_ORIGIN}/applications/${encodeURIComponent(config.clientId)}/token`, {
        method: "DELETE",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Basic ${basic}`,
          "content-type": "application/json",
          "user-agent": USER_AGENT,
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ access_token: token }),
        redirect: "manual",
      });
    } catch {
      return "failed";
    }
    // 404: the token already expired or was revoked; the goal is met.
    return (res.status >= 200 && res.status <= 299) || res.status === 404 ? "revoked" : "failed";
  }

  return { exchange, revoke };
}
