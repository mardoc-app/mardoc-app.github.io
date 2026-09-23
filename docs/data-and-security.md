# Data storage and security

Reviewed against `4abb8f5` on 2026-09-23. This describes current behavior, including known gaps. Browser-only hosting is an architectural constraint; it does not by itself guarantee that documents cannot access credentials or make network requests.

## What leaves the browser

MarDoc has no application backend receiving repository content or authenticating users. The browser sends the PAT directly to GitHub for REST and GraphQL requests. Reading files downloads repository content; submitting reviews, commits, or image uploads sends data to GitHub.

Rendered documents can reference remote images, styles, media, and scripts. Those resources create requests to their own hosts. HTML scripts execute in the current viewers. “No data leaves the browser” and “the token never leaves the machine” are therefore inaccurate descriptions.

## Where state lives

| Data | Location / lifetime | Recovery or clearing behavior |
| --- | --- | --- |
| Browser-entered PAT | `localStorage`: `mardoc_github_token`; also React and Octokit memory | Restored on startup; Disconnect removes the saved key, but does not reset the module-level Octokit instance. |
| Last repository | `localStorage`: `mardoc_current_repo` | Restored when a deep link does not take precedence; removed on Disconnect. |
| Existing repository Markdown draft | `localStorage`: `mardoc:draft:v1:{repo}:{branch}:{path}` | Includes Markdown and timestamp. Restore is offered when different from the baseline. New/local files are excluded. |
| Display preferences | `localStorage`: `theme`, `mardoc_wide_format` | Persist independently of the connection. |
| Image folder preference | `localStorage`: `mardoc:image-folder:{repo}` | Defaults to `docs/images` if missing or invalid. |
| Loaded documents, pending review comments, editor state | React/browser memory | Pending comments and new/local edits are not recovered by the repository draft store. |
| Authenticated image data | In-memory caches and rendered DOM | No durable offline repository cache is implemented. |
| Submitted reviews, files, and images | GitHub | Persist according to repository history and GitHub behavior. |
| VS Code-provided token and local file content | App memory via messages | The init path does not persist its token through the browser PAT setter; the separate extension controls its own storage. |

localStorage is origin-scoped and not encrypted by MarDoc. It is distinct from the browser's HTTP cache. Browser settings, storage limits, or clearing site data can remove it. Storage failures are caught and may silently prevent saving drafts/preferences; autosave is not a backup guarantee.

Disconnect removes the saved PAT and repository preference but leaves drafts and preferences. To remove persisted local data, use the browser's clear-site-data controls for the MarDoc origin and close its tabs. To revoke the credential itself, delete it in [GitHub token settings](https://github.com/settings/tokens). Deleting browser data does not delete submitted GitHub content.

## Known HTML isolation gap

Both [HtmlViewer](../src/components/HtmlViewer.tsx) and the HTML path in [DiffViewer](../src/components/DiffViewer.tsx) currently use `sandbox="allow-scripts allow-same-origin"` with `srcdoc`. Document scripts are retained. For same-origin content this combination does not protect the parent origin's storage from those scripts; see [MDN's iframe sandbox documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox).

The earlier feature specification promised `allow-scripts` without `allow-same-origin` and token isolation. That guarantee is not currently met. Treat rendered HTML as active content that must be trusted; this documentation refresh does not repair the boundary. [SEC-01](known-issues.md#sec-01-html-isolation) tracks the required implementation and browser-level verification.

Markdown and PR-description rendering also place generated HTML into the application DOM. There is no general sanitization guarantee documented by this implementation. A future security pass should cover these paths, document resource loading, and source/origin validation for iframe and extension messages.

## Intended boundary and verification

The intended product model remains a statically hosted app with credentials and local drafts under browser control, direct GitHub communication, and rendered document content isolated from application credentials. Any repair should preserve rendering/commenting while proving that embedded content cannot read parent storage or impersonate trusted host messages. These are acceptance goals, not claims of completed verification.
