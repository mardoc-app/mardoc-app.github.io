# Rendered HTML inline diff delivery

Status: implemented locally; browser validation pending due to environment restrictions. Baseline: locally cached `origin/main` at `7d2e522` (2026-10-14). A network fetch failed because GitHub DNS was unavailable.

## Goal

Review HTML changes in one rendered document, preserving its design while showing additions in green and deletions in red with strikethrough. Inline diff is the default HTML PR review mode. Clean head/base previews and the source diff remain available.

## Worktree cleanup

The previous `worktree-b14b690b` checkout was clean and removed. Its two commits remain on local and remote-tracking `feat/html-comment-markers`; the branch was preserved because its commits are not ancestors or patch-equivalent commits of cached main. Two missing temporary worktree records were pruned. Main was fast-forwarded to cached origin/main.

## Delivery streams

| Stream | Branch / worktree | Owner | Deliverable |
| --- | --- | --- | --- |
| HTML comparison | `feat/html-diff-engine` / `html-diff-engine` | Engine sub-agent | DOM comparison, word/block annotations, SVG labels, nonvisual metadata changes, scoped styles |
| Review controls | `feat/html-diff-controls` / `html-diff-controls` | Controls sub-agent | Diff/head/base toolbar, legend/count, change navigation, changed-page list |
| Browser coverage | `feat/html-diff-browser` / `html-diff-browser` | Browser sub-agent | Integrated desktop/mobile review scenarios |
| Integration | `feat/html-inline-delivery` / `html-inline-delivery` | Primary agent | Viewer wiring, source-line/comment compatibility, documentation, validation and combined delivery |

Worktrees live in `mardoc-app.github.io-worktrees/`. Independent streams commit to their branches; integration merges them into the delivery branch. Existing branch commits are retained during cleanup.

## Implementation sequence

1. Parse both HTML revisions, match corresponding nodes, and annotate text changes without diffing raw markup. Use the head document as the layout and style baseline. Preserve source attributes; identify removed content explicitly.
2. Add valid markers for whole elements and SVG text. Surface changed titles, descriptions, alternative text, and accessible names in a review summary.
3. Integrate default inline diff, clean head/base previews, sticky controls, navigable change regions, and a list of changed HTML pages in the PR.
4. Keep new comments tied to head source lines. Reject removed or mixed-revision selections; existing comment jumps use clean revision previews to preserve precise quote matching.
5. Exercise focused unit/component and browser scenarios, then the existing unit suite and static build. Record actual results and limitations here.

## Acceptance criteria

- Word replacements show adjacent removed and added text within the page's own typography.
- Added and deleted sections, list items, and table content are visible in context.
- Inline markup, links, head styles, and source-line attributes remain usable.
- SVG labels use SVG-compatible annotations; nonvisual text changes have a visible summary.
- Change count and previous/next navigation refer to deterministic change regions; navigation opens containing details where needed.
- Controls work on desktop and mobile, with accessible button names and a changed-page list.
- Clean head/base and source modes remain available, and new head selections still produce correct comment ranges.
- Script and stylesheet source changes are available in Source Diff. Runtime-generated DOM, canvas/raster image comparison, and pixel/layout comparison are not part of the structural diff.

## Validation and delivery evidence

- Independent streams were merged into `feat/html-inline-delivery`. The combined branch includes the engine, toolbar/navigation, browser scenarios and viewer/comment integration.
- Final unit suite: `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run` passed all 73 files: 1,024 passing tests and 5 existing expected failures (1,029 total). The Node 26 host exposes an incompatible experimental storage global by default; the flag allows jsdom's storage implementation to work. The repository recommends Node 22.
- TypeScript validation and static export succeeded in the offline build described below.
- A normal `npm run build` could not fetch the existing Fraunces Google Font because DNS/network access is unavailable. The static build succeeded with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/private/tmp/mardoc-font-responses.cjs npm run build`, using actual font files already cached in the main checkout. The temporary response file and font substitution were not committed; no production font configuration was changed.
- Six new browser scenarios cover desktop and mobile (12 configured cases). Existing HTML comment-jump scenarios explicitly choose clean head preview when checking live-node/script preservation.
- Browser execution could not start: local servers fail with `listen EPERM` on both `0.0.0.0:3100` and `127.0.0.1:3100`. A separate browser-launch probe also failed with macOS Mach port permission denied. No browser scenarios or visual layout checks are claimed as passed.
- Review found and corrected raw-text/form-control markup corruption and missing whitespace highlights in preformatted text, with regression tests.
- GitHub fetch failed with `Could not resolve host: github.com`; the delivery is committed locally, with no remote publication or deployment.

## Remaining validation

On a host permitting browser execution and network access, run `npm ci` under Node 22, `npm run build`, then `npm run e2e -- e2e/html-inline-diff.spec.ts e2e/html-comment-jumps.spec.ts e2e/iframe-resize.spec.ts`. Inspect real project HTML, including scripted slide decks, for generated DOM and layout interactions outside the static comparison contract.
