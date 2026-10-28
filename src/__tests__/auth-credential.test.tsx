// T-10 (unit part), T-13 (state), T-24, F-35, F-36, F-32/F-38 (state), F-61
// and the effect runner's pending-token checks: the credential module and
// AppProvider running on the session model. Real github-api, Octokit and
// sign-in window adapter; the fakes are `globalThis.fetch` and `window.open`,
// which returns an iframe's window standing in for the pop-up. A sign-in
// starts with `startSignIn()` and ends with a message posted from that window.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import { AppProvider, useApp } from "@/lib/app-context";
import * as credential from "@/lib/auth/credential";
import { fetchDefaultBranch, getOctokit, resetGitHubSession } from "@/lib/github-api";
import { SIGN_IN_MARKER_KEY } from "@/lib/auth/contract";

const TOKEN_KEY = "mardoc_github_token";
const PAT = "ghp_saved_personal_token";
const SIGN_IN = "ghu_signin_token_alice";

let state: ReturnType<typeof useApp>;
function Probe() {
  state = useApp();
  return null;
}

let login = "alice";
let fetchSpy: ReturnType<typeof vi.fn>;
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const authHeaders = () =>
  fetchSpy.mock.calls.map((c) => new Headers((c[1] as RequestInit | undefined)?.headers).get("authorization"));

/** Every place web storage or the page could keep a token (F-30). */
function storageDump(): string {
  const parts: string[] = [document.cookie];
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)!;
      parts.push(k, store.getItem(k) ?? "");
    }
  }
  return parts.join("\n");
}

let popupFrame: HTMLIFrameElement;
let openSpy: ReturnType<typeof vi.fn>;
const popup = () => popupFrame.contentWindow!;

function postResult(data: unknown, source: Window | null = popup()) {
  window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source }));
}

/** Starts an attempt as the Sign in button does and returns its nonce. */
async function startAttempt(): Promise<string> {
  openSpy.mockClear();
  await act(async () => state.startSignIn());
  expect(openSpy).toHaveBeenCalledTimes(1);
  return new URL(openSpy.mock.calls[0][0] as string, window.location.origin).searchParams.get("n")!;
}

async function signIn(token: string, as: string) {
  login = as;
  const nonce = await startAttempt();
  await act(async () => postResult({ type: "mardoc-sign-in-result", v: 1, nonce, ok: true, token, expiresIn: 28800 }));
  return nonce;
}

async function mount() {
  render(<React.StrictMode><AppProvider><Probe /></AppProvider></React.StrictMode>);
  await waitFor(() => expect(state).toBeDefined());
}

beforeEach(() => {
  popupFrame = document.createElement("iframe");
  document.body.appendChild(popupFrame);
  openSpy = vi.fn(() => popup());
  vi.spyOn(window, "open").mockImplementation(openSpy as unknown as typeof window.open);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  credential.__resetCredentialForTests();
  resetGitHubSession();
  login = "alice";
  fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input), window.location.origin);
    if (url.pathname === "/api/auth/health") return json({ ok: true });
    if (url.pathname === "/api/auth/revoke") return new Response(null, { status: 204 });
    if (url.pathname === "/user") return json({ login });
    return json({ default_branch: "main" });
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  popupFrame.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("credential module", () => {
  it("t10_sign_in_credential_not_in_storage", () => {
    credential.applySignInCredential(SIGN_IN, "alice", Date.now() + 3_600_000);
    expect(credential.getToken()).toBe(SIGN_IN);
    expect(credential.getCredentialInfo()).toEqual({ kind: "sign-in", login: "alice", expiresAt: expect.any(Number) });
    expect(JSON.stringify(credential.getCredentialInfo())).not.toContain(SIGN_IN);
    expect(storageDump()).not.toContain(SIGN_IN);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("t13_apply_sign_in_never_touches_saved_pat", () => {
    localStorage.setItem(TOKEN_KEY, PAT);
    credential.applySignInCredential(SIGN_IN, "alice", Date.now() + 3_600_000);
    credential.clearCredential();
    expect(localStorage.getItem(TOKEN_KEY)).toBe(PAT);
  });

  it("t10_pending_slot_is_taken_once", () => {
    credential.setPendingToken(SIGN_IN);
    expect(credential.peekPendingToken()).toBe(SIGN_IN);
    expect(credential.takePendingToken()).toBe(SIGN_IN);
    expect(credential.takePendingToken()).toBeNull();
    credential.setPendingToken(SIGN_IN);
    credential.discardPendingToken();
    expect(credential.hasPendingToken()).toBe(false);
  });

  it("f32_marker_helpers_write_only_the_marker", () => {
    credential.setSignInMarker();
    expect(localStorage.getItem(SIGN_IN_MARKER_KEY)).toBe("github-app");
    expect(credential.hasSignInMarker()).toBe(true);
    credential.removeSignInMarker();
    expect(credential.hasSignInMarker()).toBe(false);
  });
});

describe("AppProvider on the session model", () => {
  it("t10_sign_in_through_app_keeps_token_out_of_storage_and_react", async () => {
    await mount();
    expect(state.hasCredential).toBe(false);
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    expect(state.sessionKey).toBe("sign-in:alice");
    expect(state.hasCredential).toBe(true);
    expect(state.isDemoMode).toBe(false);
    expect(credential.getToken()).toBe(SIGN_IN);
    expect(storageDump()).not.toContain(SIGN_IN);
    expect(localStorage.getItem(SIGN_IN_MARKER_KEY)).toBe("github-app");
    // Nothing the app exposes to React carries the token (I-10).
    expect(JSON.stringify(state.session)).not.toContain(SIGN_IN);
    expect(Object.keys(state)).not.toContain("githubToken");
    // The GitHub client now uses the sign-in token.
    fetchSpy.mockClear();
    await fetchDefaultBranch("acme/docs");
    expect(authHeaders()).toEqual([`token ${SIGN_IN}`]);
  });

  it("t13_saved_pat_kept_unused", async () => {
    localStorage.setItem(TOKEN_KEY, PAT);
    await mount();
    await waitFor(() => expect(state.sessionKey).toBe("pat"));
    expect(state.hasCredential).toBe(true);

    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    expect(localStorage.getItem(TOKEN_KEY)).toBe(PAT);
    fetchSpy.mockClear();
    await fetchDefaultBranch("acme/docs");
    expect(authHeaders()).toEqual([`token ${SIGN_IN}`]);

    // Disconnect makes the saved PAT active again (F-53, F-55).
    await act(async () => state.setGithubToken(null));
    expect(state.sessionKey).toBe("pat");
    expect(state.session.status).toBe("signed-out");
    expect(state.hasCredential).toBe(true);
    expect(state.isDemoMode).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(PAT);
    expect(credential.getToken()).toBe(PAT);
    fetchSpy.mockClear();
    await fetchDefaultBranch("acme/docs");
    expect(authHeaders()).toEqual([`token ${PAT}`]);
  });

  it("t24_disconnect_resets_client_and_marker", async () => {
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    localStorage.setItem("mardoc_user_repos", "[]");
    expect(getOctokit()).not.toBeNull();

    await act(async () => state.dispatchSession({ type: "disconnect" }));
    expect(getOctokit()).toBeNull();
    expect(credential.getToken()).toBeNull();
    expect(localStorage.getItem(SIGN_IN_MARKER_KEY)).toBeNull();
    expect(localStorage.getItem("mardoc_user_repos")).toBeNull();
    expect(state.session).toMatchObject({ status: "signed-out", sessionKey: null, lastLogin: null });
    expect(state.hasCredential).toBe(false);
    expect(state.isDemoMode).toBe(true);
  });

  it("t24_disconnect_and_remove_pat_leaves_no_credential", async () => {
    localStorage.setItem(TOKEN_KEY, PAT);
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    await act(async () => state.dispatchSession({ type: "disconnect-and-remove-pat" }));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(credential.getToken()).toBeNull();
    expect(getOctokit()).toBeNull();
    expect(state.hasCredential).toBe(false);
  });

  it("f50_pat_connect_and_disconnect_as_today", async () => {
    await mount();
    await act(async () => state.setGithubToken(PAT));
    expect(state.sessionKey).toBe("pat");
    expect(state.isAuthenticated).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(PAT);
    expect(credential.getCredentialInfo()).toEqual({ kind: "pat" });
    await act(async () => state.setGithubToken(null));
    expect(state.sessionKey).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(getOctokit()).toBeNull();
    expect(state.isDemoMode).toBe(true);
  });

  it("f35_same_login_keeps_open_document_and_edits", async () => {
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    await act(async () => { state.openLocalFile("notes.md", "draft text"); state.setEditorIsDirty(true); });

    // A 401 ends the session; the route and state stay.
    await act(async () => state.dispatchSession({ type: "auth-error" }));
    expect(state.session.status).toBe("expired");
    expect(state.sessionKey).toBe("sign-in:alice");
    await expect(fetchDefaultBranch("acme/docs")).rejects.toMatchObject({ status: 401 });

    await signIn("ghu_signin_token_alice_2", "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    expect(state.sessionKey).toBe("sign-in:alice");
    expect(state.selectedFile?.name).toBe("notes.md");
    expect(state.fileContent).toBe("draft text");
    expect(state.editorIsDirty).toBe(true);
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect(credential.getToken()).toBe("ghu_signin_token_alice_2");
  });

  it("f36_other_login_with_dirty_editor_asks_and_cancel_keeps_old_session", async () => {
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    await act(async () => { state.openLocalFile("notes.md", "draft text"); state.setEditorIsDirty(true); });

    await signIn("ghu_signin_token_bob", "bob");
    await screen.findByText("Discard unsaved changes?");
    expect(state.session.status).toBe("checking-user");
    await act(async () => { fireEvent.click(screen.getByText("Keep editing")); });
    expect(state.session).toMatchObject({ status: "signed-in", lastError: "cancelled", sessionKey: "sign-in:alice" });
    expect(credential.getToken()).toBe(SIGN_IN);
    expect(credential.hasPendingToken()).toBe(false);
    expect(state.fileContent).toBe("draft text");
  });

  it("f36_other_login_discard_confirmed_resets", async () => {
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    await act(async () => { state.openLocalFile("notes.md", "draft text"); state.setEditorIsDirty(true); });

    await signIn("ghu_signin_token_bob", "bob");
    await screen.findByText("Discard unsaved changes?");
    await act(async () => { fireEvent.click(screen.getByText("Discard changes")); });
    expect(state.session).toMatchObject({ status: "signed-in", sessionKey: "sign-in:bob", lastLogin: "bob" });
    expect(state.selectedFile).toBeNull();
    expect(credential.getToken()).toBe("ghu_signin_token_bob");
    expect(storageDump()).not.toContain("ghu_signin_token_bob");
  });

  it("f32_marker_without_pat_starts_in_sign_in_again_then_continue_without", async () => {
    localStorage.setItem(SIGN_IN_MARKER_KEY, "github-app");
    window.history.replaceState(null, "", "/#/acme/docs/blob/main/spec.md");
    await mount();
    await waitFor(() => expect(state.session.status).toBe("sign-in-again"));
    expect(state.hasCredential).toBe(false);
    expect(state.isDemoMode).toBe(false);
    expect(state.repoFiles).toEqual([]);
    expect(state.selectedFile).toBeNull();
    expect(location.hash).toBe("#/acme/docs/blob/main/spec.md");

    await act(async () => state.dispatchSession({ type: "continue-without" }));
    expect(state.session.status).toBe("signed-out");
    expect(state.isDemoMode).toBe(true);
    expect(state.repoFiles.length).toBeGreaterThan(0);
    expect(localStorage.getItem(SIGN_IN_MARKER_KEY)).toBeNull();
  });

  it("t12_app_ignores_a_result_from_another_window", async () => {
    await mount();
    const nonce = await startAttempt();
    const result = { type: "mardoc-sign-in-result", v: 1, nonce, ok: true, token: SIGN_IN, expiresIn: 28800 };
    await act(async () => postResult(result, window));
    await act(async () => postResult(result, null));
    expect(state.session.status).toBe("signing-in");
    expect(credential.hasPendingToken()).toBe(false);
    await act(async () => postResult(result));
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    expect(credential.getToken()).toBe(SIGN_IN);
  });

  it("f61_disconnect_revokes_the_sign_in_token_before_reset", async () => {
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    fetchSpy.mockClear();
    await act(async () => state.setGithubToken(null));
    expect(credential.getToken()).toBeNull();
    const revokes = fetchSpy.mock.calls.filter((c) => String(c[0]) === "/api/auth/revoke");
    expect(revokes).toHaveLength(1);
    const init = revokes[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ token: SIGN_IN });
  });

  it("f61_disconnect_of_a_pat_revokes_nothing", async () => {
    localStorage.setItem(TOKEN_KEY, PAT);
    await mount();
    await waitFor(() => expect(state.sessionKey).toBe("pat"));
    fetchSpy.mockClear();
    await act(async () => state.setGithubToken(null));
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/auth/revoke"))).toBe(false);
  });

  it("f52_pending_token_missing_after_user_check_gives_exchange_failed", async () => {
    localStorage.setItem(TOKEN_KEY, PAT);
    await mount();
    await waitFor(() => expect(state.sessionKey).toBe("pat"));
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => { answer = resolve; });
    const base = fetchSpy.getMockImplementation() as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).endsWith("/user")) await answered;
      return base(input, init);
    });
    await signIn(SIGN_IN, "alice");
    expect(state.session.status).toBe("checking-user");
    credential.discardPendingToken();
    await act(async () => { answer(); });
    await waitFor(() => expect(state.session.lastError).toBe("exchange_failed"));
    expect(state.session).toMatchObject({ status: "signed-out", sessionKey: "pat" });
    expect(credential.getToken()).toBe(PAT);
  });

  it("f52_pending_token_missing_at_discard_confirm_gives_exchange_failed", async () => {
    await mount();
    await signIn(SIGN_IN, "alice");
    await waitFor(() => expect(state.session.status).toBe("signed-in"));
    await act(async () => { state.openLocalFile("notes.md", "draft text"); state.setEditorIsDirty(true); });
    await signIn("ghu_signin_token_bob", "bob");
    await screen.findByText("Discard unsaved changes?");
    credential.discardPendingToken();
    await act(async () => { fireEvent.click(screen.getByText("Discard changes")); });
    expect(state.session).toMatchObject({ status: "signed-in", lastError: "exchange_failed", sessionKey: "sign-in:alice" });
    expect(credential.getToken()).toBe(SIGN_IN);
  });

  it("f50_saved_pat_wins_over_marker_and_connect_removes_it", async () => {
    localStorage.setItem(SIGN_IN_MARKER_KEY, "github-app");
    localStorage.setItem(TOKEN_KEY, PAT);
    await mount();
    await waitFor(() => expect(state.sessionKey).toBe("pat"));
    expect(state.session.status).toBe("signed-out");
    await act(async () => state.setGithubToken(PAT));
    expect(localStorage.getItem(SIGN_IN_MARKER_KEY)).toBeNull();
  });
});
