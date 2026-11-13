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

## Dispositions

All seven findings are Fixed in commit `37da8a1`. Each test is named in the table.

| ID | Disposition | Fix | Test |
|---|---|---|---|
| WP13R-1 | Fixed (`37da8a1`) | `pickHtmlMode` drops `base` when the file has no base content and `head` when it has no head content, so the pick falls back as F-89 says. | `diff-viewer-view-mode.test.tsx`: `f89_remembered_base_on_an_added_html_file_opens_diff`, `f89_linked_base_on_an_added_html_file_opens_diff`, `f89_remembered_head_on_a_deleted_html_file_opens_diff` |
| WP13R-2 | Fixed (`37da8a1`) | A `?mode=source` link waits while the saved-draft banner shows. Discard then enters code view on the upstream text. Restore then enters code view through the Code toggle, so the box shows the restored text. | `view-mode-links.spec.ts`: `f86_source_link_waits_for_the_draft_banner_then_shows_the_upstream_text_after_discard`, `f86_source_link_waits_for_the_draft_banner_then_shows_the_restored_text_after_restore`. Both are Playwright tests, because TipTap does not run in jsdom; the second also checks that the stored draft keeps the restored text after typing. |
| WP13R-3 | Fixed (`37da8a1`) | A viewer that stops being shown reports no mode, so the shown mode is empty for images, source files and files still loading. Copy link then writes the path form with no `mode`. | `diff-viewer-view-mode.test.tsx`: `f87_the_shown_mode_is_reported_and_cleared_when_the_file_is_no_longer_shown`; `view-mode-links.spec.ts`: `f87_copy_link_for_a_file_with_no_view_mode_has_no_mode` |
| WP13R-4 | Fixed (`37da8a1`) | app-context numbers each followed link (`linkSeq`); DiffViewer applies the link mode again when the number changes. | `diff-viewer-view-mode.test.tsx`: `f86_following_the_same_link_again_applies_its_mode_again` |
| WP13R-5 | Fixed (`37da8a1`) | The blob view marks the link mode as applied once it has entered code view, so a remount stays Rich. Refresh keeps the current address, so it adds no history entry and keeps `?mode=`. | `view-mode-links.spec.ts`: `f86_refresh_after_choosing_rich_stays_rich_and_keeps_the_address` |
| WP13R-6 | Fixed (`37da8a1`) | The missing proofs are added. | `diff-viewer-view-mode.test.tsx`: `f88_a_file_shown_again_keeps_its_clicked_view` (Back to review), `f88_a_comment_jump_does_not_save_a_mode`, `f88_an_html_comment_jump_does_not_save_a_mode`, `f88_suggest_from_the_context_menu_does_not_save_a_mode`, `f86_preview_link_on_an_html_file_presses_head`; `view-mode-links.spec.ts`: `f86_preview_link_opens_an_html_file_on_head`, `f87_html_blob_source_link_opens_code_view_and_shares_mode_source`. The existing `pr-comment-navigation.spec.ts` deck test still covers Back to review end to end. |
| WP13R-7 | Fixed (`37da8a1`) | The L2 links page now matches the code: the §05 status, a solid storage box (drawio, SVG and inline copy kept in step), the adapter's callers and Boundary text (it builds the mode query), the DiffViewer source anchors, the prop text, the F-89 order in the failure table and the Share journey hops. Doclint reports 0 errors. | `sdlc-doclint --mode errors docs/design/l2-links-routing.html` |

## Re-review

- **Date:** 2026-11-13
- **Fix commits:**
  - `37da8a1`: code, tests and the L2 page;
  - `9f80795`: dispositions.
  - I reviewed `git diff 05fc7ae..9f80795`; the branch head is `9f80795`.
- **Baseline:**
  - `diff-viewer-view-mode.test.tsx` and `view-mode-storage.test.ts`: 15 passed.
  - Static export built. `CI=1 PLAYWRIGHT_PORT=3461 npx playwright test e2e/view-mode-links.spec.ts --workers=1`: 37 passed and 1 skipped (Side by Side Copy link on mobile, by design).
  - `sdlc-doclint --mode errors docs/design/l2-links-routing.html`: 0 errors and 14 warnings. The warnings are style only.
- **How:** I read every changed hunk against the original failure scenarios. I reverted each of the three main fixes in turn and re-ran its tests:
  - **WP13R-1:** I reverted the `available` filter in `pickHtmlMode`. The 3 `f89_*_html_file_opens_diff` tests failed.
  - **WP13R-4:** I reverted the `linkSeq` comparison in DiffViewer. `f86_following_the_same_link_again_applies_its_mode_again` failed.
  - **WP13R-2:** I restored the `05fc7ae` Editor and removed its `onCodeViewApplied` prop, then rebuilt the static export. Both `f86_source_link_waits_for_the_draft_banner_*` tests failed, and so did `f86_refresh_after_choosing_rich_stays_rich_and_keeps_the_address` (WP13R-5).
  - I restored every revert afterwards. I reproduced the new findings with a throwaway Playwright spec and config, then deleted both.

### Verdict

**FAIL.** All seven original findings are Closed. The WP13R-2 fix brings in one new Medium problem, WP13R-8: if the user turns on code view before answering the draft banner, Discard throws away their typed text and Restore shows the original file instead of the draft. I reproduced both. Fix WP13R-8 before owner acceptance. WP13R-9 (Low) and WP13R-10 (Nit) are optional.

| ID | Status | Evidence |
|---|---|---|
| WP13R-1 | Closed | `pickHtmlMode` now takes the file's revisions and leaves out `base` or `head` when that revision is empty. The 3 new `f89_*` unit tests pass, and they fail when the filter is reverted. The unit test also checks the frame's `srcdoc`, so it proves the content as well as the pressed button. |
| WP13R-2 | Closed (scenario as reported); see WP13R-8 | A `?mode=source` link now waits while the banner shows. Discard opens code view on the original text. Restore opens it through the Code toggle, so the box shows the draft, and typing keeps the draft. Both Playwright tests pass, and both fail with the `05fc7ae` Editor. The builder used Playwright instead of a component test because TipTap does not run in jsdom. That is adequate: these tests prove the real TipTap and textarea behaviour, which a jsdom test could not. |
| WP13R-3 | Closed | An effect cleanup in DiffViewer reports `undefined` when the viewer stops being shown or unmounts. React runs passive-effect cleanups before mounts in the same commit, so a file-to-file switch ends on the new file's mode. The deck cases (going to a file and Back to review) end the same way. `f87_the_shown_mode_is_reported_and_cleared_*` expects `["inline","preview",undefined]`, so it fails without the cleanup. `f87_copy_link_for_a_file_with_no_view_mode_has_no_mode` proves `src/app.ts` is copied with no `mode`. |
| WP13R-4 | Closed | `navigateToHash` increments `linkSeq` for every followed link. DiffViewer picks again when `linkSeq` changes and `linkMode` is set. Inactive viewers get `linkMode` undefined, so they do not pick again. The unit test fails when the comparison is reverted. The app-side wiring has no test (WP13R-9). |
| WP13R-5 | Closed | The blob view now consumes the link mode once it has entered code view, so a remount stays Rich. `refreshDocument` keeps the address's `mode`, so the hash it publishes equals the current one: no new history entry and no `hashchange`. `f86_refresh_after_choosing_rich_stays_rich_and_keeps_the_address` checks the view, the address and `history.length`, and fails with the `05fc7ae` Editor. |
| WP13R-6 | Closed | The missing proofs are added: keep-view on show again, no save after a Markdown jump, an HTML jump or a context-menu Suggest, the HTML Head twin (unit and e2e), and the HTML blob `?mode=source` (open and Share). The departure for Back to review is adequate. The unit test drives `active` false then true and fails if the `lastPick` check is removed. The remaining ways the app could break it are a remount of the returned file or a change of key, and the existing `pr-comment-navigation.spec.ts` deck test catches those because the deck's frame state survives Back to review. |
| WP13R-7 | Closed | The L2 page and diagram now match the code. §05 status is built, the storage box is solid in the drawio, SVG and inline copy, and the adapter's callers and Boundary are correct. The DiffViewer anchors point at `65-80`, `354-390` and `1054-1070` (checked against the file). The `linkMode`/`linkSeq` prop text, the F-89 order in the failure table and the Share journey are fixed. Doclint reports 0 errors. |

### New findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| WP13R-8 | Medium | Bugs | `src/components/Editor.tsx:1835-1840` (Restore) and `:1850-1856` (Discard) | While a `?mode=source` link waits for the draft banner, the page shows the rich view with the Code button enabled. If the user presses Code themselves, `codeEntryWaitsForDraft` stays set. The banner's buttons then act as if code view were still off. Discard resets the box to the original file text. Restore calls `toggleCodeView()`, which reads `codeView === true` from its closure, so it switches *out of* code view. That switch replaces the just-restored draft in the editor with the box's original text. | **Reproduced** (static export, desktop). In each case a draft is saved for `readme.md`, the user opens `#/acme/docs/blob/main/readme.md?mode=source`, sees "Unsaved draft found" and clicks Code. (a) They type ` TYPED-EDIT` in the box, then click Discard. The box reads `# Readme\n\nBody of readme.md.`, the typed text is gone, and the stored draft is `null`, so the edit is lost. Before this fix, Discard only cleared the banner. (b) They click Restore instead of Discard. The view switches to Rich and shows `Readme / Body of readme.md.`. The draft is not shown, and the page still counts as having unsaved changes. | When the user toggles code view by hand, end the wait: clear `codeEntryWaitsForDraft` and call `onCodeViewApplied`, for example inside `toggleCodeView`. Then, when Restore runs with code view already on, set `codeContent` to the restored Markdown instead of toggling. Add both sequences above as e2e tests. |
| WP13R-9 | Low | Compliance | `src/lib/app-context.tsx:1142`; `src/components/PRDetail.tsx:636` | WP13R-4's proof feeds `linkSeq` into DiffViewer directly. No test follows the same link twice through the app, so the wiring is untested: the increment in `navigateToHash` and PRDetail passing `linkSeq` on. | Found by inspection, not run. If someone deletes `setLinkSeq(n => n + 1)` or the `linkSeq={linkSeq}` prop, every unit and e2e test stays green, and the original WP13R-4 failure is back. In that failure, `…/guide.md?mode=preview`, then a click on Inline Diff, then entering the `?mode=preview` address again leaves the view on Inline Diff. | Add one e2e test: open `GUIDE?mode=preview`, click Inline Diff, set `location.hash` back to the `?mode=preview` form, and expect Preview to be pressed. |
| WP13R-10 | Nit | Compliance | `e2e/view-mode-links.spec.ts:297` | The final check of the Restore test, that the stored draft contains "Draft body of the edit.", would also pass if typing saved nothing, because the seeded draft already contains that text. The test still fails on the original bug through its textarea check at `:294`. | If a change stops the code box from saving drafts, line 297 still passes. | Assert the exact stored value after typing, for example that it contains `Draft body of the edit.!`. |

### Checked in the fixes and found sound

**`linkSeq`**
- It increments once per `navigateToHash`. That includes the initial load, but a viewer mounted after the increment stores the current value in `lastPick`, so it does not pick again.
- `guardNavigation` is stable (it depends only on `setPendingNavigation`), so the subscription effect does not keep re-navigating and incrementing `linkSeq`.
- Browser Back to an entry with `?mode=` still picks the mode again, because the inactive viewer recorded `linkMode` as undefined.

**`consumeLinkMode`**
- Only Editor and HtmlViewer call it in the blob view. The PR view's `linkMode` is not affected.
- After it runs, `openInCode` turns false. Editor's load effect does not depend on that prop, and HtmlViewer's effect returns early, so there is no loop.
- The blob address keeps `?mode=source`, as the plan decided.

**Clearing the shown mode**
- The cleanup runs only for a viewer that was active.
- StrictMode's mount, unmount and mount replay ends on the shown token.
- Copy link while a document is loading now writes the path form with no mode.

**Refresh**
- `parseHash(readLocation()).mode` is read at click time, through the adapter, so LR-26 holds.
- The rebuilt hash equals the current blob address, so `publish` makes no history entry and no `hashchange`, as the `history.length` check shows.

**`pickHtmlMode`**
- A file whose base and head are both empty falls back to `diff`.
- The per-file re-pick (`pickHtmlAgain`) and the first-show pick use the same revision facts.

**Public-repo wording**
- The report contains none of the restricted terms.

### Re-review dispositions

| ID | Disposition | Fix | Test |
|---|---|---|---|
| WP13R-8 | Fixed (`2dfb499`) | Pressing Code ends a source link's wait for the draft banner. Discard in code view now only clears the banner and the stored draft, as it does without a link, so the typing stays in the box. Restore in code view puts the draft text in the box and stays in code view. | `view-mode-links.spec.ts`: `f86_pressing_code_while_a_source_link_waits_keeps_the_typing_when_the_draft_is_discarded`, `f86_pressing_code_while_a_source_link_waits_shows_the_draft_when_it_is_restored`. Both failed before the fix. |
| WP13R-9 | Fixed (`2dfb499`) | An app-level test follows the same `?mode=` link twice with a mode click between. | `view-mode-links.spec.ts`: `f86_following_the_same_mode_link_again_applies_it_again`. It fails when the `linkSeq` increment in `navigateToHash` is removed, and fails when PRDetail stops passing `linkSeq`; each revert was rebuilt and run, then restored. |
| WP13R-10 | Fixed (`2dfb499`) | The Restore test now types at the end of the box and asserts the stored draft ends in the typed character, which the seeded draft does not contain. | `view-mode-links.spec.ts`: `f86_source_link_waits_for_the_draft_banner_then_shows_the_restored_text_after_restore` |

## Second re-review

- **Date:** 2026-11-13
- **Fix commits:** `2dfb499` (code and tests) and `f54dff8` (dispositions). I reviewed `git diff e0ee06b..f54dff8`, and the branch head is `f54dff8`.
- **Baseline:**
  - Vitest: `draft-store`, `editor-modals`, `editor-save-flow` and `diff-viewer-view-mode` all passed (4 files, 93 tests).
  - Playwright: I built the static export and ran `CI=1 PLAYWRIGHT_PORT=3463 npx playwright test e2e/view-mode-links.spec.ts --workers=1`. 43 passed and 1 was skipped. The skip is the Side by Side Copy link test on mobile, which is skipped by design.
- **How:**
  - I read the Editor change against every banner and toggle path.
  - To spot-verify WP13R-8, I restored the `e0ee06b` Editor, rebuilt and ran the banner tests. Both `f86_pressing_code_while_a_source_link_waits_*` tests failed. The Restore test (`…restored_text_after_restore`) still passed, because its scenario belongs to WP13R-2. I then restored the file.
  - With a throwaway Playwright spec, since deleted, I checked two things:
    - The normal Code toggle and Restore without a link work. This passed.
    - One new path, below. This was reproduced.

### Verdict

**PASS.** WP13R-8, WP13R-9 and WP13R-10 are Closed. One new Low finding, WP13R-11, is open. It does not lose data and can be fixed now or deferred with a backlog ID.

The deliberate choice that Discard in code view keeps the typing and clears the stored draft is acceptable:

- It matches main. There, typing in either view, with the banner still open, has already replaced the stored draft. Discard then clears that key, and the edits stay on screen and marked unsaved.
- The next keystroke saves the draft again.
- The unsaved-changes guard still covers leaving the page.
- The user sees nothing disappear, which was the WP13R-8 failure.

| ID | Status | Evidence |
|---|---|---|
| WP13R-8 | Closed | `toggleCodeView` now ends a link's wait for the banner, so the banner's buttons act on the view on screen. In code view, Restore puts the draft text in the box and stays in code view. Discard only clears the banner and the stored draft. Both of my sequences are now e2e tests, and both pass. Both fail with the `e0ee06b` Editor (reproduced by revert). |
| WP13R-9 | Closed | `f86_following_the_same_mode_link_again_applies_it_again` changes `location.hash` to the same `?mode=preview` address after an Inline Diff click, and expects Preview to be pressed. This goes through the app's hashchange path. The address differs from the `?mode=inline` that `publishMode` wrote, so it counts as an outside change. I did not re-run the builder's two reverts (the `linkSeq` increment and the PRDetail prop). By reading the code, without either one, `linkMode` stays `preview` and nothing picks again, so the test would fail. |
| WP13R-10 | Closed | The Restore test now puts the caret at the end and asserts the stored draft contains `Draft body of the edit.!`. The seeded draft does not contain that string, so the check proves the typing was saved. |

### New findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| WP13R-11 | Low | Bugs | `src/components/Editor.tsx:919-922` (`toggleCodeView`) | When the user presses Code while a link waits for the banner, the wait ends, but the link mode is never marked as applied: `onCodeViewApplied` is not called. `linkMode` stays `source`, so the next remount of the Editor enters code view again. This brings back the WP13R-5 failure on this path. | **Reproduced** on the static export, desktop: 1. Store a draft for `readme.md`. 2. Open `#/acme/docs/blob/main/readme.md?mode=source`; the banner shows. 3. Click Code, then Discard, then Rich. 4. Click Refresh. Result: the file reopens in code view, with the Rich button showing and the raw text in the box, although the user chose Rich. | In `toggleCodeView`, when `codeEntryWaitsForDraft.current` was true, call `onCodeViewAppliedRef.current?.()` as well as clearing the flag. Add this sequence to `f86_refresh_after_choosing_rich_stays_rich_and_keeps_the_address`, or add it as a separate e2e test. |

### Checked in the fixes and found sound

**The normal Code toggle without a link**
- The wait flag is already false, so clearing it changes nothing.
- The Restore-in-rich path is the same as on main.
- Restore while in code view without a link now fills the box too. On main, the box kept the original file text, so this is an improvement.
- My throwaway check opened a blob with a stored draft, clicked Restore, then Code, then Rich. It saw the draft in each view.

**Restore from the link's wait**
- The flag is now cleared inside `toggleCodeView`, so the wait path still enters code view once.
- The wait path still calls `onCodeViewApplied`.
- `toggleCodeView` reads `codeView === false` from its closure, because the user had not toggled.

**Saving**
- The save, commit and PR handlers still read `codeView` and `codeContent`, which are unchanged.
- In code view, Restore sets `codeContent` to the raw draft Markdown. The next save or edit therefore uses the draft text.
- `editor-save-flow.test.ts` and `draft-store.test.ts` pass.

**The full e2e spec**
- `view-mode-links.spec.ts` passes on both projects at `f54dff8`.

**Public-repo wording**
- The report contains none of the restricted terms.
