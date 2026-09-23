# 028 — PR Description Display

**Status: Partial.** Reviewed against `4abb8f5` on 2026-09-23.

PR descriptions render through Showdown. The proposed sanitization step is not implemented; no general sanitization guarantee should be inferred.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

PR descriptions are never rendered in the PR detail view. The container div exists but is empty. Users can't read PR descriptions without opening GitHub.

## Acceptance Criteria

- [ ] PR descriptions render as formatted markdown in the PR detail view
- [ ] Long descriptions are scrollable or collapsible
- [ ] Empty descriptions show nothing (no empty box)
- [ ] Links in descriptions are clickable

## Dependencies

None

## Implementation Notes

- PRDetail.tsx line ~392 has an empty `<div>` with `.prose` classes
- `pr.description` exists in the data model but isn't rendered into the div
- Use Showdown to convert markdown description to HTML, render with `dangerouslySetInnerHTML`
- Sanitize with DOMPurify before rendering (descriptions are user-supplied)
