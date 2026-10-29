# Data storage and security

Reviewed against `4abb8f5` on 2026-09-23; corrected against `2b94d90` on 2026-10-21 (adoption: see [adoption judgement](adoption/judgement.md)). This describes current behavior. Browser-only hosting is an architectural constraint, not a security guarantee by itself.

## What leaves the browser

No MarDoc server receives repository content. The browser sends its token (PAT or sign-in token) directly to GitHub for REST and GraphQL requests. One server-side piece exists: the sign-in Worker, described in the next section. Reading files downloads repository content; submitting reviews, commits, or image uploads sends data to GitHub.

Rendered documents can reference remote images, styles, media, and scripts. Those resources create requests to their own hosts. “No data leaves the browser” and “the token never leaves the machine” are therefore inaccurate descriptions.

## Sign in with GitHub

A stateless Worker, run by MarDoc on Cloudflare at `mardoc.app/api/auth/*`, exchanges the sign-in code with GitHub using the MarDoc GitHub App's client secret. It sees the GitHub access token and the refresh token while it handles one exchange. Cloudflare is therefore a party in the credential path: a compromised Worker deploy or Cloudflare account could capture tokens (RK-2 in [risks.md](risks.md)). Only the MarDoc owner can deploy the Worker, and the Cloudflare account uses a hardware security key.

- The Worker keeps no data and logs nothing. Its only state is an attempt cookie that lasts 10 minutes.
- The Worker returns the access token to the MarDoc tab and discards the refresh token. MarDoc has no refresh route, so a sign-in lasts 8 hours and then ends.
- The tab keeps the sign-in token in memory only. It is not written to localStorage, sessionStorage or a cookie, and a reload ends the sign-in.
- Disconnect revokes the token at GitHub through the Worker, then clears it from memory.
- A PAT never goes through the Worker.

The sign-in token reaches only repositories where the MarDoc GitHub App is installed and that your account can reach. The 8-hour lifetime and the installed-repository limit bound what any one token can reach (SEC-01, RK-1).

## Where state lives

| Data | Location / lifetime | Recovery or clearing behavior |
| --- | --- | --- |
| Browser-entered PAT | `localStorage`: `mardoc_github_token`; also React and Octokit memory | Restored on startup; Disconnect removes the saved key and clears the module-level Octokit client and the in-memory content, tree and image caches. |
| Sign-in token | Memory only; expires after 8 hours | Not saved. Gone on reload, expiry or Disconnect; Disconnect also revokes it at GitHub. |
| Sign-in marker | `localStorage`: `mardoc_auth_method` | Non-secret value that records the tab was signed in, so a reload can offer Sign in again. Holds no token. |
| Sign-in attempt cookie | Cookie on `mardoc.app`, `HttpOnly`, path `/api/auth`, 10 minutes | Set by the Worker when sign-in starts; checked when GitHub returns. JavaScript cannot read it. |
| Last repository | `localStorage`: `mardoc_current_repo` | Restored when a deep link does not take precedence; removed on Disconnect. |
| Existing repository Markdown draft | `localStorage`: `mardoc:draft:v1:{repo}:{branch}:{path}` | Includes Markdown and timestamp. Restore is offered when different from the baseline. New/local files are excluded. |
| Display preferences | `localStorage`: `theme`, `mardoc_wide_format` | Persist independently of the connection. |
| Image folder preference | `localStorage`: `mardoc:image-folder:{repo}` | Defaults to `docs/images` if missing or invalid. |
| Cached repository list | `localStorage`: `mardoc_user_repos` | Filled by Settings; removed on Disconnect. |
| AI feedback settings | `localStorage`: `mardoc_feedback_ai` (endpoint and model), `mardoc_feedback_ai_enabled` | **Clear AI connection** removes the endpoint and model; the enabled flag persists. The API key is memory-only. |
| Loaded documents, pending review comments, editor state | React/browser memory | Pending comments and new/local edits are not recovered by the repository draft store. |
| Authenticated image data | In-memory caches and rendered DOM | No durable offline repository cache is implemented. |
| Submitted reviews, files, and images | GitHub | Persist according to repository history and GitHub behavior. |
| VS Code-provided token and local file content | App memory via messages | The init path does not persist its token through the browser PAT setter; the separate extension controls its own storage. |

localStorage is origin-scoped and not encrypted by MarDoc. It is distinct from the browser's HTTP cache. Browser settings, storage limits, or clearing site data can remove it. Storage failures are caught and may silently prevent saving drafts/preferences; autosave is not a backup guarantee.

Disconnect removes the saved PAT, the repository preference and the cached repository list, and resets the in-memory GitHub client, but leaves drafts and preferences. To remove persisted local data, use the browser's clear-site-data controls for the MarDoc origin and close its tabs. To revoke a PAT, delete it in [GitHub token settings](https://github.com/settings/tokens). Deleting browser data does not delete submitted GitHub content.

## Rendered-content isolation (SEC-01)

Rendered-content isolation is tracked as [SEC-01](known-issues.md#sec-01-html-isolation), and embed message validation as RK-3 in [risks.md](risks.md) (Q-11). Details are kept privately; report security issues through the repository's private vulnerability reporting. Open documents only from repositories you trust.

## Intended boundary and verification

The intended product model remains a statically hosted app with credentials and local drafts under browser control, direct GitHub communication, and rendered document content isolated from application credentials. Any repair should preserve rendering and commenting and be proved in a real browser. These are acceptance goals, not claims of completed verification.

## Optional feedback AI connection

Feedback polishing sends only the user-triggered draft to the configured HTTPS endpoint (HTTP is permitted for localhost). No repository or thread context is added. The API key is held in module memory, excluded from localStorage, and sent only as an Authorization header to that endpoint. URL credentials, queries, and fragments are rejected. Requests omit cookies/referrers and reject redirects. Endpoint/model settings persist in browser storage; **Clear AI connection** removes them and the in-memory key. SEC-01 above also applies to this browser application. Users must choose an endpoint whose permissions, billing, retention, and browser CORS behavior suit their use.

AI feedback polishing is optional and off by default. Enable it under Settings → AI feedback to reveal polishing controls. Hosted providers usually require a provider API key; reviewing and commenting never require AI. Disabling the feature cancels active polishing and forgets its in-memory key.
