# 001: Render Final Markdown View with Comments

**Status: Implemented core.** Reviewed against `4abb8f5` on 2026-09-23.

Preview mode provides a head-content reading surface in DiffViewer; the original proposed mode names below are historical.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value
Users can view the final rendered markdown (head version only, no diff) for PR files, with full commenting ability. Currently the PR view only offers "Rendered Diff" and "Side by Side" — there's no clean read-through of the final document.

## Acceptance Criteria
- New view mode alongside "Rendered Diff" and "Side by Side" (e.g. "Final" or "Rendered")
- Shows only the head content rendered as markdown — no diff highlighting, no base content
- Full commenting support: select text, add comments, view in side panel
- Comments map to line numbers in the head content for GitHub API integration

## Implementation Notes
- Add a third `viewMode` option in DiffViewer
- Reuse existing `headBlockToHtml` rendering and comment infrastructure
- Simpler than diff view — just render `file.headContent` as a single document
