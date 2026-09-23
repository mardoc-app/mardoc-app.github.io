# Known issues and follow-up work

Source review: `4abb8f5`, 2026-09-23. Entries below are open unless explicitly changed. Documentation corrections do not close implementation issues. These are source-supported gaps; runtime reproduction and performance measurements are still needed where noted.

## SEC-01: HTML isolation

**Priority: first.** `HtmlViewer` and the HTML path in `DiffViewer` use `srcdoc` with `allow-scripts allow-same-origin`, contradicting the intended isolation of the PAT in parent localStorage. Document scripts remain active. See [data and security](data-and-security.md) and stories [031](features/done/031-html-document-rendering.md) / [033](features/done/033-html-inline-comments.md).

Closure requires a repaired boundary and real-browser tests demonstrating storage isolation while rendering, selection, resizing, and comments work. Include document resource policy, Markdown/PR-description HTML rendering, and iframe/extension message-source validation in the security review. No exploit against user credentials was performed in this audit.

## DATA-01: Draft and pending-review recovery

`draft-store.ts` excludes new/local files. `PRDetail` holds pending comments in React state; there is no durable pending-review queue or cross-device recovery. The local-file exclusion also affects the dirty signal used by navigation/embed reload guards. Storage failures silently skip persistence.

Define recovery and discard expectations for each document/review mode, then test refresh, navigation, and host reload. See [capabilities](capabilities.md) and [026](features/done/026-navigation-guard-unsaved-changes.md).

## DATA-02: Disconnect lifecycle

Disconnect removes saved token/repository keys, but does not reset the module-level Octokit client or erase stored drafts/preferences. Decide which state must be cleared and distinguish disconnect from local-data deletion. See [storage lifecycle](data-and-security.md).

## REVIEW-01: Incomplete PR loading and hidden content failures

`fetchPRFiles` and `fetchPRComments` request a single page of 100. Files are filtered to document types after fetching that first file page, so documents later in a large PR can disappear. Individual base/head fetch errors become empty strings and can look like full additions/deletions. Renamed files are fetched using the current filename for both versions; verify previous-path handling.

Closure needs pagination, explicit failure states, and coverage for large PRs, renamed documents, and failed content reads. Related: [024](features/done/024-github-api-error-handling.md).

## REVIEW-02: Stale PR list responses

`loadPRs` and asynchronous document-count enrichment update state without the generation checks used in other loads. Rapid repository/filter switches can receive old results. Reproduce with delayed responses and guard the whole update chain. Related: [027](features/done/027-concurrent-request-safety.md).

## REVIEW-03: Suggestions and review-PR branch semantics

`applySuggestion` replaces one range in the latest file without validating original text/version coordinates. Batch acceptance in a single commit and outdated-suggestion handling remain unfinished. `createReviewPR` creates a fresh default-branch-based review with a whitespace change; it does not reuse an existing PR from the selected branch. See [suggestions](features/done/010-suggested-changes.md) and [file reviews](features/done/003-comment-to-pr.md).

## EDIT-01: Conversion fidelity

HTML comments, unsupported HTML structures, table spans, and table-cell inline formatting can be lost during editing/serialization. The HTML round-trip unit helper omits TipTap, so its passing cases do not prove full editor preservation. Add meaningful full-pipeline cases before promising broader fidelity. See [018](features/done/018-html-in-markdown-roundtrip.md) and the [manual fixture](test-html-roundtrip.md).

## EDIT-02: Existing-file edit-to-PR save path

`Editor.handleEditSubmitAsPR` calls `createFileAsPR`, which branches from the default branch and calls `createOrUpdateFileContents` without an existing file SHA. That is a create-file request, even when the target already exists. GitHub requires the existing blob SHA for an update, so this path needs repair and an existing-file regression case before being treated as reliable editing support. The handler also appends `.md` to paths that do not end in `.md`, including `.mdx`. This finding comes from source review; no live repository write was performed. [GitHub file-update contract](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)

New-file conflict handling also lacks the originally proposed overwrite-choice flow. Preserve the intended target path and branch semantics explicitly in future save tests.

## NAV-01: Deep-link validation

`parseHash` decodes branch/path segments but can throw on malformed percent escapes and accepts numeric prefixes through `parseInt`. Invalid file indices can fall back to a PR route. `buildFileHash` does not encode branch/path segments, so branch names containing slashes need handling. Add malformed/encoded input cases and define fallback behavior. Related: [021](features/done/021-hash-router-url-decoding.md).

## PERF-01: Load and render baseline

PR document base/head reads are serial, and review rendering waits for all files plus comments. Repository initialization also serializes independent work. Large-document parsing, full block rendering, whole-document draft serialization, and overlapping comment refreshes merit profiling.

Measure the production export before changes. Track time to first readable file, switching/typing latency, long tasks, and API requests on desktop/mobile with cold/warm and slow-network runs. Then evaluate selected-file-first fetching, bounded concurrency, commit-addressed caching, and rendering improvements. No measured speedup is claimed.

## TOOL-01: Development and test maintenance

`npm start` uses `next start` despite static export; the lint script lacks a configured ESLint setup. E2E tests include fixed waits. Deployment and test workflows are independent. The current in-app/demo token help still differs from the updated [PAT guide](setup-github-pat.md). Track code/config/sample-copy cleanup separately from this documentation-only refresh.

## Product and integration gaps

HTML WYSIWYG editing, HTML word-level prose diffs, HTML suggestion parity, mobile swipe navigation, a tablet layout override, and AI translation are not complete product capabilities. App-side VS Code image/reload support exists, but extension-side status needs verification in its repository. See the [feature index](features/README.md).
