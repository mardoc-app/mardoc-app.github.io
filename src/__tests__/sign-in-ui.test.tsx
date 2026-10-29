// WP-6: the signed-in views, installs, result codes, banner and F-42/F-44
// messages. Component tests with a faked useApp(): the sign-in window adapter
// (WP-5) does not exist yet, so these states cannot be reached through the UI.
// Mock: useApp() only; the components and their text are real.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import type { SessionState, SessionStatus, SessionKey } from "@/lib/auth/types";
import type { SignInResultCode } from "@/lib/auth/contract";

let ctx: Record<string, any>;
vi.mock("@/lib/app-context", () => ({ useApp: () => ctx }));
vi.mock("@/lib/github-api", () => ({ fetchUserRepos: vi.fn(async () => []) }));
vi.mock("@/lib/theme-context", () => ({ useTheme: () => ({ toggleTheme: () => {} }) }));
vi.mock("@/lib/use-viewport", () => ({ useIsMobile: () => false }));
vi.mock("@/components/Sidebar", () => ({ default: () => null }));
vi.mock("@/components/Editor", () => ({ default: () => null }));
vi.mock("@/components/HtmlViewer", () => ({ default: () => null }));
vi.mock("@/components/PRDetail", () => ({ default: () => null }));
vi.mock("@/components/PRReview", () => ({ default: () => null }));
vi.mock("@/components/MobileDrawer", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/KeyboardCheatsheet", () => ({ default: () => null }));
vi.mock("@/components/CommandPalette", () => ({ default: () => null }));
vi.mock("@/components/FeedbackAISettings", () => ({ default: () => null }));

import SettingsPanel from "@/components/SettingsPanel";
import SignInBanner from "@/components/SignInBanner";
import Home from "@/app/page";
import { signInErrorText, INSTALL_URL } from "@/components/sign-in-text";

function session(status: SessionStatus, over: Partial<SessionState> = {}): SessionState {
  return {
    status, sessionKey: null, lastLogin: null, lastError: null, statusBeforeAttempt: status,
    expiresAt: null, attempt: null, pendingLogin: null, pendingExpiresAt: null, ...over,
  };
}
function setCtx(status: SessionStatus, key: SessionKey, over: Partial<SessionState> = {}, extra: Record<string, any> = {}) {
  ctx = {
    session: session(status, { sessionKey: key, ...over }),
    sessionKey: key, hasCredential: key !== null, isAuthenticated: key !== null,
    startSignIn: vi.fn(), setGithubToken: vi.fn(), dispatchSession: vi.fn(),
    isEmbedded: false, isDemoMode: key === null, currentRepo: null, setCurrentRepo: vi.fn(),
    error: null, repoFiles: [], pullRequests: [], selectedFile: null, selectedPR: null,
    currentView: "editor", ...extra,
  };
}
const openConnect = () => {
  render(<SettingsPanel isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "GitHub Connection" }));
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); window.location.hash = ""; });

describe("settings: signed-in views (T-16, T-18 UI)", () => {
  it("f13_signed_in_shows_login_and_install_link", () => {
    setCtx("signed-in", "sign-in:octo");
    openConnect();
    expect(screen.getByText("Signed in with GitHub as octo")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Install MarDoc on more repositories" });
    expect(link.getAttribute("href")).toBe("https://github.com/apps/mardoc-app/installations/new");
    expect(link.getAttribute("href")).toBe(INSTALL_URL);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(ctx.setGithubToken).toHaveBeenCalledWith(null);
  });

  it("f55_saved_pat_sentence_and_remove_saved_token", () => {
    localStorage.setItem("mardoc_github_token", "ghp_saved");
    setCtx("signed-in", "sign-in:octo");
    openConnect();
    expect(screen.getByText("A saved personal access token will be used after you disconnect.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove saved token" }));
    expect(localStorage.getItem("mardoc_github_token")).toBeNull();
    expect(screen.queryByText(/saved personal access token will be used/)).toBeNull();
  });

  it("f55_disconnect_and_remove_saved_token_dispatches", () => {
    localStorage.setItem("mardoc_github_token", "ghp_saved");
    setCtx("signed-in", "sign-in:octo");
    openConnect();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect and remove saved token" }));
    expect(ctx.dispatchSession).toHaveBeenCalledWith({ type: "disconnect-and-remove-pat" });
  });

  it("f55_no_saved_pat_no_sentence", () => {
    setCtx("signed-in", "sign-in:octo");
    openConnect();
    expect(screen.queryByText(/saved personal access token/)).toBeNull();
  });

  it("f32_expired_offers_sign_in_again_and_token_option", () => {
    setCtx("expired", "sign-in:octo");
    openConnect();
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(ctx.startSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Use a personal access token" })).toBeTruthy();
  });

  it("f18_pat_active_still_offers_sign_in", () => {
    setCtx("signed-out", "pat");
    openConnect();
    expect(screen.getByText("Connected with a personal access token")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with GitHub" }));
    expect(ctx.startSignIn).toHaveBeenCalledTimes(1);
  });
});

describe("t18_error_text_and_pat_option", () => {
  const codes: [SignInResultCode, string][] = [
    ["access_denied", "Sign-in was cancelled."],
    ["state_mismatch", "Sign-in could not be verified. Check that cookies are allowed for mardoc.app, then try again."],
    ["bad_verification_code", "GitHub rejected the sign-in (bad_verification_code). Try again."],
    ["exchange_failed", "GitHub did not answer. Try again."],
    ["non_expiring_token", "Sign-in is misconfigured."],
    ["popup_blocked", "Allow pop-ups for mardoc.app, or use a token."],
    ["worker_unavailable", "Sign-in with GitHub is unavailable right now."],
    ["timeout", "Sign-in took too long. Try again."],
    ["window_closed", "The sign-in window closed. Try again, or use a token."],
    ["cancelled", "Sign-in cancelled; your changes are kept."],
  ];
  for (const [code, text] of codes) {
    it(`t18_${code}_shows_text_and_pat_option_in_live_region`, () => {
      setCtx("signed-out", null, { lastError: code });
      openConnect();
      const region = screen.getByTestId("sign-in-status");
      expect(region.getAttribute("aria-live")).toBe("polite");
      expect(within(region).getByText(text)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Use a personal access token" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
    });
  }
  it("t18_other_github_error_code_uses_rejected_text", () => {
    expect(signInErrorText("redirect_uri_mismatch")).toBe("GitHub rejected the sign-in (redirect_uri_mismatch). Try again.");
  });
  it("t18_error_value_outside_pattern_is_exchange_failed", () => {
    expect(signInErrorText("Bad<script>")).toBe("GitHub did not answer. Try again.");
  });
});

describe("f44_empty_installations_message", () => {
  it("shows install link, owner line and token option for a sign-in credential", async () => {
    setCtx("signed-in", "sign-in:octo");
    render(<SettingsPanel isOpen onClose={() => {}} />);
    const box = await screen.findByTestId("no-installations");
    expect(box.textContent).toContain("isn’t installed on any repository you can reach.");
    expect(box.textContent).toContain("ask a repository owner to install it");
    expect(within(box).getByRole("link").getAttribute("href")).toBe(INSTALL_URL);
    expect(within(box).getByRole("button", { name: "Use a personal access token" })).toBeTruthy();
  });
  it("is_not_shown_for_a_pat", async () => {
    setCtx("signed-out", "pat");
    render(<SettingsPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No repositories found/)).toBeTruthy());
    expect(screen.queryByTestId("no-installations")).toBeNull();
  });
});

describe("framed (F-19, SR-1)", () => {
  const expectNewTabLink = () => {
    const link = screen.getByRole("link", { name: "Open MarDoc in a new tab" });
    expect(link.getAttribute("href")).toBe(window.location.href);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toMatch(/\bnoopener\b/);
  };

  for (const [name, status, key] of [
    ["signed_out", "signed-out", null],
    ["pat_active", "signed-out", "pat"],
    ["expired", "expired", "sign-in:octo"],
  ] as const) {
    it(`f19_framed_settings_${name}_offers_new_tab_not_sign_in_sr1`, () => {
      window.location.hash = "#/acme/docs/blob/main/docs/spec.md";
      setCtx(status, key, {}, { isFramed: true });
      openConnect();
      expect(screen.queryByRole("button", { name: /^Sign in/ })).toBeNull();
      expectNewTabLink();
    });
  }

  it("f19_framed_settings_still_offers_the_token_sr1", () => {
    setCtx("signed-out", null, {}, { isFramed: true });
    openConnect();
    expect(screen.getByRole("button", { name: "Use a personal access token" })).toBeTruthy();
  });

  it("f19_framed_banner_offers_new_tab_not_sign_in_again_sr1", () => {
    setCtx("expired", "sign-in:octo", {}, { isFramed: true });
    render(<SignInBanner />);
    expect(screen.getByText("Your GitHub sign-in has ended")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in again" })).toBeNull();
    expectNewTabLink();
  });

  it("f19_embed_mode_shows_no_new_tab_link_sr1", () => {
    // The VS Code webview frames MarDoc on purpose; sign-in is simply hidden there (F-15).
    setCtx("signed-out", null, {}, { isFramed: true, isEmbedded: true });
    openConnect();
    expect(screen.queryByRole("link", { name: "Open MarDoc in a new tab" })).toBeNull();
  });
});

describe("banner (F-32, F-33, F-37, F-38, NF-22)", () => {
  it("f33_banner_expiring", () => {
    setCtx("expiring", "sign-in:octo");
    render(<SignInBanner />);
    expect(screen.getByText("Your GitHub sign-in ends in 10 minutes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(ctx.startSignIn).toHaveBeenCalledTimes(1);
  });
  it("f33_banner_expired", () => {
    setCtx("expired", "sign-in:octo");
    render(<SignInBanner />);
    expect(screen.getByText("Your GitHub sign-in has ended")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue without signing in" })).toBeNull();
  });
  it("f37_f38_banner_sign_in_again_names_file_and_continues", () => {
    window.location.hash = "#/octo/docs/blob/main/guide/intro.md";
    setCtx("sign-in-again", null);
    render(<SignInBanner />);
    expect(screen.getByTestId("sign-in-banner").textContent).toContain("Sign in again to open guide/intro.md");
    fireEvent.click(screen.getByRole("button", { name: "Continue without signing in" }));
    expect(ctx.dispatchSession).toHaveBeenCalledWith({ type: "continue-without" });
  });
  it("nf22_region_is_live_and_present_when_empty", () => {
    setCtx("signed-in", "sign-in:octo");
    render(<SignInBanner />);
    expect(screen.getByTestId("sign-in-banner-region").getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByTestId("sign-in-banner")).toBeNull();
  });
  it("t18_banner_error_offers_token_option", () => {
    setCtx("expired", "sign-in:octo", { lastError: "popup_blocked" });
    const onUseToken = vi.fn();
    render(<SignInBanner onUseToken={onUseToken} />);
    expect(screen.getByTestId("banner-error").textContent).toBe("Allow pop-ups for mardoc.app, or use a token.");
    fireEvent.click(screen.getByRole("button", { name: "Use a personal access token" }));
    expect(onUseToken).toHaveBeenCalled();
  });
  it("banner_keeps_state_during_an_attempt", () => {
    setCtx("signing-in", "sign-in:octo", { statusBeforeAttempt: "expired" });
    render(<SignInBanner />);
    expect(screen.getByText("Your GitHub sign-in has ended")).toBeTruthy();
  });
  it("f15_banner_hidden_in_embed", () => {
    setCtx("expired", "sign-in:octo", {}, { isEmbedded: true });
    render(<SignInBanner />);
    expect(screen.queryByTestId("sign-in-banner")).toBeNull();
  });
  it("nf18_banner_controls_are_buttons_reachable_by_keyboard", () => {
    setCtx("sign-in-again", null);
    render(<SignInBanner />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).tabIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("f42_deep_link_404_message", () => {
  const notFound = "Failed to load file: not found. The resource may have been deleted or you may not have access.";
  it("names_the_repo_with_install_link_and_token_option_for_a_sign_in_credential", () => {
    window.location.hash = "#/octo/secret/blob/main/a.md";
    setCtx("signed-in", "sign-in:octo", {}, { error: notFound });
    render(<Home />);
    const note = screen.getByTestId("no-access-notice");
    expect(note.textContent).toContain("octo/secret");
    expect(within(note).getByRole("link").getAttribute("href")).toBe(INSTALL_URL);
    expect(within(note).getByRole("button", { name: "use a personal access token" })).toBeTruthy();
  });
  it("is_not_shown_for_a_pat", () => {
    window.location.hash = "#/octo/secret/blob/main/a.md";
    setCtx("signed-out", "pat", {}, { error: notFound });
    render(<Home />);
    expect(screen.queryByTestId("no-access-notice")).toBeNull();
  });
  it("f37_main_pane_names_file_instead_of_demo_data", () => {
    window.location.hash = "#/octo/docs/blob/main/guide/intro.md";
    setCtx("sign-in-again", null);
    render(<Home />);
    expect(screen.getByTestId("sign-in-again-pane").textContent).toContain("guide/intro.md");
    expect(screen.queryByText(/Welcome to Mar/)).toBeNull();
  });
});
