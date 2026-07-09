# 040 — Reload From Disk (VS Code Embed Mode)

## Value

When MarDoc runs inside the VS Code extension, the document shown is a snapshot: the extension read the file once at panel-open time and posted it via `init`. If the file changes on disk afterward — the dominant case being an AI agent iterating on a design doc while the human reads it in MarDoc — there is no way to see the new content short of closing and reopening the panel.

The document follows the file, the way VS Code's built-in Markdown Preview and Live Preview do: the extension **watches the open file and pushes fresh content automatically** when it changes on disk (never clobbering unsaved MarDoc edits), and a **refresh icon on the panel title bar**, a **reload button in the app's top bar**, and a command-palette entry provide explicit reload. `Ctrl/Cmd+Shift+R` is layered on as a best-effort convenience — keystrokes inside the webview iframe are unreliable by construction (see `docs/webview-embed-model.md` in mardoc-vscode) and are never the primary trigger.

## Design

### Message protocol (two new types)

Follows the existing `file:save` / `file:read-image` / `file:image-data` naming:

- **`file:reload`** (app → extension): "re-read the current file and send it back." No payload.
- **`file:content`** (extension → app): `{ type, filePath, fileName, fileContent }` — fresh bytes from disk.

Both types must be added to the webview wrapper's forwarding whitelists in `mardoc-vscode/src/extension.ts` (`getWebviewHtml`), which relay messages between the iframe and the extension host.

### Keystroke routing

Mirrors the existing Cmd+W precedent (iframe-side capture handler + VS Code keybinding):

- **App side (primary):** a capture-phase keydown listener in `app-context.tsx`, active only in embed mode, catches `Ctrl/Cmd+Shift+R`, `preventDefault()`s (suppressing browser hard-reload inside the webview), and posts `file:reload` to the parent. Outside embed mode the browser's native `Cmd+Shift+R` is untouched.
- **Extension side (secondary):** a `mardoc.reloadFile` command bound to `ctrl+shift+r` / `cmd+shift+r` with `when: activeWebviewPanelId == 'mardoc'`, covering the case where the panel is active but focus is outside the iframe. Also reachable from the command palette as "MarDoc: Reload File".

### Extension: knowing which file to re-read

`setupPanel` gains an optional `fileUri` param (passed by `mardoc.openFile`; absent for the repo-browser `mardoc.open` panel, where reload is a no-op). A module-level `Map<WebviewPanel, Uri>` tracks panel → file so the `mardoc.reloadFile` command can service whichever MarDoc panel is active. On `file:reload` (or the command), the extension re-reads the file with `vscode.workspace.fs.readFile` and posts `file:content`.

### App: applying fresh content

Handled next to the `init` handler in `app-context.tsx`:

1. Ignore unless embedded and the message's `filePath` matches the currently-open local file (staleness protection).
2. `setFileContent(fresh)` and increment a `reloadNonce` counter.
3. `reloadNonce` is passed to `Editor` and included in the content-load effect's dependency array (`Editor.tsx` — the effect currently keyed on `[filePath, editor]` only), so the same file re-renders with new content through the existing mermaid/image/draft pipeline. `HtmlViewer` renders from the `content` prop directly and needs no nonce.

**Unsaved edits guard:** the reload request is wrapped in the existing `guardNavigation` helper — if the editor is dirty, the standard discard-changes confirmation appears before the request is posted. A reload can never silently clobber in-progress edits.

### Pure logic module

`src/lib/embed-reload.ts` — shortcut predicate, reload-request poster, and apply-decision helper, following the `embed-image-bridge.ts` pattern (pure module, promise/postMessage plumbing, unit-tested without a webview).

## Explicitly out of scope

- "Source changed" banners — auto-apply (clean editor) or silence (dirty editor) covers the cases without extra chrome
- Reload for PR-mode views (PR content comes from the GitHub API, not disk)
- Preserving scroll position or cursor across reload

## Acceptance Criteria

- [ ] `Ctrl+Shift+R` / `Cmd+Shift+R` inside the MarDoc webview re-renders the open file with current disk content
- [ ] Works from the markdown Editor view and the HtmlViewer view
- [ ] With unsaved edits, reload first shows the existing discard-changes confirmation; cancel leaves edits intact
- [ ] "MarDoc: Reload File" appears in the VS Code command palette and reloads the active MarDoc panel
- [ ] Reload in the repo-browser panel (`mardoc.open`, no file) is a safe no-op
- [ ] Outside embed mode, `Cmd+Shift+R` still performs the browser's native hard reload
- [ ] Shortcut listed in the in-app keyboard cheatsheet (embed mode only)
- [ ] Unit tests cover the shortcut predicate, the post/apply protocol helpers, and path-mismatch rejection
- [ ] `npm test` and `npm run build` clean in mardoc-app.github.io; `npm run compile` clean in mardoc-vscode

## Implementation Plan

### mardoc-app.github.io
1. `src/lib/embed-reload.ts` — `isReloadShortcut(e)`, `postReloadRequest()`, `shouldApplyFileContent(msg, currentPath)`
2. `src/lib/app-context.tsx` — embed keydown listener (capture phase, next to the Cmd+C fix); `file:content` message handler; `reloadNonce` state; wire `guardNavigation`
3. `src/app/page.tsx` — pass `reloadNonce` to `Editor`
4. `src/components/Editor.tsx` — add `reloadNonce` to the content-load effect deps
5. `src/lib/keyboard-shortcuts.ts` — add shortcut entry (embed-only flag) + cheatsheet filter
6. `src/__tests__/embed-reload.test.ts`

### mardoc-vscode
1. `src/extension.ts` — `fileUri` param on `setupPanel`; panel→file map; `file:reload` handler; `mardoc.reloadFile` command; forward new message types in `getWebviewHtml`
2. `package.json` — command + keybinding contributions
