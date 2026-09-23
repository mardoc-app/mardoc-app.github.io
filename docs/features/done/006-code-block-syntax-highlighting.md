# 006: Code Block Syntax Highlighting

**Status: Implemented core.** Reviewed against `4abb8f5` on 2026-09-23.

Lowlight and CodeBlockLowlight are used in rendering/editor paths; dependency versions below are historical notes.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value
Code blocks in markdown files render with syntax colorization instead of plain monospace text. Makes technical documentation with code samples significantly more readable.

## Acceptance Criteria
- Code blocks with language hints (` ```python `, ` ```go `, etc.) render with syntax highlighting
- Minimum languages: Python, Go, Bash/Shell, JSON, YAML, JavaScript, TypeScript
- Auto-detection works for unlabeled code blocks (best-effort)
- Highlighting works in all views: Editor, Rendered Diff, Side by Side, Final view
- A highlight.js theme is applied that respects light/dark mode

## Implementation Notes
- All dependencies already installed: `lowlight@3.3.0`, `@tiptap/extension-code-block-lowlight@2.11.5`, `highlight.js@11.11.1`
- The `common` grammar set from lowlight includes all 7 requested languages plus ~28 more — no individual language imports needed
- In `src/components/Editor.tsx`: replace StarterKit's basic `CodeBlock` with `CodeBlockLowlight.configure({ lowlight })` where lowlight is created via `createLowlight(common)`
- Need to disable StarterKit's built-in `codeBlock` when adding `CodeBlockLowlight` (they conflict)
- Add a highlight.js CSS theme — pick one that works with both light and dark modes, or swap themes based on `useTheme()`
- Non-TipTap views (DiffViewer, etc.) that render HTML directly may need separate lowlight processing if they don't go through TipTap
