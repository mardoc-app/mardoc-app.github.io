# WP-13 review: the view mode in links and remembered (#143, #144)

- **Reviewer:** independent reviewer (Opus), fresh context
- **Date:** 2026-11-12
- **Scope:** `git diff 64f9d91..f73712b` (main to `wp-13` head): `DiffViewer.tsx`, `Editor.tsx`, `HtmlViewer.tsx`, `PRDetail.tsx`, `page.tsx`, `app-context.tsx`, `routing/route-adapter.ts`, `use-viewport.ts`, `vitest.setup.ts`, `vitest.config.ts`, `e2e/view-mode-links.spec.ts`, `view-mode-storage.test.ts`, the L2 links page and diagram, `data-and-security.md`, `plan.md`, `docs/plan/WP-13.md`
- **Checked against:** `docs/plan/WP-13.md` (WP-13 and "Decisions taken on defaults"), F-86 to F-89 in `docs/design/requirements.md`, `docs/design/l2-links-routing.html`, `REVIEW.md`
- **Baseline:** no `ci` output was supplied with the brief. Targeted vitest runs: `view-mode-storage.test.ts`, `all-pr-files.test.tsx`, `diff-viewer-html-comment.test.tsx`, `diff-viewer-panel-autoreopen.test.tsx` passed (4 files, 17 tests). Static export (`npx next build`) built. `CI=1 PLAYWRIGHT_PORT=3460 npx playwright test e2e/view-mode-links.spec.ts --workers=1`: 25 passed, 1 skipped (`f87_copy_link_after_split_ends_in_mode_split` on mobile, by design).
- **How:** I read the whole diff and the code around it (PRDetail's viewer deck, `selectPRFile`, `navigateToHash`, `_openPRInternal`, `_openFileInternal`, `refreshDocument`, the Editor load effect and draft banner, `route.ts`, `view-mode.ts`, `safe-storage.ts`). I ran three bugs, security and compliance passes. I reproduced findings with a throwaway DiffViewer test, run with a temporary vitest config and deleted afterwards, so no product code or tests were changed.

## Verdict

**FAIL.** Two Medium findings need fixing before owner acceptance:

- WP13R-1: a remembered or linked HTML mode opens an added or deleted HTML file on an empty revision (reproduced).
- WP13R-2: a `?mode=source` blob link breaks the draft Restore banner.

The design of the pick is sound: the file is picked on first show and on a new link mode, a returned-to file keeps its view, programmatic switches do not save, and the storage and address handling are correct. The remaining findings are Low.

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 2 |
| Low | 5 |
| Nit | 0 |

## Findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| WP13R-1 | Medium | Bugs | `src/components/DiffViewer.tsx:71-75` (`pickHtmlMode`) | `available` is always `diff, head, base, source`, whatever revisions the file has. A remembered `base`, or a link's `base`, is applied to an added HTML file, which has no base. A remembered `head` (or `?mode=preview`, its twin) is applied to a deleted file. Before WP-13 every file reset to `diff`. `handleCommentSelect` (`:919-922`) already handles this case for comment jumps, but the picker does not. F-86 says "when the file … can show it", and F-89 says an unavailable mode falls back. | **Reproduced.** Store `{"html":"base"}`, which happens when a reviewer clicks Base (old) on a modified HTML file. Then mount DiffViewer for `new.html` (status `added`, `baseContent: ""`). The result is that `Base (old)` is pressed and the iframe's `srcdoc` does not contain the page text, so the page is blank. In the app: click Base (old) on `deck-a.html`, then click a newly added HTML file in the same PR, and it opens as an empty white frame. | Pass the file's revisions to the pick: drop `base` from `available` when `baseContent` is empty, and drop `head` when `headContent` is empty (mirror `:922`). Add `f89_remembered_base_on_an_added_html_file_opens_diff` (unit or e2e). |
| WP13R-2 | Medium | Bugs | `src/components/Editor.tsx:855-861` with the draft banner `:1807-1826` | A `?mode=source` link turns on code view in the same load step that offers a saved draft ("Unsaved draft found"). The banner's Restore writes the draft into the hidden TipTap editor only. The code textarea keeps showing `codeContent`, which is the upstream text. The next edit in the textarea runs `reconcileDraft` with the upstream-based text and overwrites the stored draft. Pressing Rich loads the upstream `codeContent` into the editor, so the restored draft is replaced. The same path existed before if a user pressed Code by hand before Restore. WP-13 makes it the default for every source link. | The user edits `readme.md` and leaves, so a draft is stored. A teammate's link, or their own Share in code view, `#/acme/docs/blob/main/readme.md?mode=source`, opens it in code view with the banner. They click Restore. Nothing visible changes. They type one character in the textarea, and the stored draft is now the upstream text plus that character, so their earlier edits are gone. | When Restore runs in code view, also set `codeContent` to the draft markdown and recompute `isDirty`. Alternatively, do not auto-enter code view while a draft prompt is pending. Add a unit test: a source link plus a stored draft, then Restore, and the textarea shows the draft. |
| WP13R-3 | Low | Bugs | `src/lib/app-context.tsx:217`, `src/components/DiffViewer.tsx:379-381`, `src/app/page.tsx:98-101` | `shownMode` is only ever set by an active DiffViewer and never cleared. Copy link is offered for every PR file, including images and source files (ImageDiffViewer and SourceDiffViewer), and while a document is still loading. In those cases it copies the last Markdown or HTML file's mode, possibly from an earlier PR. F-87 says the link carries the *current* view mode. | In a PR with `docs/a.md` and `src/app.ts`, click Preview on `a.md`, click `src/app.ts`, then click Copy link. The copied URL is `…/pull/12/file/src/app.ts?mode=preview`. Similarly, if the user clicks Base (old) on an HTML file and then clicks Copy link while the next Markdown file shows "Loading document…", the URL is `…/next.md?mode=base`. | Clear the mode when no DiffViewer is active, for example with an effect cleanup in DiffViewer that calls `onModeChange(undefined)` when `active` goes false or the viewer unmounts. Only include `mode` when the shown viewer reported one for that path (store `{path, mode}`). |
| WP13R-4 | Low | Bugs | `src/lib/app-context.tsx:1114` and `:1143`; `src/components/DiffViewer.tsx:355` | A link is re-picked only when `linkMode` *changes*. In the warm branch, `selectPRFile` sets it to `undefined` and then `setLinkMode(route.mode)` sets it back in the same batch. A link with the same mode as the one that opened the file is therefore not a change, and DiffViewer keeps the mode the user clicked in between. | **Reproduced at the component level:** mount with `linkMode="preview"`, click Inline Diff, then re-render with `linkMode="preview"`. Inline Diff stays pressed. In the app: open `…/file/docs/guide.md?mode=preview` and click Inline Diff (the address now reads `?mode=inline`). Then edit the address back to `?mode=preview` and press Enter (a hashchange to the same file). The view stays Inline Diff while the address says `preview` (F-86). | Give each followed link an identity, for example `linkMode` as `{mode, seq}` with `seq` incremented in `navigateToHash`, and re-pick when `seq` changes and `mode` is set. |
| WP13R-5 | Low | Bugs | `src/components/Editor.tsx:316-332`, `src/components/HtmlViewer.tsx:42-43`, `src/app/page.tsx:358,376`, `src/lib/app-context.tsx:961` | "Once per file" is kept in a ref inside Editor (and in HtmlViewer's initial state). Both components unmount while `loadingContent` shows the spinner, so every reload of the same file starts fresh. `linkMode` stays `source` until another file is opened by click. `refreshDocument` then pushes the address *without* the mode. | Open `#/acme/docs/blob/main/readme.md?mode=source`, click Rich, then click Refresh. The file reopens in code view. The address now reads `…/readme.md` with no mode, and there is a new history entry, so Back returns to the `?mode=source` entry of the same file and reloads it. | Clear `linkMode` after the blob view has applied it, or in `refreshDocument`. Alternatively, have `refreshDocument` keep the current address's mode. Keep the "applied" marker outside the remounting component. |
| WP13R-6 | Low | Compliance | `e2e/view-mode-links.spec.ts`; `src/__tests__/view-mode-storage.test.ts` | The named proofs cover the plan's list, but several behaviours the diff relies on have no test: a file returned to by "Back to review" keeps its view (the purpose of `f73712b`); programmatic switches never save (comment jump to Side by Side, Suggest from the context menu, HTML jump to head or base); `?mode=preview` opens an HTML file on Head (plan increment 2, twins); and the HtmlViewer path of the blob code view (`?mode=source` and Share with mode). The tests prove what they name and are not vacuous, but they do not cover these behaviours. | A change that routes `handleCommentSelect` through `pickViewMode` would save `split` on every comment jump and change the next file's mode. All 13 e2e cases and the unit tests would still pass. Removing the `lastPick` check would re-pick the remembered mode on Back to review, and no test would fail. | Add DiffViewer unit tests: a jump does not write `mardoc_view_mode`; `active` going false then true keeps a clicked mode; and `linkMode="preview"` on an HTML file presses Head (Head (new)). Add one e2e for Back to review after a cross-file comment jump, and one for an HTML blob `?mode=source`. |
| WP13R-7 | Low | Compliance | `docs/design/l2-links-routing.html` lines 62, 72/88, 79, 107, 145, 185; `docs/assets/diagrams/l2-links-routing.drawio` (`storage` cell) | The L2 page was only partly brought up to date, as listed below. | A reader of the L2 page looks for WP-13 under "proposed". They expect `?mode=split` on a phone with Preview remembered to open Inline Diff, but the app opens Preview. They also look for mode writes in app-context, but they happen in DiffViewer. | Update §05 status, the diagram dash (and re-export the SVG), the adapter's caller list, the DiffViewer source lines, the failure-table rule, the prop text and the journey hops. Either move the query edit into a pure `route.ts` helper (for example `withMode(hash, token)`) or amend the adapter's Boundary text. |

WP13R-7 lists these stale or wrong statements in the L2 page:

- §05 still says "the view mode is proposed (WP-13)", while §06 and §09 say it is built.
- The `localStorage` box is still dashed, and the legend says "Dashed boxes are proposed".
- The adapter card lists its callers as "app-context, page.tsx, SignInBanner and PRDetail". DiffViewer now calls `loadMode`, `saveMode` and `publishMode` too.
- The adapter's Boundary says it "holds no rules … pass it finished hashes", but `publishMode` edits the query itself.
- The DiffViewer source links point at the old lines `319-321`.
- The failure table says an unavailable mode "falls to the kind's default". The code and F-89 fall to the remembered mode first.
- §05 gives DiffViewer's prop as `{kind; mode}`, but the code takes `linkMode?: ViewMode`. The accepted plan chose this, and the page was not updated.
- The "Share a link" journey says app-context reports the mode and hash-router builds the address. In the code, DiffViewer calls `publishMode`.

## Checked and found sound

**Mode picking in DiffViewer**

- `pickMdMode` and `pickHtmlMode` follow F-88's order: link, link twin, remembered, remembered twin, fallback (`inline` or `diff`), through the pure `pickMode`.
- The initial state picks on mount. The `lastPick` effect re-picks only on first show or a new link mode. The per-file effect (`:536`) re-picks only when the file's path or content changes.
- A returned-to file keeps its view. When "Back to review" makes the hidden source viewer active again, `selectPRFile` has cleared `linkMode`, `lastPick.shown` is true, and nothing is re-picked. When the browser's Back lands on an entry with `?mode=`, the mode is re-applied, because the inactive viewer had recorded `linkMode` as undefined.
- Programmatic switches do not save:
  - `handleCommentSelect` and `handleSuggestFromContext` call the setters directly.
  - **Reproduced:** a cross-file jump mounted with `externalJump` shows Side by Side and leaves `mardoc_view_mode` unset.
  - Only `pickViewMode`, `changeHtmlMode` (the HtmlDiffToolbar buttons) and the Source Diff and Rendered buttons save.
- On a cross-file jump, the order of effects lets the jump's head or base win over the per-file pick in the same commit.
- `isWideScreen()` reads `matchMedia` at pick time with the same query as `useIsMobile`. This avoids the "desktop" first render of `useViewport`, so a phone never picks Side by Side. It returns false where there is no `matchMedia`.
- The twins come from `view-mode.ts`: `?mode=diff` on Markdown gives Inline, `?mode=preview` on HTML gives Head, and other-kind tokens are ignored.

**Storage (`route-adapter.ts`)**

- `loadMode` returns undefined for missing, corrupt, wrong-shape and unknown values, and when storage is blocked. `saveMode` keeps the other kind and never throws.
- Both go through `safe-storage` with the key `mardoc_view_mode`. The key is documented in `data-and-security.md`, and Disconnect leaves it, as decided under Q-RT-4.
- The unit tests prove these cases and pass.

**`publishMode`**

- It edits only the `mode` parameter with `replaceState`, so there is no history entry and no `hashchange`.
- It updates `known`, so the write-loop guard stays consistent.
- It is a no-op when the value is unchanged.
- It re-serialises `anchor` with `+` for spaces. This still parses to the same route, and the only raw comparison (`onExternalChange`) uses the value it stored.

**linkMode lifecycle**

- `navigateToHash` sets it for `pr` and `file` routes and clears it for others.
- `openFile`, `_openPRInternal` (not from a link) and `selectPRFile` clear it. The warm same-PR branch sets it again after `selectPRFile`.
- The cold path-form rewrite (`settle`), the warm `replace` and the blob `setHash` keep `?mode=`. The f86 tests check the address.

**Copy link (PR view)**

- It builds through `buildRoute` with the path form and `shownMode`. It is hidden in embed and demo mode, and its toast clears on file change.
- It reports the mode actually shown after a programmatic switch.
- The stale case is WP13R-3.

**Blob view**

- Share branch and Share revision add `?mode=source` from the code view reported by Editor or HtmlViewer, and drop it after a return to Rich (Editor path proven by `f87_blob_code_view_copies_mode_source`).
- A `?mode=source` link opens Editor in code view after load, with `codeContent` from the loaded baseline (`f86_blob_source_link_opens_code_view`).

**Tests**

- The e2e assertions check the pressed button, the address and the stored JSON, so they are not vacuous.
- The clipboard capture replaces `navigator.clipboard.writeText` in an init script. It proves the URL the app writes, and if the replacement failed the poll would fail rather than pass. This departs from the plan's "clipboard read in Chromium", and the departure is explained in the spec, because WebKit (iPhone 14 project) has no clipboard permission.
- `vitest.setup.ts` removes only `mardoc_view_mode` before each test, so a mode clicked in one jsdom test does not leak into the next. It is wrapped in `try` for environments without storage.

**Security pass**

- No new dependencies.
- The stored and linked values pass through `parseMode`'s fixed token list before use. No mode value reaches HTML or a network request.
- No credentials or document content are added to storage or sent to another host.
- The static export builds.

**Compliance**

- Test names carry F-86 to F-89.
- The files follow the plan's increments.
- LR-26 holds: only `route-adapter.ts` touches the address.
- The plan row is marked "DONE pending review".
