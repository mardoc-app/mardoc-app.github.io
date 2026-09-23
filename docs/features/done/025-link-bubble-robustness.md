# 025 — Link/Image Bubble Robustness

**Status: Implemented core; criteria review pending.** Reviewed against `4abb8f5` on 2026-09-23.

LinkImageBubble and regression tests exist. Historical acceptance criteria do not certify all rerender/positioning edge cases.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

The link/image edit bubble has edge cases: it holds a stale DOM reference that can cause wrong positioning after re-renders, and it can overflow the right edge of the viewport for links near the right margin.

## Acceptance Criteria

- [ ] Bubble validates that its target element is still in the DOM before positioning
- [ ] Bubble is constrained to the container's right edge (no viewport overflow)
- [ ] Bubble repositions correctly if the editor content re-renders while open
- [ ] Bubble dismisses if its target element is removed from the DOM

## Dependencies

None

## Implementation Notes

- Editor.tsx `LinkImageBubble` stores `target.element` — a raw DOM ref that can go stale
- Positioning uses `getBoundingClientRect()` without checking element is still mounted
- Left position has `Math.max(0, ...)` but no right-edge constraint
- Add: check `document.contains(target.element)` before positioning; add `Math.min` for right edge
