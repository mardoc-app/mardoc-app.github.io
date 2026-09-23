# 011: Sync Comment Resolution Status from GitHub

**Status: Implemented core.** Reviewed against `4abb8f5` on 2026-09-23.

Thread resolution is read via GraphQL and merged during comment refresh; resolve/unresolve mutations exist.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value
When a reviewer resolves or unresolves a conversation on GitHub, that status is reflected in mardoc.app. Currently resolution only works locally — the poll picks up new comments and replies but not resolve/unresolve actions.

## Acceptance Criteria
- Resolved threads on GitHub appear as resolved in mardoc.app
- Unresolving a thread on GitHub re-opens it in mardoc.app
- Resolving in mardoc.app resolves the thread on GitHub (bi-directional)
- Status syncs within the polling interval (30s)

## Implementation Notes
- GitHub REST API (`pulls.listReviewComments`) does not expose thread resolution status
- Need to use GitHub GraphQL API: `pullRequest { reviewThreads { isResolved, comments { nodes { databaseId } } } }`
- Match threads to existing comments via `databaseId` ↔ `githubId`
- Could add a lightweight GraphQL query alongside the existing REST poll, or replace the REST fetch entirely
- Resolving from mardoc.app → GitHub requires `resolveReviewThread` GraphQL mutation (takes `threadId`)
