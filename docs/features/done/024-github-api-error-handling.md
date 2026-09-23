# 024 — GitHub API Error Handling and Resilience

**Status: Partial.** Reviewed against `4abb8f5` on 2026-09-23.

Retry/backoff, rate-limit tracking, and error formatting exist. Individual PR content failures still become empty strings; see REVIEW-01.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

GitHub API calls have no retry logic, no rate limit handling, and swallow errors silently. Transient network blips break the app. Expired tokens fail without feedback. Rate limiting (429) causes cascading failures with no recovery path.

## Acceptance Criteria

- [x] Retry with exponential backoff for transient failures (network errors, 5xx responses) — withRetry helper + Octokit hook.wrap
- [x] Rate limit (403/429) responses are caught via circuit breaker; x-ratelimit-remaining/reset headers tracked on every response; 30s poll and propagation hedge skip when rate-limited
- [x] Auth failures (401) surface a clear message prompting re-authentication via formatApiError
- [x] `atob()` base64 decoding is wrapped in try-catch with a clear error message and whitespace stripping
- [x] GraphQL queries use proper variable substitution — owner/repo are passed as typed variables, PR numbers validated as safe integers
- [ ] All PR file load errors surface to the user — outer failures surface, but individual base/head content failures are still swallowed
- [x] `loadAuthenticatedImages` failures show a broken-image indicator (mardoc-image-failed class with dashed red border and alt text)

## Dependencies

None

## Implementation Notes

- Extract a `fetchWithRetry` wrapper that handles backoff, rate limits, and auth errors
- GraphQL: use `octokit.graphql()` with `{ owner, repo }` variables instead of template literals
- `fetchPRFiles` (lines ~305-318) catches errors and defaults to empty string — surface these
- `loadAuthenticatedImages` uses `Promise.allSettled` — add fallback UI for rejected images
- `fetchPRMarkdownCounts` in app-context is fire-and-forget with no `.catch()` — add one
