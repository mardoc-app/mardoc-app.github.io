# MarDoc adoption map

Level: L1 (adoption map at `2b94d90`; states and actions in the `sdlc:adopt` skill's `references/adoption.md`)

Survey: [survey.md](survey.md) and [judgement.md](judgement.md) (X-n contradictions), generated at `2b94d9067011bf7e81dcda2791b9aa7d27ec00ac` on 2026-10-20.
Generate the doclint ignore list from this table with
`doc_survey.py --map docs/adoption/map.md --write-ignore`.

The areas under active change are **GitHub connection and credentials** (#146, D-1) and **HTML isolation** (SEC-01). Both get an as-is baseline, alongside one for the whole system.

| Doc | Level | State | Action | Notes |
|---|---|---|---|---|
| `AGENTS.md` | process | current | adopt | SDLC scaffold. Line 37 points to the unfilled design.md (Q-12). |
| `CLAUDE.md` | process | current | adopt | Imports AGENTS.md. |
| `README.md` | L1 | current | adopt | Product introduction. Lines 9 and 16 change when sign-in ships (D-1). |
| `REVIEW.md` | process | current | adopt | Review rubric (scaffold). |
| `docs/README.md` | process | stale | fix | Doc index. Baseline header (X-18); index omits branch-links.md and performance.md; governance overlaps AGENTS.md (Q-13). |
| `docs/adr/0001-web-sign-in-github-app-worker-route.md` | process | current | adopt | ADR 0001. |
| `docs/application-audit.md` | L2 | superseded | archive | Self-declared historical (:5); line references out of date. |
| `docs/architecture.md` | L1 | stale | fix | Loading and navigation sections stale (X-9 to X-12); code map valid. Best source for the as-is system L1; recap, then supersede when a designed L1 exists. |
| `docs/branch-links.md` | L3 | current | adopt | Accurate; minor X-19. |
| `docs/capabilities.md` | L1 | current | adopt | Capability reference (2026-10-19). Duplicate paragraph at :105. |
| `docs/comment-navigation-plan.md` | process | stale | fix | Marker section stale (X-13); lasting location contract at :68-209. |
| `docs/data-and-security.md` | L2 | contradictory | fix | Security owner, under active change. X-1, X-2; missing storage keys. Source for the github-connection baseline. |
| `docs/design/github-sign-in/strategy.html` | L0 | current | adopt | L0 strategy (D-1). |
| `docs/design/mardoc/design.md` | L2 | boilerplate | leave | Unfilled template (Q-12). |
| `docs/design/mardoc/intent.md` | L1 | boilerplate | leave | Unfilled template; filled by sdlc:requirements. |
| `docs/design/mardoc/requirements.md` | L1 | boilerplate | leave | Template, except the open-questions table, which is live. |
| `docs/design/mardoc/ux.html` | L1 | boilerplate | leave | Unfilled template. |
| `docs/design/mobile-prototype.html` | L1 | duplicate | leave | Byte-identical to public/mobile-prototype.html. |
| `docs/development.md` | process | current | fix | Missing `npm run ci` (X-15). |
| `docs/features/037-ai-page-translation.md` | L0 | current | leave | Planned, not implemented. Its key-in-localStorage idea conflicts with the shipped feedback-AI precedent (Q-18). |
| `docs/features/039-per-file-comment-filtering.md` | L2 | current | leave | Implemented; sits outside done/. |
| `docs/features/039-web-folder-open-local-images.md` | L1 | orphan | fix | Untracked; duplicate ID (Q-16); acceptance criteria 3 and 8 conflict with draft-store.ts (X-17). |
| `docs/features/040-embed-reload-shortcut.md` | L2 | current | leave | App side implemented; extension side unverified. |
| `docs/features/041-rendered-html-inline-diff.md` | L2 | current | adopt | Implemented. |
| `docs/features/README.md` | L3 | stale | fix | Stale rows 007, 021, 024, 027, 033; detached 041 row; 039-web-folder unlisted. |
| `docs/features/done/001-render-final-markdown.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/002-branch-selector.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/003-comment-to-pr.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/004-edit-to-pr.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/005-restore-last-repo-on-return.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/006-code-block-syntax-highlighting.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/007-url-routing-and-deep-links.md` | L2 | stale | fix | Status stale (X-11). |
| `docs/features/done/008-wide-format-toggle.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/009-document-link-navigation.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/010-comment-reply-threading.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/010-suggested-changes.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/011-sync-comment-resolution-status.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/012-open-local-file.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/015-create-new-file-in-repo.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/016-add-file-to-pr.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/017-vscode-extension.md` | L2 | current | leave | Add the `repo` scope note (X-7). |
| `docs/features/done/018-html-in-markdown-roundtrip.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/019-code-view-toggle.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/020-vscode-webview-compat.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/021-hash-router-url-decoding.md` | L2 | stale | fix | Status stale (X-11). |
| `docs/features/done/022-mermaid-rerender-code-view.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/023-localstorage-error-handling.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/024-github-api-error-handling.md` | L2 | stale | fix | Status line stale (X-9). |
| `docs/features/done/025-link-bubble-robustness.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/026-navigation-guard-unsaved-changes.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/027-concurrent-request-safety.md` | L2 | stale | fix | Status stale (X-10). |
| `docs/features/done/028-pr-description-display.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/029-remove-console-log-stubs.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/030-embed-local-image-rendering.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/031-html-document-rendering.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/032-mermaid-theme-upgrade.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/features/done/033-html-inline-comments.md` | L2 | stale | fix | Status line stale (X-13); sandbox plan vs code (X-3). |
| `docs/features/done/038-cellphone-mode-viewer.md` | L2 | current | leave | Per status line; skimmed, not verified in depth. |
| `docs/html-inline-diff-delivery-plan.md` | process | superseded | archive | Delivery log covered by 041 and capabilities.md; agent-session notes; X-15. |
| `docs/known-issues.md` | L3 | stale | fix | REVIEW-01/02, NAV-01, DATA-02 closed or narrowed in code; X-16. Register ownership is Q-14. |
| `docs/lessons.md` | process | boilerplate | leave | Template example row; filled when the first lesson lands. |
| `docs/performance.md` | L2 | current | adopt | Accurate; missing from the doc index. |
| `docs/plan.md` | process | current | adopt | SDLC plan. |
| `docs/review-links.md` | L3 | current | adopt | Accurate. |
| `docs/reviews/2026-10-20-github-sign-in-l0.md` | process | current | adopt | GSI review. |
| `docs/risks.md` | process | contradictory | fix | RK-2 claims data-and-security.md names Cloudflare (X-8); fixed in this adoption change. Broken anchor to design.md#accepted-risks (template). |
| `docs/setup-github-pat.md` | L3 | current | fix | X-1 at :42. Extend for GitHub App sign-in later (D-1). |
| `docs/test-html-roundtrip.md` | L3 | current | leave | Test fixture; its broken links are intentional placeholders. |
| `e2e/README.md` | L3 | stale | fix | Coverage map lists 15 of 25 specs (X-14). |

## Decisions raised

Each row is also a Q-n in [requirements.md](../design/mardoc/requirements.md#open-questions). Code citations are at `2b94d90`.

| ID | Contradiction | Sources on each side | Code at `2b94d90` | Recommended default |
|---|---|---|---|---|
| Q-10 | Settings copy says the token never leaves the browser and there is no server (X-4) | SettingsPanel.tsx:252 vs data-and-security.md:9 | The copy is shown as written. The PAT goes to GitHub, and rendered HTML can read it (X-2). | Replace the copy with the data-and-security.md wording in the next change to SettingsPanel; the doc is right. |
| Q-11 | The `init` message is accepted from any sender, outside embed mode too, and can set a token (X-6) | app-context.tsx:327-331, 353-376 vs data-and-security.md:35 and known-issues.md:9 (validation "future work") | No origin, source or embed-mode check. `file:content`, `theme:change` and image-bridge messages don't check the source either. | Add origin and source checks plus an embed-mode gate to the SEC-01 closure criteria, and record as RK-3. |
| Q-12 | Which doc is the architecture authority (AGENTS.md:37 vs content) | AGENTS.md:37 → design/mardoc/design.md (unfilled) vs docs/architecture.md | — | The as-is system baseline (L1) is the entry point. docs/architecture.md stays the technical record until a designed L1 supersedes it. AGENTS.md links both. |
| Q-13 | Two sets of documentation rules | docs/README.md:18-24, development.md:48-50 vs AGENTS.md and REVIEW.md | — | docs/README.md stays the doc index; process rules live in AGENTS.md, which links the index. |
| Q-14 | Two gap registers | known-issues.md vs risks.md and the plan.md backlog | — | known-issues.md stays the product-gap register (user-facing). risks.md holds delivery and security risks and cites known-issues IDs. Closed entries get marked closed, not deleted. |
| Q-15 | In-app PAT scopes differ from the guide (X-5) | SettingsPanel.tsx:209-222 vs setup-github-pat.md:24,36 | The UI asks for `repo` and `read:org` | Align the UI with the guide when Settings changes for sign-in. |
| Q-16 | Two stories share ID 039 (X-17) | features/039-per-file-comment-filtering.md vs features/039-web-folder-open-local-images.md (untracked) | — | Renumber the web-folder story to 042, mark it Planned, and drop acceptance criteria 3 and 8 or rewrite them to match draft-store.ts. |
| Q-17 | The VS Code extension requests the broad `repo` scope, and no doc says so (X-7) | features/done/017:21 vs mardoc-vscode src/extension.ts:111 at `41088d5` | The app accepts whatever token the extension sends | Note the scope in features/done/017, and decide extension scopes in the sign-in L1. |
| Q-18 | Story 037 proposes AI keys in localStorage, but the shipped feedback-AI keeps keys in memory (X-18 area) | features/037:79,153 vs feedback-ai.ts:6 and data-and-security.md:43 | Feedback-AI key is memory-only | Follow the shipped precedent: memory-only keys. Update 037 when it is next picked up. |

## Proposed in-place edits (applied only with the owner's OK)

| Doc | Edit | Why |
|---|---|---|
| docs/data-and-security.md:15 | "Disconnect removes the saved key, but does not reset the module-level Octokit instance." → "Disconnect removes the saved key and clears the module-level Octokit client and the in-memory content, tree and image caches." | X-1; app-context.tsx:300-304, github-api.ts:33-41 |
| docs/data-and-security.md:31 and docs/known-issues.md:7 | Name all three viewers: HtmlViewer, the HTML path in DiffViewer, and the read-only RepositoryReference preview | X-2; RepositoryReference.tsx:53 |
| docs/data-and-security.md state table | Add `mardoc_user_repos` (removed on Disconnect) and `mardoc_feedback_ai` / `mardoc_feedback_ai_enabled` (cleared by Clear AI connection; key memory-only) | SettingsPanel.tsx:90,108; app-context.tsx:293; feedback-ai.ts:5,13 |
| docs/data-and-security.md:35 and docs/known-issues.md:9 | State that the `init` listener accepts messages from any sender (Q-11) | X-6 |
| docs/known-issues.md:19 (DATA-02) | Disconnect resets the Octokit client and session caches; it does not erase drafts or preferences | X-1 |
| docs/known-issues.md:23 (REVIEW-01) | Manifests and comments paginate, renames read `previous_filename`, and per-document failures show an error state; the PR list is still one page of 100 | X-9; github-api.ts:296-304,402,410,450-458 |
| docs/known-issues.md:29, :47 (REVIEW-02, NAV-01) | Mark "Closed in code since `4abb8f5`" with sources | X-10, X-11; app-context.tsx:451-465, hash-router.ts:24-58 |
| docs/known-issues.md:41 | `Editor.handleEditSubmitAsPR` → `Editor.handleSubmitEditsAsPR` | X-16; Editor.tsx:1236 |
| docs/architecture.md:45, :64 | List loading is guarded and abortable; route builders encode the branch and path segments | X-10, X-11 |
| docs/architecture.md:39, :41 | Activation loads only the revision and tree; the PR manifest paginates, and bodies load per selected file with error states | X-9, X-12 |
| docs/setup-github-pat.md:42 | Disconnect clears the in-memory client and caches | X-1 |
| docs/features/README.md | Join the 041 row to the table; refresh rows 007, 021, 024, 027, 033; list the web-folder story once renumbered (Q-16) | X-9 to X-13 |
| docs/features/done/024, 027, 033 | Refresh the status lines | X-9, X-10, X-13 |
| docs/comment-navigation-plan.md:211-216 | Marker section → shipped (#131) | X-13 |
| e2e/README.md:35-44 | Add the 10 unmapped specs | X-14 |
| docs/development.md | Add `npm run ci` and `npm run check` | X-15 |
| docs/html-inline-diff-delivery-plan.md:46 | Note the flag is now set in vitest.config.ts | X-15 |
| docs/README.md | Add performance.md and branch-links.md to the index; replace the `4abb8f5` headers with the commit actually checked when each doc is next fixed | X-18 |
| docs/application-audit.md, docs/html-inline-diff-delivery-plan.md | Archive to `docs/archive/` with a pointer from the index | Superseded |
