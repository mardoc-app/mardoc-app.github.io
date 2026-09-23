# Feature status and design records

Reviewed against application source at `4abb8f5` on 2026-09-23. Status here describes source evidence, not a new test run. Current user behavior is documented in [capabilities](../capabilities.md), implementation in [architecture](../architecture.md), and unresolved gaps in [known issues](../known-issues.md).

## Status conventions

- **Implemented core:** the primary code path exists; this does not certify every historical acceptance criterion or live environment.
- **Partial:** some functionality exists, with known unmet criteria.
- **App side implemented; extension unverified:** this repository provides its part of a cross-repository feature; verify the extension separately.
- **Planned:** proposal only.
- **Criteria review pending:** additional historical criteria require verification before being marked complete.

The `done/` directory is a legacy organizational label, not proof of completeness. Existing paths are preserved so links remain stable. Each story starts with a current status note; the original design remains explicitly historical. New stories should use a unique number, explicit status, implemented behavior, remaining work, and validation evidence. Distinguish a design decision from tested behavior.

Two legacy stories use 010. Refer to their full slugs (`010-comment-reply-threading` and `010-suggested-changes`) rather than the number alone. Do not reuse either identifier for new work. References in old plans to unnamed/unwritten follow-ons are not shipped features.

## Inventory

| Story | Current status | Evidence / boundary |
| --- | --- | --- |
| [001-render-final-markdown](done/001-render-final-markdown.md) | Implemented core | Preview mode provides a head-content reading surface in DiffViewer; the original proposed mode names below are historical. |
| [002-branch-selector](done/002-branch-selector.md) | Implemented core | Branch selection and tree/content loading exist in Sidebar and app-context. |
| [003-comment-to-pr](done/003-comment-to-pr.md) | Partial | createReviewPR starts a fresh branch from the default branch with a whitespace change; selected-branch review and existing-PR reuse criteria are not implemented. |
| [004-edit-to-pr](done/004-edit-to-pr.md) | Partial | Editor provides dirty tracking and an edit-to-PR UI, but the existing-file save path uses a new-file helper without an update SHA. See EDIT-02. |
| [005-restore-last-repo-on-return](done/005-restore-last-repo-on-return.md) | Partial | Last-repository restoration exists. Failed loads do not implement the proposed clearing of the saved repository and full fallback state. |
| [006-code-block-syntax-highlighting](done/006-code-block-syntax-highlighting.md) | Implemented core | Lowlight and CodeBlockLowlight are used in rendering/editor paths; dependency versions below are historical notes. |
| [007-url-routing-and-deep-links](done/007-url-routing-and-deep-links.md) | Partial | Hash navigation and restoration exist; malformed routes and route encoding remain incomplete. See NAV-01 in the known-issues register. |
| [008-wide-format-toggle](done/008-wide-format-toggle.md) | Implemented core | use-wide-format persists the preference and provides document layout classes. |
| [009-document-link-navigation](done/009-document-link-navigation.md) | Implemented core | Link classification and navigation helpers exist. Historical acceptance criteria are not a certification of every view/file-type combination. |
| [010-comment-reply-threading](done/010-comment-reply-threading.md) | Implemented core | PR comments, replies, and resolution use GitHub REST/GraphQL. The placeholder diagnosis below describes the original problem. |
| [010-suggested-changes](done/010-suggested-changes.md) | Partial | Individual suggestion application exists. Batch acceptance in one commit and outdated-range validation are unfinished; see REVIEW-03. |
| [011-sync-comment-resolution-status](done/011-sync-comment-resolution-status.md) | Implemented core | Thread resolution is read via GraphQL and merged during comment refresh; resolve/unresolve mutations exist. |
| [012-open-local-file](done/012-open-local-file.md) | Implemented core | Local file loading supports Markdown and HTML. Browser file-picker loading does not give filesystem write-back or neighboring-asset access. |
| [015-create-new-file-in-repo](done/015-create-new-file-in-repo.md) | Partial | New-file-to-PR flow exists. Existing-path conflict handling lacks the proposed overwrite-choice flow; see EDIT-02. |
| [016-add-file-to-pr](done/016-add-file-to-pr.md) | Implemented core | New files can be committed to an existing PR branch from the editor flow. |
| [017-vscode-extension](done/017-vscode-extension.md) | App side implemented; extension unverified | Embed UI and message handlers exist in this repository. Verify extension commands, filesystem operations, and packaging in the separate extension repository. |
| [018-html-in-markdown-roundtrip](done/018-html-in-markdown-roundtrip.md) | Partial | Converter preservation rules exist, but HTML comments/table spans have known failures and converter tests omit TipTap. Full lossless editor preservation is not implemented. |
| [019-code-view-toggle](done/019-code-view-toggle.md) | Implemented core; criteria review pending | Rich/code switching exists. Code view after rich-editor normalization cannot recover formatting already lost; historical syntax-highlighting/auto-size criteria need separate verification. |
| [020-vscode-webview-compat](done/020-vscode-webview-compat.md) | App side implemented; extension unverified | openExternal uses the message type open-external in embed mode and window.open in the normal browser. The original blanket ban on browser APIs is not the current contract. |
| [021-hash-router-url-decoding](done/021-hash-router-url-decoding.md) | Partial | Branch/path decoding exists; malformed escapes, numeric validation, fallback routes, and route-builder encoding still need work. See NAV-01. |
| [022-mermaid-rerender-code-view](done/022-mermaid-rerender-code-view.md) | Implemented core | Mermaid source preservation, Turndown restoration, and rerendering paths exist, with unit and browser coverage files. Original unchecked boxes below are historical. |
| [023-localstorage-error-handling](done/023-localstorage-error-handling.md) | Implemented core | Safe storage helpers catch access/quota errors. Persistence may silently fail; this does not guarantee recovery of unsaved work. |
| [024-github-api-error-handling](done/024-github-api-error-handling.md) | Partial | Retry/backoff, rate-limit tracking, and error formatting exist. Individual PR content failures still become empty strings; see REVIEW-01. |
| [025-link-bubble-robustness](done/025-link-bubble-robustness.md) | Implemented core; criteria review pending | LinkImageBubble and regression tests exist. Historical acceptance criteria do not certify all rerender/positioning edge cases. |
| [026-navigation-guard-unsaved-changes](done/026-navigation-guard-unsaved-changes.md) | Partial | Navigation and beforeunload guards use the editor dirty signal. New/local drafts are excluded by reconcileDraft; pending reviews have no equivalent persistent recovery. See DATA-01. |
| [027-concurrent-request-safety](done/027-concurrent-request-safety.md) | Partial | Generation guards protect several loads, but PR-list loading and count enrichment remain unguarded. Implementation uses generation checks, not the proposed AbortController cancellation. |
| [028-pr-description-display](done/028-pr-description-display.md) | Partial | PR descriptions render through Showdown. The proposed sanitization step is not implemented; no general sanitization guarantee should be inferred. |
| [029-remove-console-log-stubs](done/029-remove-console-log-stubs.md) | Partial | Earlier stubs changed, but page.tsx still supplies a no-op onContentChange and embed reload contains console.log calls. The original no-stubs/no-logs criteria are not satisfied. |
| [030-embed-local-image-rendering](done/030-embed-local-image-rendering.md) | App side implemented; extension unverified | Image request/reply bridge and authenticated/local image paths exist. Extension-side filesystem and forwarding support must be checked separately. |
| [031-html-document-rendering](done/031-html-document-rendering.md) | Partial; isolation gap open | HTML viewing and PR source/rendered modes exist. Actual sandbox flags include allow-same-origin; the intended token-isolation criterion is NOT met. See SEC-01. |
| [032-mermaid-theme-upgrade](done/032-mermaid-theme-upgrade.md) | Implemented core | Custom light/dark Mermaid configuration and theme synchronization exist. |
| [033-html-inline-comments](done/033-html-inline-comments.md) | Partial; isolation gap open | HTML selection and source-line commenting paths exist. Actual viewers include allow-same-origin contrary to the original plan; remaining pin/highlight parity needs browser verification. See SEC-01. |
| [037-ai-page-translation](037-ai-page-translation.md) | Planned | No AI provider or translation workflow is implemented. Everything below is a proposal; model names and dependency choices are historical suggestions, not supported configuration. |
| [038-cellphone-mode-viewer](done/038-cellphone-mode-viewer.md) | Partial | Responsive navigation and review sheets exist. Swipe-file navigation and tablet override are unfinished; pending reviews do not synchronize across devices. |
| [039-per-file-comment-filtering](039-per-file-comment-filtering.md) | Implemented core | Per-file filtering and path metadata are present, with unit/component and E2E coverage files. The bug diagnosis and implementation plan below describe the pre-fix state. |
| [040-embed-reload-shortcut](040-embed-reload-shortcut.md) | App side implemented; extension unverified | Reload helpers, UI actions, message handling, nonce, and tests exist. Extension commands/watchers are not verified here. Local-file dirty tracking limits the intended unsaved-edit guard; see DATA-01. |
