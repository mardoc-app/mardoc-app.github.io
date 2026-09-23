# 031 — HTML Document Rendering

**Status: Partial; isolation gap open.** Reviewed against `4abb8f5` on 2026-09-23.

HTML viewing and PR source/rendered modes exist. Actual sandbox flags include allow-same-origin; the intended token-isolation criterion is NOT met. See SEC-01.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

AI-generated HTML documents (research reports, cost analyses, architecture guides) are beautiful, self-contained files with custom CSS, mermaid diagrams, and rich layouts. But checking them into GitHub for PR review means reviewers see raw HTML source — they can't see the rendered document, judge content correctness, or comment meaningfully. MarDoc already solves this for markdown; extending to HTML makes these documents reviewable.

## Acceptance Criteria

- [x] HTML files (`.html`, `.htm`) appear in the sidebar file tree alongside markdown files
- [x] HTML files appear in PR changed-files lists
- [x] Clicking an HTML file renders it in a sandboxed iframe with full CSS/JS support
- [x] Mermaid diagrams via CDN render correctly inside HTML documents
- [x] "View Source" toggle shows the raw HTML
- [x] Fullscreen toggle available for HTML viewer
- [x] PR DiffViewer shows "Rendered" (iframe) and "Source Diff" modes for HTML files
- [x] Base/Head toggle in rendered mode lets reviewers compare versions
- [ ] GitHub token is not accessible from the iframe — intended criterion, currently unmet (SEC-01)
- [x] Demo mode includes a sample HTML file and a mock PR with HTML changes
- [x] Relative asset URLs rewritten to raw.githubusercontent.com for repo files
- [x] Existing markdown rendering is not affected

## Dependencies

None — builds on existing infrastructure.

## Implementation Notes

**File type gates** (`src/lib/file-types.ts`):
- Shared helpers: `isDocumentFile()`, `isHtmlFile()`, `isMarkdownFile()`
- Used in `github-api.ts` (tree, PR files, PR counts) and `Sidebar.tsx` (file input, empty states)

**HtmlViewer** (`src/components/HtmlViewer.tsx`):
- Intended design: `<iframe srcdoc={content} sandbox="allow-scripts" />`. Current code adds `allow-same-origin`, so the intended parent-storage isolation is not met.
- Resize script injected via postMessage for auto-height
- Asset URL rewriting for relative paths in repo context

**DiffViewer HTML support** (`src/components/DiffViewer.tsx`):
- `isHtmlFile` detection at component level
- Two HTML-specific view modes: Rendered (iframe with base/head toggle) and Source Diff (line diff)
- Markdown-specific processing (Showdown, mermaid blocks) skipped for HTML files

**Routing** (`src/lib/app-context.tsx`, `src/app/page.tsx`):
- New `ViewMode: "html-viewer"` routes HTML files to HtmlViewer instead of Editor
- All file-opening paths (openFile, openLocalFile, VS Code embed) detect HTML
