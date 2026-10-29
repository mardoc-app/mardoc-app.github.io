# 041 — Rendered HTML inline diff

Status: implemented core; browser validation pending in this environment.

## Implemented behavior

- HTML PRs default to one rendered document with word and block additions/deletions.
- Head styles and structure are retained; removed content is inserted in context. Revision-specific assets and source markers are retained.
- SVG text uses valid SVG markers. Titles, descriptions, alternative text, accessible names, link targets and constrained form text remain reviewable in Source Diff.
- A compact review bar provides a legend, change position, previous/next focus and scrolling, and clean head/base previews. The file sidebar provides navigation across changed pages.
- Selections containing removed text are rejected for new comments. Existing comment jumps select the appropriate clean revision.
- Source Diff uses an ordered line comparison, including changes without visible text equivalents.

## Boundaries

The engine compares static HTML structure and text. CSS/script behavior, runtime-generated DOM, raster image pixels and canvas are not visually compared. Other source changes remain inspectable in Source Diff. Moves can appear as deletion/addition. Generated document scripts may update or replace annotations. Revision switches reload the iframe and its scripts. Existing iframe isolation limitations documented in the known-issues register remain applicable.

## Validation

See [delivery plan](../archive/html-inline-diff-delivery-plan.md) for actual test/build results, worktree layout, and browser execution limitations. Source: `src/lib/html-diff.ts`, `src/lib/html-diff-navigation.ts`, `src/components/HtmlDiffToolbar.tsx`, and `src/components/DiffViewer.tsx`.
