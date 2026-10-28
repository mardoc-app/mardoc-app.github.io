// The callback and install-return pages (design.md § Worker routes,
// "Callback page"). The callback page is the one place on mardoc.app that
// echoes request input, so it reflects nothing but the sign-in result, which
// is serialised as JSON with <, > and & escaped (I-17).
import type { SignInResult } from "../../../src/lib/auth/contract";

/** CSP for the callback page; `cspNonce` is 16 random bytes, fresh per response. */
export function callbackCsp(cspNonce: string): string {
  return (
    `default-src 'none'; script-src 'nonce-${cspNonce}'; ` +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
}

/** CSP for pages that run no script (install return, plain-text errors). */
export const STATIC_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** JSON safe to place inside a `<script>` element: no <, > or & survive. */
export function escapedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export const RETURN_TEXT = "Return to MarDoc and try again.";
export const INSTALLED_TEXT = "MarDoc is installed. Go back to the MarDoc tab and press Refresh.";

export function renderCallbackPage(result: SignInResult, appOrigin: string, cspNonce: string): string {
  // The script posts to the configured app origin only, never "*".
  const script =
    "(function(){" +
    'var r=JSON.parse(document.getElementById("result").textContent);' +
    "var o=window.opener;" +
    `if(o){o.postMessage(r,${escapedJson(appOrigin)});window.close();}` +
    `else{document.getElementById("msg").textContent=${escapedJson(RETURN_TEXT)};}` +
    "})();";
  return (
    "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer">' +
    "<title>MarDoc sign-in</title></head><body>" +
    '<p id="msg">Finishing sign-in…</p>' +
    `<script type="application/json" id="result">${escapedJson(result)}</script>` +
    `<script nonce="${cspNonce}">${script}</script>` +
    "</body></html>\n"
  );
}

export function renderInstallPage(): string {
  return (
    "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer">' +
    "<title>MarDoc installed</title></head><body>" +
    `<p>${INSTALLED_TEXT}</p>` +
    "</body></html>\n"
  );
}
