# Application and documentation audit

Reviewed 2026-09-23 against commit `4abb8f5`.

**Historical audit snapshot:** documentation claims quoted below refer to the pre-refresh files. Current guidance is in the [documentation index](README.md); unresolved implementation work is tracked in [known issues](known-issues.md). Documentation corrections do not imply that the underlying code gaps were fixed.

This is a source-based audit of the repository, including the README, setup guide, feature stories, manual round-trip fixture, test documentation, implementation, and CI configuration. It does not certify the deployed site, current CI results, browser performance, or the separate VS Code extension. Dependencies were not installed and tests were not run for this documentation-only review. No application behavior was changed.

## Architecture and workflows

MarDoc is a static Next.js 14 / React 18 application. `next.config.js` exports `out/`; `.github/workflows/deploy.yml` publishes that directory to GitHub Pages. There are no application API routes or database in this checkout. GitHub is the persistent source of repository content and submitted reviews.

| Responsibility | Implementation | Current behavior |
| --- | --- | --- |
| Application state and navigation | `src/lib/app-context.tsx`, `hash-router.ts`, `src/app/page.tsx` | PAT connection, repository/branch selection, file and PR loading, hash deep links, navigation guards, demo data, and extension messages. |
| GitHub access | `src/lib/github-api.ts` | Browser-side Octokit REST **and GraphQL** calls; repository trees/content, PRs, comments, thread resolution, commits, image uploads. |
| Markdown editing | `src/components/Editor.tsx`, `src/lib/turndown.ts` | Showdown → HTML → TipTap; Turndown converts editor HTML back to Markdown. Raw code view is another editing surface. |
| Markdown review | `src/components/PRDetail.tsx`, `DiffViewer.tsx`, `src/lib/diff-blocks.ts` | Block alignment and word diffs; inline, split, suggest, and preview modes; source-line mapping for review comments. |
| HTML documents | `src/components/HtmlViewer.tsx`, HTML paths in `DiffViewer.tsx` | Rendered `srcdoc` iframe, source display/diff, base/head comparison, injected selection and resize scripts. Standalone HTML is not routed through the WYSIWYG editor. |
| Review collaboration | `PRDetail.tsx`, `github-api.ts`, `comment-merge.ts`, `review-fallback.ts` | Local pending comments; explicit review submission; replies, resolution, suggestion application; 30-second comment polling and delayed post-write refreshes. |
| Images and diagrams | `github-api.ts`, `image-upload.ts`, `mermaid.ts` | Relative GitHub image rewriting, authenticated image reads, in-memory image caches, paste/drop uploads, lazy-loaded Mermaid with source preservation. |
| Browser persistence | `draft-store.ts`, `safe-storage.ts`, `app-context.tsx` | PAT, selected repository, preferences, and eligible editor drafts in localStorage. This is not an encrypted document vault or a complete offline repository cache. |
| Mobile and embedding | Mobile components, `use-viewport.ts`, embed helpers | Width-based mobile layout below 768px; separate VS Code postMessage integration for local files, images, and reload. Extension implementation is outside this repository. |

The normal flow is connect → select repository and branch → read/edit a document or open a PR → review rendered content → submit comments or commit changes to GitHub. Creating/editing documents can create branches and PRs. Accepting a suggestion commits to the PR branch. Existing-file image paste commits immediately to the selected branch; images for an unsaved new document are deferred until its save flow.

## Documentation findings

### 1. Critical: the documented HTML isolation guarantee is contradicted by code

`docs/features/done/031-html-document-rendering.md` marks token isolation complete and documents `sandbox="allow-scripts"`. Story 033 explicitly says `allow-same-origin` would break that guarantee and excludes changing the flags.

Both actual viewers use `sandbox="allow-scripts allow-same-origin"`: `src/components/HtmlViewer.tsx:379` and `src/components/DiffViewer.tsx:1131`. They retain document scripts in `srcdoc`. The app stores the PAT in origin-local localStorage (`app-context.tsx`, `TOKEN_KEY`).

For same-origin embedded content, this combination does not isolate scripts from the parent origin. The token-isolation claim must not be relied upon. This conclusion follows from the code and [documented browser sandbox behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox); no exploit was executed against user data. Fixing the rendering boundary deserves priority over performance changes, followed by real-browser tests proving document scripts cannot read parent storage while selection and commenting still work.

### 2. Privacy wording promises more than the architecture provides

The README says “No data leaves your browser”; the PAT guide says the token “never leaves your machine.” GitHub requests transmit the token to GitHub, and submissions transmit content and comments. HTML can load external scripts/assets, and remote Markdown images also generate network requests.

The accurate distinction is that MarDoc has no application backend receiving those credentials or documents. Document-defined external resources are a separate network boundary. Document storage should distinguish localStorage, temporary in-memory state, browser-managed network caching, and GitHub persistence.

Disconnect currently removes the saved token and repository preference, but does not clear stored drafts or reset the module-level Octokit instance. Document this lifecycle and decide whether disconnect should also clear sensitive in-memory state. It is not currently a comprehensive “erase local data” action.

### 3. Authentication setup contains obsolete and incomplete instructions

- `.env.example` describes Auth0 SPA setup and `NEXT_PUBLIC_AUTH0_*` variables. No matching integration exists in application source or dependencies. Replace this example with the actual no-environment-variable PAT setup, or remove it.
- `docs/setup-github-pat.md` lists fine-grained **Contents: Read**. Reading is sufficient for browsing, but editing, accepting suggestions, and image uploads call `repos.createOrUpdateFileContents`, which requires **Contents: Write**. See [GitHub's endpoint permissions](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents). The guide needs permissions grouped by workflow.
- The README says REST only; the code also uses GraphQL for document counts and review-thread state.
- The README's one-scope quick start does not match the PAT guide and Settings UI, which additionally discuss `read:org` and SSO. Consolidate these instructions and distinguish organization policy requirements from application requirements.

### 4. README feature claims need narrower scope

| Claim | Evidence and needed correction |
| --- | --- |
| Every feature works in demo mode | `Editor.tsx:595` explicitly rejects image upload in demo mode; several write handlers return early. Describe demo capabilities and disabled operations. |
| Markdown and HTML are editable through the same rich workflow | `page.tsx` routes HTML to `HtmlViewer`, which provides viewing/commenting, not WYSIWYG editing. Four review modes describe Markdown; HTML has Rendered and Source Diff. Story 033 already lists HTML editing and suggestion parity as future work. |
| Autosave protects work across refreshes | `reconcileDraft` and `resolveDraftOnLoad` skip new/local files. Pending PR review comments live in React state, without draft persistence. Document which work is recoverable and which is not. |
| Conversion loses no formatting | `html-roundtrip.test.ts` explicitly expects failure for HTML comments and table colspan. Its helper omits TipTap, so passing converter tests do not prove the full editor round-trip. `turndown.ts` also serializes table cells through `textContent`, losing inline formatting there. |
| One review notification for all comments | The normal path batches a review; line-resolution failures fall back to individual inline/issue comments in `submitReviewBatched`. Document normal batching and the fallback rather than guaranteeing notification counts. |
| `npm test` is clean on every merge | Workflows run tests, but this checkout cannot establish current results or repository branch protection. Deployment runs independently on a push to main and has no dependency on the test workflow. A fixed “560+” count is also weaker evidence than a current CI result. |

### 5. Test documentation and scripts disagree with the static deployment

`e2e/README.md` says CI uses `next start`. The actual Playwright configuration correctly serves `out/` with `npx --yes serve out -l 3000 --no-clipboard`. Its opening comment is stale too. `package.json` still exposes `npm start` as `next start`, which conflicts with the static-export configuration.

The E2E guide describes only Chromium; configuration includes Desktop Chrome and iPhone 14/WebKit. Its no-sleep rule is not consistently followed (`waitForTimeout` occurs in shared helpers and several suites). Refresh the guide to describe the actual browser matrix, fixtures, installation prerequisites, and static server command; treat sleep removal as separate test maintenance.

### 6. Feature stories mix historical proposals with current specifications

The README says stories move to `done/` when shipped, but location and checkboxes are not reliable status indicators:

- **039 per-file filtering:** all criteria are checked, `PRComment.path` exists, and filtering plus unit/E2E coverage are present. The opening “missing path” diagnosis is historical, yet the story remains outside `done/`. It also says “five” modes while listing four.
- **040 embed reload:** app-side helpers, message handling, toolbar action, editor reload nonce, and tests exist, but the story remains entirely unchecked. Record app-side implementation separately from unverified extension-side delivery.
- **020–023, 025, 028, 029, 033:** several documents in `done/` still have unchecked criteria and future-tense implementation plans. Update each from evidence rather than checking every box automatically. For example, 029 still has a no-op `onContentChange` prop in `page.tsx`.
- **018 round-trip fidelity:** a shipped folder location overstates broad HTML preservation; known failures remain and the documented full TipTap test pipeline is absent from its converter test helper.
- **038 mobile:** swipe navigation and a tablet override remain unchecked. Its claim that the pending review queue lives in GitHub and already syncs across devices conflicts with `PRDetail`'s local pending state. The viewport hook has two width buckets, not the proposed three buckets/user-agent detection. Its reference to “039 — PWA” conflicts with the actual story 039.
- **010 suggested changes:** batch acceptance in one commit and outdated-line protection are listed as acceptance criteria, but the current `applySuggestion` takes one range and replaces lines in the latest file. No original-text/version validation appears in that function; the write SHA protects the subsequent write race, not the validity of old suggestion coordinates.
- **024 error handling:** whole-PR fetch failures reach the UI, but individual base/head content fetch failures still become empty strings in `fetchPRFiles`. The checked criterion is too broad.
- **027 concurrent requests:** generation guards exist for several loads, but `loadPRs` and its asynchronous count enrichment mutate state without a generation check. Its “no stale state” criterion is stronger than the implementation.
- **037 AI translation:** remains a proposal, consistent with unchecked criteria and absent provider implementation. It needs an explicit planned status; its present-tense sections should not be read as shipped features.
- Two distinct stories use **010**. Stable unique identifiers and explicit status fields would make future references less ambiguous.

`docs/test-html-roundtrip.md` is useful as a manual fixture and correctly names known limitations, but it is not proof of end-to-end editor fidelity. Design/demo HTML files likewise should be identified as prototypes or fixtures, not current application specifications.

## Initial performance and correctness backlog

These are source findings and profiling candidates, not measured performance results.

| Priority | Finding | Next step |
| --- | --- | --- |
| First | HTML scripts share the application origin despite the documented isolation contract. | Restore a tested isolation boundary; validate storage isolation, message-source checks, selection, resize, and comments. |
| High | `fetchPRFiles` fetches each document's base then head serially, across every document. `_openPRInternal` waits for files and comments together before displaying review. | Measure time to first readable file; load the selected document first, use bounded concurrency, and cache immutable content by repository/path/commit SHA. |
| High | PR file and comment endpoints request one page of 100 without pagination. Individual content errors become blank content. | Add pagination and explicit unavailable-content states; test large PRs, renamed files, and failed fetches. Blank content can misleadingly look like a full-file addition/deletion. |
| High | PR list/count loads can update state after repository/filter changes. | Extend generation checks through the complete load and enrichment path; reproduce rapid switching with delayed responses. |
| High | Pending review comments and new/local drafts lack the same persistence as existing-file editor drafts. | Define recovery expectations and test refresh/navigation before broadening autosave claims. |
| Medium | Repository selection awaits default branch, tree, PR list, then branch list; branch listing fetches metadata again. | Parallelize independent reads and reuse metadata. The existing “Load PRs and branches in parallel” code comment is stale. |
| Medium | `DiffViewer` parses base/head blocks in multiple memos and renders full document block lists; editor updates serialize the whole document after a 300ms debounce. | Profile large prose, tables, images, and Mermaid documents before choosing memoization, incremental work, or virtualization. |
| Medium | Comments poll every 30 seconds; each write can schedule three extra refreshes. | Measure requests per active review and overlap; consider visibility-aware polling and refresh coalescing. |

Benchmark the production static export, not just the development server. Capture repository-open latency, time to first PR document, file-switch latency, typing response, long tasks, and API request counts. Include cold/warm loads, slow connections, multi-document PRs, large documents, and mobile. Existing image stability and Mermaid tests are useful regression assets, but do not establish a speed baseline.

## Suggested documentation maintenance

Keep the README focused on verified user capabilities. Add a maintained architecture/storage/trust-boundary reference, workflow-specific authentication permissions, and a capability matrix for Markdown versus HTML, demo versus connected, and browser versus extension. Give stories explicit planned/partial/shipped status and separate original proposals from final implementation notes. Link claims to the relevant tests without treating test presence as proof that every user-facing promise is satisfied.

The browser-only hosting architecture is already in place. The immediate work is to make the isolation and persistence contracts accurate, then improve loading and rendering without introducing a backend.
