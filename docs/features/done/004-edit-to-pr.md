# 004: Edit File and Submit as PR

**Status: Partial.** Reviewed against `4abb8f5` on 2026-09-23.

Editor provides dirty tracking and an edit-to-PR UI, but the existing-file save path uses a new-file helper without an update SHA. See EDIT-02.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value
Users can edit markdown files directly in the Editor and submit changes as a PR. Turns mardoc into a full propose-changes workflow — edit content, preview it rendered, submit for review.

## Acceptance Criteria
- Editor changes are tracked as a dirty state (modified vs original content)
- "Submit as PR" action creates a new branch, commits the edited file, and opens a PR
- User can provide a PR title/description before submitting
- Works from any branch (edits on default branch create a new feature branch)
- After PR creation, user is shown the PR link

## Dependencies
- 002 (Branch Selector) — useful but not strictly required; edits on default branch can auto-create a feature branch

## Implementation Notes
- Editor already has `onContentChange` wired up — need to convert HTML back to markdown (or store the raw markdown and track edits)
- GitHub API: create branch via `git.createRef()`, update file via `repos.createOrUpdateFileContents()`, then `pulls.create()`
- Consider markdown round-trip fidelity — editing in TipTap and exporting back to markdown may lose formatting. May want a raw markdown editing mode as an alternative.
