# 020 — VS Code WebView Compatibility

**Status: App side implemented; extension unverified.** Reviewed against `4abb8f5` on 2026-09-23.

openExternal uses the message type open-external in embed mode and window.open in the normal browser. The original blanket ban on browser APIs is not the current contract.

See the [feature index](../README.md) for current status and reference documentation. The original story below is retained as a historical design record; its checkboxes and future-tense instructions are not a current completion report.

## Original story (historical)

## Value

Links and popups that rely on browser-only APIs (`window.open`) fail silently in VS Code's WebView embed mode. Users click "Follow link" and nothing happens. This story fixes all browser-API assumptions so the embed experience works fully.

## Acceptance Criteria

- [ ] `window.open()` in `followLink` is replaced with a VS Code-compatible approach (postMessage to extension for external URLs, internal navigation for relative/anchor links)
- [ ] Audit for any remaining `window.open`, `window.prompt`, `window.confirm`, `window.alert` calls — none remain
- [ ] External links open correctly in both browser and VS Code WebView
- [ ] Internal/anchor links navigate correctly in both contexts

## Dependencies

None

## Implementation Notes

- `followLink` in Editor.tsx (~line 1079) uses `window.open()` for external links
- VS Code WebView blocks `window.open` — need to postMessage to the extension, which calls `vscode.env.openExternal()`
- Add a `file:open-external` message type to the VS Code bridge
- The extension side (`mardoc-vscode/src/extension.ts`) needs a handler for this message
