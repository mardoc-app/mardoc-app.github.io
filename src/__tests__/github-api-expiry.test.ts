// T-14 (client part), F-34, F-40: the GitHub client refuses an expired
// sign-in token before sending, reports a sign-in 401 once per credential, and
// lists installation repositories for a sign-in token. Real Octokit; the only
// fake is `globalThis.fetch` (a spy recording every request) and the clock.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initOctokit,
  resetGitHubSession,
  expireGitHubSession,
  setOnAuthError,
  fetchDefaultBranch,
  fetchUserRepos,
  fetchLoginForToken,
  getOctokit,
} from "@/lib/github-api";
import { formatApiError } from "@/lib/rate-limit";

const EXPIRES_AT = Date.UTC(2026, 9, 27, 19, 59, 0);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;
const urls = () => fetchSpy.mock.calls.map((c) => String(c[0] instanceof Request ? c[0].url : c[0]));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  fetchSpy = vi.fn(async () => json({ default_branch: "main" }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  setOnAuthError(null);
  resetGitHubSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GitHub client expiry (I-15, NF-12)", () => {
  it("t14_client_expired_token_not_sent", async () => {
    initOctokit("ghu_signin", { kind: "sign-in", expiresAt: EXPIRES_AT });

    vi.setSystemTime(EXPIRES_AT - 1);
    await expect(fetchDefaultBranch("acme/docs")).resolves.toBe("main");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockClear();
    vi.setSystemTime(EXPIRES_AT);
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    vi.setSystemTime(EXPIRES_AT + 3_600_000);
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("t14_client_ended_session_refuses_every_request", async () => {
    vi.setSystemTime(EXPIRES_AT - 3_600_000);
    initOctokit("ghu_signin", { kind: "sign-in", expiresAt: EXPIRES_AT });
    expireGitHubSession();
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    // A new credential is usable again.
    initOctokit("ghu_next", { kind: "sign-in", expiresAt: EXPIRES_AT });
    await expect(fetchDefaultBranch("acme/docs")).resolves.toBe("main");
  });

  it("t14_client_sign_in_token_without_expiry_is_never_sent", async () => {
    initOctokit("ghu_signin", { kind: "sign-in" });
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("f34_auth_error_pat_never_expires_and_keeps_todays_text", async () => {
    const onAuthError = vi.fn();
    setOnAuthError(onAuthError);
    initOctokit("ghp_pat");
    vi.setSystemTime(Date.UTC(2099, 0, 1));
    await expect(fetchDefaultBranch("acme/docs")).resolves.toBe("main");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockImplementation(async () => json({ message: "Bad credentials" }, 401));
    const err = await fetchDefaultBranch("acme/docs").catch((e) => e);
    expect(err.status).toBe(401);
    expect(onAuthError).not.toHaveBeenCalled();
    expect(formatApiError(err, "Failed to load file")).toBe(
      "Failed to load file: your GitHub token is invalid or expired. Open Settings to re-authenticate."
    );
  });
});

describe("GitHub client 401 on a sign-in token (F-34)", () => {
  it("f34_auth_error_called_once_per_credential", async () => {
    const onAuthError = vi.fn();
    setOnAuthError(onAuthError);
    vi.setSystemTime(EXPIRES_AT - 3_600_000);
    fetchSpy.mockImplementation(async () => json({ message: "Bad credentials" }, 401));

    initOctokit("ghu_one", { kind: "sign-in", expiresAt: EXPIRES_AT });
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledTimes(2); // a 401 is not retried
    expect(onAuthError).toHaveBeenCalledTimes(1);

    // The refused-before-sending path is the same credential: still once.
    vi.setSystemTime(EXPIRES_AT);
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    expect(onAuthError).toHaveBeenCalledTimes(1);

    // A new credential reports again, once.
    vi.setSystemTime(EXPIRES_AT - 3_600_000);
    initOctokit("ghu_two", { kind: "sign-in", expiresAt: EXPIRES_AT });
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });
    expect(onAuthError).toHaveBeenCalledTimes(2);
  });

  it("f34_auth_error_message_says_sign_in_again", async () => {
    vi.setSystemTime(EXPIRES_AT);
    initOctokit("ghu_signin", { kind: "sign-in", expiresAt: EXPIRES_AT });
    const err = await fetchDefaultBranch("acme/docs").catch((e) => e);
    const text = formatApiError(err, "Failed to load file");
    expect(text).toBe("Failed to load file: your GitHub sign-in has ended. Sign in again.");
    expect(text).not.toContain("Open Settings to re-authenticate");
  });

  it("t14_client_expired_refusal_reports_auth_error_once", async () => {
    const onAuthError = vi.fn();
    setOnAuthError(onAuthError);
    vi.setSystemTime(EXPIRES_AT);
    initOctokit("ghu_signin", { kind: "sign-in", expiresAt: EXPIRES_AT });
    await fetchDefaultBranch("acme/docs").catch(() => {});
    await fetchDefaultBranch("acme/docs").catch(() => {});
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });
});

describe("Repository list for a sign-in token (F-40, A-16)", () => {
  it("f40_sign_in_lists_installation_repos", async () => {
    vi.setSystemTime(EXPIRES_AT - 3_600_000);
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === "/user/installations") {
        return json({ total_count: 2, installations: [{ id: 11 }, { id: 22 }] });
      }
      if (url.pathname === "/user/installations/11/repositories") {
        return json({
          total_count: 2,
          repositories: [
            { full_name: "acme/zeta", description: null, private: true },
            { full_name: "acme/Alpha", description: "docs", private: false },
          ],
        });
      }
      if (url.pathname === "/user/installations/22/repositories") {
        return json({ total_count: 1, repositories: [{ full_name: "me/notes", description: "n", private: true }] });
      }
      return json({ message: "Not Found" }, 404);
    });
    initOctokit("ghu_signin", { kind: "sign-in", expiresAt: EXPIRES_AT });
    const repos = await fetchUserRepos();
    expect(repos).toEqual([
      { fullName: "acme/Alpha", description: "docs", isPrivate: false },
      { fullName: "acme/zeta", description: "", isPrivate: true },
      { fullName: "me/notes", description: "n", isPrivate: true },
    ]);
    const paths = urls().map((u) => new URL(u).pathname);
    expect(paths).toEqual([
      "/user/installations",
      "/user/installations/11/repositories",
      "/user/installations/22/repositories",
    ]);
    expect(paths).not.toContain("/user/repos");
  });

  it("f40_pat_lists_user_repos_as_today", async () => {
    fetchSpy.mockImplementation(async () => json([{ full_name: "acme/docs", description: null, private: false }]));
    initOctokit("ghp_pat");
    const repos = await fetchUserRepos();
    expect(repos).toEqual([{ fullName: "acme/docs", description: "", isPrivate: false }]);
    expect(new URL(urls()[0]).pathname).toBe("/user/repos");
  });
});

describe("Pending token login check", () => {
  it("f35_login_check_uses_pending_token_and_leaves_active_client", async () => {
    vi.setSystemTime(EXPIRES_AT - 3_600_000);
    initOctokit("ghp_pat");
    const active = getOctokit();
    fetchSpy.mockImplementation(async () => json({ login: "alice" }));
    await expect(fetchLoginForToken("ghu_pending")).resolves.toBe("alice");
    const call = fetchSpy.mock.calls[0];
    const headers = new Headers((call[1] as RequestInit | undefined)?.headers);
    expect(headers.get("authorization")).toBe("token ghu_pending");
    expect(new URL(urls()[0]).pathname).toBe("/user");
    expect(getOctokit()).toBe(active);
  });
});
