# 002: Branch Selector for File View

**Status: Implemented core.** Reviewed against `4abb8f5` on 2026-09-23.

Branch selection and tree/content loading exist in Sidebar and app-context.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value
Users can browse markdown files on any branch, not just the default branch. Useful for reviewing work-in-progress content without a PR.

## Acceptance Criteria
- Branch selector UI in the header or sidebar when viewing the file tree
- Fetches and displays available branches from the repo
- Switching branches reloads the file tree and file content for the selected branch
- Current branch is visually indicated
- Default branch is pre-selected on repo load

## Dependencies
- Relies on existing `fetchRepoTree(repo, branch)` which already accepts a branch parameter
- Relies on `fetchFileContent(repo, path, ref)` which already accepts a ref

## Implementation Notes
- Add `fetchBranches()` API call using `octokit.repos.listBranches()`
- Store `selectedBranch` in app context (distinct from `defaultBranch`)
- Pass `selectedBranch` to `fetchRepoTree` and `fetchFileContent`
- Image URL rewriting already uses the branch ref, so images will resolve correctly
