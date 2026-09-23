# 021 — Hash Router URL Decoding

**Status: Partial.** Reviewed against `4abb8f5` on 2026-09-23.

Branch/path decoding exists; malformed escapes, numeric validation, fallback routes, and route-builder encoding still need work. See NAV-01.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

Files and branches with spaces, special characters, or URL-encoded segments can't be navigated to via deep links. This breaks the core navigation contract for repos with non-ASCII paths.

## Acceptance Criteria

- [ ] File paths in hash routes are decoded with `decodeURIComponent()`
- [ ] Branch names in hash routes are decoded with `decodeURIComponent()`
- [ ] PR number validation rejects non-numeric values explicitly
- [ ] Malformed routes (e.g., `/pull/123/files/abc`) don't silently fall through to wrong views
- [ ] Deep links with encoded spaces (`%20`), slashes, and unicode characters resolve correctly

## Dependencies

None

## Implementation Notes

- `hash-router.ts` line 37: `filePath = parts.slice(4).join("/")` — no decoding
- Line 36: branch name not decoded
- Line 43: `parseInt` on PR number doesn't validate NaN properly
- Lines 41-48: malformed `/files/{garbage}` falls through silently to repo route
