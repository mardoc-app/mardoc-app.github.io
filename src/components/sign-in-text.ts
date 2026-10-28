// Text and links the sign-in UI shares: the result-code table from
// design.md (Sign-in result codes), the install URL (F-41) and the guide links.
import { GITHUB_APP_SLUG } from "@/lib/auth/config";
import type { SignInResultCode } from "@/lib/auth/contract";

export const INSTALL_URL = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;
export const PAT_GUIDE_URL = "https://github.com/mardoc-app/mardoc-app.github.io/blob/main/docs/setup-github-pat.md";
export const DATA_AND_SECURITY_URL = "https://github.com/mardoc-app/mardoc-app.github.io/blob/main/docs/data-and-security.md";

const FIXED: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  state_mismatch: "Sign-in could not be verified. Check that cookies are allowed for mardoc.app, then try again.",
  exchange_failed: "GitHub did not answer. Try again.",
  non_expiring_token: "Sign-in is misconfigured.",
  popup_blocked: "Allow pop-ups for mardoc.app, or use a token.",
  worker_unavailable: "Sign-in with GitHub is unavailable right now.",
  timeout: "Sign-in took too long. Try again.",
  window_closed: "The sign-in window closed. Try again, or use a token.",
  cancelled: "Sign-in cancelled; your changes are kept.",
};

/** The text Settings and the banner show for a failed attempt (every code offers the PAT). */
export function signInErrorText(code: SignInResultCode | string): string {
  if (FIXED[code]) return FIXED[code];
  // bad_verification_code and any other GitHub `error` matching the pattern.
  if (/^[a-z_]{1,40}$/.test(code)) return `GitHub rejected the sign-in (${code}). Try again.`;
  return FIXED.exchange_failed;
}
