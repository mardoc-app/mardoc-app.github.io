# WP-2: Embed `init` accepted only in embed mode and from the parent window

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** ⭐ Accepted by the owner 2026-10-27; building
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** sdlc:core-builder (Opus), own worktree. Credential
  handling.

## Goal

Today any window can post `{ type: "init", token }` to MarDoc and replace its
GitHub credential, including a script in a rendered HTML document reaching
the tab through `window.parent`. That is RK-3, at `app-context.tsx:353-376`
at snapshot `2b79817`.

After this WP, the app applies an `init` message only when both of these
hold:

1. the page was loaded with `?embed=true`;
2. the message's `event.source` is the page's own `window.parent`, and that
   parent is not the page itself.

Everything else is ignored, with no state change. Stage 1 ships only with
this (Q-27, accepted 2026-10-27).

**Requirements proved:** F-16 (T-15). Closes RK-3 for stage 1. The rest of
ADO-1 stays with SEC-01.

## Files that change

| Path | Change | New? |
|---|---|---|
| `src/lib/embed-init.ts` | Pure function `isTrustedInit(input: { data: unknown; source: unknown; parent: unknown; self: unknown; search: string }): boolean`. It returns true only if `data` is an object with `type === "init"`, `new URLSearchParams(search).get("embed") === "true"`, `parent !== self` and `source === parent` | yes |
| `src/lib/app-context.tsx` | In the `init` listener (`handleMessage`, about lines 353-376): call `isTrustedInit` with `event.data`, `event.source`, `window.parent`, `window` and `window.location.search`, and return early when it is false. Replay the module-level cached `vsCodeInitData` only when `?embed=true`. No other change to `applyInitData` | no |
| `src/__tests__/embed-init.test.ts` | Unit tests for `isTrustedInit` | yes |
| `e2e/embed-init.spec.ts` | Playwright T-15 (below) | yes |
| `docs/risks.md` | RK-3: mitigation in progress, then DONE for stage 1 with the test name once merged. The `file:content` and other embed messages stay with SEC-01 (ADO-1) | no |

Nothing outside these paths. `applyInitData`, the `ready` handshake and the
other embed messages stay as they are.

## Increments and proof points

**Riskiest assumption:** the real VS Code extension posts `init` from the
MarDoc frame's parent window, with `?embed=true` in the frame's URL.

- **Verified from source:** mardoc-vscode at `41088d5`, `src/extension.ts`.
  The webview HTML holds `<iframe id="mardoc" src="…/?embed=true…">`
  (lines 145, 203 and 228). Its script calls
  `iframe.contentWindow.postMessage(initPayload, '*')` (line 261), so
  `event.source` in MarDoc is the webview document, which is MarDoc's
  `window.parent`.
- **Not yet run:** the real extension. Increment 3 checks it with the
  owner. Until then, the source reading and a Playwright host page that
  copies the webview's structure stand in.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | `isTrustedInit` decides correctly, and the listener uses it | None | `npx vitest run src/__tests__/embed-init.test.ts` passes: true for embed mode with the parent as source; false for no `?embed=true`, a source that is another window or an iframe, `parent === self` (top level), `data` that isn't an object, or `type` other than `init`. `npm run check` stays green | PENDING |
| 2 | Untrusted `init` messages leave the credential unchanged in a real browser (T-15) | Increment 1 | `npx playwright test e2e/embed-init.spec.ts` passes on the desktop and mobile projects (below), and `e2e/embed-mode-clipboard.spec.ts` still passes. **FAIL:** any untrusted case changes the credential, or the trusted case stops working | PENDING |
| 3 | The real VS Code extension still opens files and carries its token | Increment 2; the owner runs the extension | The owner points the extension's app URL at a local build (`npm run build`, then serve `out/`) or at a preview. They open a Markdown file and a PR in VS Code and see the file and the repository load. **FAIL:** the webview shows the demo or no file, which means the extension's `init` was rejected | PENDING |

### T-15 cases (`e2e/embed-init.spec.ts`)

The test serves a host page from a Playwright route (for example
`http://localhost:<port>/__host.html`). Like the VS Code webview, it holds
MarDoc in `<iframe id="mardoc" src="/?embed=true">`. It also holds a second,
sibling iframe that stands in for a hostile document. The credential is read
through the UI: the Settings screen's connected or demo state, or the
repository list loading against a mocked GitHub. It is never read from
storage, because `init` tokens are not stored.

| Test | Setup | Expected |
|---|---|---|
| `f16_init_from_parent_in_embed_mode_is_applied` | Host page posts `init` with a test token and file | MarDoc shows the file: unchanged behaviour |
| `f16_init_from_sibling_iframe_is_ignored` | The sibling iframe posts `init` to `parent.frames[mardoc]` | No change: still demo, no token |
| `f16_init_from_rendered_document_is_ignored` | A rendered HTML document inside MarDoc (an existing fixture with `allow-scripts allow-same-origin`) posts `init` to `window.parent` | No change |
| `f16_init_outside_embed_mode_is_ignored` | Top-level `/` without `?embed=true`; the page posts `init` to itself and an opened window posts to it | No change; embed mode not turned on |

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| The VS Code `init` message | External (mardoc-vscode) | None: the same message is accepted from the same sender |
| `src/lib/auth/*` (WP-1) | Frozen | Not touched |

## Risks

- **What could break:** VS Code embed sessions, if the extension's sender or
  URL differs from the source reading. Increment 3 checks this with the real
  extension.
- **The riskiest step:** increment 3. It needs the owner and VS Code, so
  it's scheduled once increment 2 passes. WP-2 isn't DONE until it passes.
- **Options not taken:**
  - *Checking `event.origin`.* The webview's origin is a `vscode-webview://`
    scheme that changes per install, so `source === parent` is the reliable
    check.
  - *Also guarding `file:content` and the other embed messages now.* They
    belong to ADO-1 and SEC-01, outside stage 1 (A-19).

## Proof

| Test | Level | Proves |
|---|---|---|
| `f16_is_trusted_init_*` (unit, one per case above) | unit | F-16 |
| `f16_init_from_parent_in_embed_mode_is_applied` | Playwright | F-16, no regression |
| `f16_init_from_sibling_iframe_is_ignored` | Playwright | F-16 (T-15) |
| `f16_init_from_rendered_document_is_ignored` | Playwright | F-16 (T-15), RK-3 |
| `f16_init_outside_embed_mode_is_ignored` | Playwright | F-16 (T-15) |

Commands, exactly as run:

```sh
npm run check
npx playwright test e2e/embed-init.spec.ts e2e/embed-mode-clipboard.spec.ts
npm run ci
```

The verifier also exercises the embed-mode clipboard flow and opening a PR
with an HTML file in the normal web app.

## Relevant lessons

None apply. `docs/lessons.md` holds only the template's example row.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead,
      including the owner's VS Code check.
- [ ] Every test above passes and carries its IDs.
- [ ] `npm run ci` is green, with its output pasted in the PR.
- [ ] Docs updated: risks.md RK-3.
- [ ] Independent review findings dispositioned (fixed, or a backlog ID).
- [ ] The plan.md row is set to DONE.
