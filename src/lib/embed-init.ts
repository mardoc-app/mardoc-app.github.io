/**
 * Trust check for the VS Code embed `init` message (F-16, T-15).
 *
 * `init` can carry a GitHub token and replace the displayed document, so
 * the app applies it only when both of these hold:
 *
 *   1. the page was loaded with `?embed=true`;
 *   2. the message came from the page's own parent window, and that parent
 *      is not the page itself (a top-level page has `parent === window`).
 *
 * The VS Code webview holds MarDoc in `<iframe id="mardoc" src="…?embed=true">`
 * and posts with `iframe.contentWindow.postMessage(payload, '*')`, so the
 * message's `source` is MarDoc's `window.parent`. Origins are not checked:
 * the webview's `vscode-webview://` origin differs per install.
 *
 * `search` must be read from `window.location.search` at message time, not
 * from React state, which is set only after mount.
 *
 * Pure module, no DOM access. Wired up in app-context.tsx, tested in
 * embed-init.test.ts.
 */
export interface InitTrustInput {
  /** `event.data` */
  data: unknown;
  /** `event.source` */
  source: unknown;
  /** `window.parent` */
  parent: unknown;
  /** `window` */
  self: unknown;
  /** `window.location.search` */
  search: string;
}

export function isTrustedInit(input: InitTrustInput): boolean {
  const { data, source, parent, self, search } = input;
  if (typeof data !== "object" || data === null) return false;
  if ((data as { type?: unknown }).type !== "init") return false;
  if (new URLSearchParams(search).get("embed") !== "true") return false;
  if (parent === self) return false;
  if (source === null || source === undefined) return false;
  return source === parent;
}
