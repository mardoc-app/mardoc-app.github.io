# 042 — Web Folder Open (Local Markdown with Sibling Images)

**Status: Planned.** Renumbered from 039 on 2026-10-21 (Q-16). Nothing in `src/` implements it at `2b94d90`.

## Value

Today a user on `mardoc.app` can open a single local markdown file via the
sidebar file picker. The text renders, but any `<img src="./images/foo.png">`
reference 404s — the browser's file-input API gives us that one File blob
and nothing else, so sibling images on disk are invisible. The only current
workaround is to use the VS Code extension (which has real filesystem APIs)
or push the file to GitHub.

This story delivers parity with the VS Code embed for **read**: a user
opens a folder, picks a markdown file from within it, and sibling images
render inline exactly as they do in the extension. It's the minimum
credible story for "MarDoc is usable on the web with local files" — without
it, the local-file flow on `mardoc.app` is misleading (text loads, images
silently break).

## Acceptance criteria

1. Sidebar has an **Open folder** action alongside the existing Open file
   picker. On desktop browsers that support `webkitdirectory` (all modern
   browsers do), clicking it lets the user pick a directory.
2. After picking a folder, the sidebar tree lists the markdown and HTML
   files found in it (recursively), rooted at the folder name.
3. Clicking a file in that tree opens it in the editor, same flow as the
   existing single-file open. Files open under the `__local__/` prefix,
   which the draft store excludes, so local edits are not autosaved
   (`draft-store.ts:118, 147`; matches the existing single-file open).
4. Relative image paths (`./images/x.png`, `../assets/y.jpg`) resolve
   against the opened file's directory and render from the FileList as
   blob URLs — matches the behavior of the VS Code embed.
5. References that escape the picked folder (`../../outside/foo.png`)
   show a clear placeholder with an explanatory tooltip: "Image is outside
   the opened folder — pick a higher-level folder to include it." No
   silent 404s, no misleading broken-image glyph.
6. Switching between files in the same opened folder preserves the
   FileList; the user doesn't have to re-pick the folder on every file
   change.
7. Opening a *new* folder (via the Open folder action again) replaces the
   existing FileList — no leaked blob URLs, no stale image sources from
   the prior folder.
8. Reloading the page loses the opened folder (the FileList is
   in-memory only). The sidebar shows the empty state with the Open
   folder action available again. Unsaved local edits are lost, because
   the draft store excludes `__local__/` paths.

Out of scope for this story: writing changes back to disk. See "Follow-up"
below.

## Implementation notes

### Sidebar wiring (`src/components/Sidebar.tsx`)

Add a second button next to the current Open file control that renders a
hidden `<input type="file" webkitdirectory multiple>`. The change handler
receives `e.target.files` as a `FileList`. Filter to markdown/html files
for the tree; keep the full FileList in app-context so the image loader
can find non-markdown siblings.

### App context (`src/lib/app-context.tsx`)

Introduce `localFolderFiles: FileList | null` and a setter. Revoke any
previously-created blob URLs before replacing it, to avoid leaks when
the user opens a second folder. The existing `openLocalFile` flow
continues to work for the single-file case; folder open is additive.

### Image loader (`src/lib/github-api.ts` → `loadEmbedLocalImages`)

Today this loader has two branches: "not in an iframe, do nothing" and
"in a VS Code webview, ask the extension for bytes". Add a third branch:
"have a local FileList in context, resolve the relative path against the
current file's directory, find the matching File, and swap `img.src`
with a blob URL".

Path resolution:

- `webkitRelativePath` includes the top-level folder name as its first
  segment (e.g. `myproject/docs/guide.md`). Strip that prefix when
  comparing to the app's `__local__/`-scoped paths.
- Resolver logic is segment-based: pop on `..`, push on anything else,
  stop if the resolved path goes negative (i.e. would escape the picked
  folder). Returns `null` on escape; loader shows the placeholder.

### Blob URL lifecycle

Create lazily in the loader. Track created URLs per-open-folder in a
WeakMap (or a plain Map indexed by path), so replacing the FileList can
revoke them all. Revoke on folder-change and on app unmount.

### Tree rendering

Sort markdown/html files by path. Group by directory; render nested
disclosure arrows. The same data model the repo-browsing sidebar already
uses should absorb this with minimal special-casing.

## Security & privacy considerations

- **Scope is the picked folder, period.** We never read files outside
  the FileList the user handed us. That's enforced by the browser; we
  don't need our own sandbox.
- **No upload.** File bytes stay in the browser — nothing is sent to
  `api.github.com` or to `mardoc.app` servers (of which there are none
  — it's static hosting).
- **Blob URLs are same-origin.** `URL.createObjectURL` produces
  `blob:https://mardoc.app/<uuid>` URLs readable only from this origin.
  They don't leak the local file path.
- **Draft scoping.** Continues to use the existing `__local__/<path>`
  prefix so local drafts never collide with GitHub-scoped drafts even
  when paths match (e.g. a local `README.md` vs a repo's `README.md`).

## Follow-up (explicitly deferred)

**Writing back to disk** requires the File System Access API
(`showDirectoryPicker` → `FileSystemDirectoryHandle` →
`getFileHandle({ create: true })` → `createWritable()`). That API is
Chrome/Edge only and adds a permission-prompt UX layer. For v1 we rely on
the existing browser-download "save as" fallback: no in-place save from
the web; users who want write support use the VS Code extension.

A future story can introduce a second folder-open path that requests a
directory *handle* instead of a FileList, unlocking saves for
Chrome/Edge users while keeping the FileList path as the universal
fallback. That's a feature on top of this one, not a prerequisite.
