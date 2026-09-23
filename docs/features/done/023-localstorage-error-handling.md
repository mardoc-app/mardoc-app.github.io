# 023 — localStorage Error Handling

**Status: Implemented core.** Reviewed against `4abb8f5` on 2026-09-23.

Safe storage helpers catch access/quota errors. Persistence may silently fail; this does not guarantee recovery of unsaved work.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

The app crashes in private browsing mode or restricted browser contexts where `localStorage` throws `SecurityError` or `QuotaExceededError`. Users in these contexts can't use the app at all.

## Acceptance Criteria

- [ ] All `localStorage.getItem()` and `localStorage.setItem()` calls are wrapped in try-catch
- [ ] App degrades gracefully when localStorage is unavailable (works as if no saved state exists)
- [ ] Token, repo preference, and theme persistence all handle storage failures silently
- [ ] No unhandled exceptions in private browsing mode

## Dependencies

None

## Implementation Notes

- `app-context.tsx` lines ~127, 131-132, 210, 301 — raw localStorage access
- `ThemeContext` also uses localStorage for theme persistence
- Extract a `safeStorage` helper: `get(key)` returns `null` on error, `set(key, value)` is a no-op on error
