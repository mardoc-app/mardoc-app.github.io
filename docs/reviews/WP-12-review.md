# WP-12 independent code review: PR file links by path (#142)

- **Reviewer:** independent reviewer agent (Opus), fresh context
- **Date:** 2026-11-12
- **Scope:** `git diff 6b2a8d9..f0a6535` (branch `wp-12`: slice plan `904fab4`, increments `6d695c8`, `ace9c91`, `f0a6535`), against `docs/plan/WP-12.md`, F-84, F-85 and NF-80 in `docs/design/requirements.md`, and `docs/design/l2-links-routing.html`. Rubric: `REVIEW.md`.
- **Baseline:** no `ci` output was supplied with the brief. The builder's plan row reports `npm run check` 1254 passed and the full static-export Playwright run 357 passed, 25 skipped. I did not run `npm run ci`.
- **How:**
  - Read the full diff and the surrounding code: `app-context.tsx` navigation (`:1012-1163`), `PRDetail.tsx`, `route.ts`, `route-adapter.ts` and `check-layout.mjs`.
  - Ran `npx vitest run` on `pr-file-links`, `check-layout`, `review-links`, `routing-route`, `hash-router` and `branch-navigation`: 6 files, 79 passed.
  - Ran `npx next build` (static export), then `CI=1 PLAYWRIGHT_PORT=3420 npx playwright test e2e/pr-file-links.spec.ts e2e/branch-links.spec.ts e2e/pr-comment-navigation.spec.ts`: 34 passed, desktop and mobile.
  - Probed the LR-26 patterns with a planted tree in a temporary directory.
  - Ran a timing probe on a throwaway copy of `pr-file-links.test.tsx`, deleted afterwards.
  - Ran `sdlc-doclint` on the L2 page: 0 errors, 12 warnings (style only).

## Verdict

**FAIL.** Two Medium findings need a fix, or a deferral with a backlog ID, before owner acceptance.

The core of F-84 and F-85 is sound and well proven:
- a cold path link writes nothing until the manifest arrives, then opens the right file even after the PR gained a file ahead of it;
- a legacy index link opens the file at that index and then shows the path form;
- a click pushes the path form, and Back returns;
- the write-loop guard in the route adapter is correct for several pushes in one tick, StrictMode re-subscription and the dirty-editor restore.

The problems:
- A link to a file that is not in the PR has its address rewritten to a different file (WP12R-1).
- The one test that proves the Q-RT-9 decision (resolve replaces rather than pushes) passes whether the code replaces or pushes (WP12R-2, reproduced).

Counts: High 0, Medium 2, Low 4, Nit 1.

## Findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| WP12R-1 | Medium | Bugs | `src/lib/app-context.tsx:1022`, `:1039`; warm branch `:1118` | A path that is not in the PR (`no-such-path`) falls back to index 0. `settle` then publishes the first file's path form with replace, because `file` is set and `files[0]` exists. The warm branch does the same through `selectPRFile(..., "replace")`. The link the user followed is overwritten in place, and the error text does not name the missing path. | A reviewer opens `#/acme/docs/pull/12/file/docs/gone.md`, where the file was dropped from the PR. The app shows `intro.md` and the header error "The linked file is not in this PR." The address now reads `#/acme/docs/pull/12/file/intro.md`. The reviewer reloads, or copies the address to report the broken link. The reload opens `intro.md` with no error, the copied link points at a file that exists, and Back cannot recover the original link because the entry was replaced. The unit test `f84_missing_path_opens_the_first_file_with_a_message` (`pr-file-links.test.tsx:86`) asserts this rewrite, so it locks the behaviour in. | Publish only when the link resolved (`found.ok`). On `no-such-path`, show the first file without writing (`"none"`), so the address keeps the link the user followed. Name the path in the message, for example "docs/gone.md is not in this PR." Change the unit test to expect the original hash, and add a URL assertion to `f84_missing_path_opens_the_pr_with_a_message`. If the owner prefers the rewrite, record that in the L2 questions table (Q-RT-9 covers only links that resolved). |
| WP12R-2 | Medium | Bugs (tests claim more than they check) | `src/__tests__/pr-file-links.test.tsx:65-71`; `:49`, `:52-55` | `f84_resolve_replaces_rather_than_pushes` reads `before = window.history.length` after the rewrite has already happened, because the manifest mock resolves before `start()` returns. If `settle` pushed instead of replacing, the extra entry would already be inside `before`, and `expect(history.length).toBe(before)` would still pass. In `f84_no_hash_write_before_the_manifest`, the `push` spy watches `history.pushState`, but app pushes go through `location.hash =`, so that spy can never fire. No e2e test checks Back after a cold link resolves. Q-RT-9 ("Back does not land on the half-loaded link") therefore has no test that would fail if it broke. | Reproduced: with a `console.log(location.hash)` added at line 68 in a throwaway copy, the output is `#/acme/docs/pull/12/file/docs/two%20words%25.md`, the resolved form, before `before` is read. By inspection, changing line 1039 to `{ replace: false }` fails no test in `pr-file-links.test.tsx` or `e2e/pr-file-links.spec.ts`: the unit check is vacuous for the reason above, and no e2e test calls `goBack()` after a cold link. Back from the resolved PR then lands on `#/acme/docs/pull/12/files/1`, which re-runs the cold load. | Hold the manifest with `deferred()`, read `history.length` before resolving it, and assert it is unchanged after resolving. Drop the `pushState` spy or replace it with a `hashchange` counter. Add an e2e test: start on `#/acme/docs`, set `location.hash` to `#/acme/docs/pull/12/files/1`, release the manifest, then `goBack()` and expect `#/acme/docs`. |
| WP12R-3 | Low | Bugs | `src/lib/app-context.tsx:1022`, `:1090-1100`, `:1115-1120` | `pickLinkedPRFile` sets the error as a side effect. Nothing on the PR path clears it again: `selectPRFile` and the warm branch never call `setError(null)`. Before WP-12, a link error left the PR without files. Now the PR stays usable, so the stale error sits beside working content. | Open `.../pull/12/file/gone.md`. The header shows "The linked file is not in this PR." Click `guide.md` in the sidebar, which opens and loads. The error stays in the header for the rest of the PR session, beside a file that loaded correctly. Back and Forward to valid path links keep it too. | Clear the error in `selectPRFile` (or at the start of the warm branch) before resolving, and set it only from the resolve result. |
| WP12R-4 | Low | Compliance | `scripts/check-layout.mjs:83-89` | The LR-26 patterns miss common ways to change the address bar, and flag code that does not touch it. | Reproduced with a planted tree in `/tmp`. These lines in `src/components/A.tsx` all pass the check: `location.href = "#/a/b/pull/1"`, `window.location.assign("#/a/b")`, `location.replace("#/x/y")`, `const { hash } = window.location`, `const loc = window.location; loc.hash = "#/z"`, `globalThis.history.back()`, `self.history.pushState({}, "")`, `const { history: h } = window` and `window["history"].back()`. Only `document.location.hash` was caught. In the other direction, a local undo stack (`const history = undo.history; history.push("x")`) fails with `LR-26 ... uses history`. So does `location.hash` inside a multi-line template literal, because strings are blanked one line at a time. | Add patterns for `location.href =`, `location.assign(`/`replace(`, `{ hash }`/`{ history }` destructuring from `location`/`window`, and `(globalThis\|self)\.history`. Match `window["history"]` as the comment above the patterns already claims. Accept the local-`history` false positive as documented, or narrow pattern 4 to `history.(back\|forward\|go\|pushState\|replaceState\|state\|length)`. Add the planted lines above to `nf80_lr26_only_the_route_adapter_touches_the_address_bar`. |
| WP12R-5 | Low | Bugs (missing proof) | `src/lib/app-context.tsx:1115-1119`, `:1155-1160` | Two new behaviours have no test. (a) The warm branch: a hashchange to a path link, or a legacy index link, of the PR already loaded resolves and then replaces. The base-path fallback there is also untested. (b) The dirty-editor confirm path now publishes the target (`if (held) routeAdapter.publish(target)`), which is needed because cold PR links no longer write the address themselves. Only the cancel path is tested (`branch-navigation.test.tsx:91`). | By inspection: delete the `publish(target)` on line 1159. With unsaved edits on `blob/main/spec.md`, the user goes Back to `#/acme/docs/pull/12` and confirms "Discard". The PR opens, but the address still shows `blob/main/spec.md`: the cold PR flow writes nothing when no file is named. A reload then opens the discarded file instead of the PR, and no test fails. Similarly, changing the warm-branch write to `"push"` fails no test. | Add a unit test in `pr-file-links.test.tsx`: dirty editor, hashchange to `#/acme/docs/pull/12`, confirm, and expect `location.hash` to be the PR. Add a warm-branch test: with the PR loaded, a hashchange to `.../files/1` gives the path form with `history.length` unchanged. A hashchange to an old base path selects the renamed file. |
| WP12R-6 | Low | Compliance (docs match code) | `docs/design/l2-links-routing.html:61` (figure label and SVG), `docs/assets/diagrams/l2-links-routing.drawio` | The diagram and its label say "The adapter calls hash-router.ts to parse and build" (edge `adapter → route`, "parse, build"). As built, `route-adapter.ts` imports nothing. The adapter card on the same page says "app-context and PRDetail call the pure modules and pass it finished hashes". The `hash-router.ts` box lists `parseRoute`, but the function is `parseHash`. PRDetail, page.tsx and SignInBanner call the adapter but are not on the diagram. | An owner or builder reading the diagram for WP-13 puts mode parsing inside the adapter, so the adapter would take on the rules LR-12 keeps pure. That contradicts the card and the as-built code, and it is rework at review time. | Redraw the edge as `app-context → route` ("parse, build") and keep the `app-context → adapter` "publish" edge. Rename the box text to `parseHash, buildRoute`. Re-export the SVG and update the inline label. |
| WP12R-7 | Nit | Compliance | `src/app/page.tsx:4`, `:17` | page.tsx imports `buildFileHash` from `@/lib/hash-router` and `parseHash` from `@/lib/routing/route`: two names for the same module in one file. | A reader of page.tsx cannot tell whether the two modules differ, as they did before WP-12, when `hash-router.parseHash` hid path links. | Import both from `@/lib/routing/route`, or both from `hash-router`. |

## Checked and found sound

**Cold-link ordering (F-84, F-85)**
- `navigateToHash` passes `fromLink = true`, so `_openPRInternal` writes nothing before the manifest (`app-context.tsx:1035`).
- `settle` resolves the head path first, then the base path (Q-RT-5), and publishes with replace only when the link names a file. A link with no file keeps `#/o/r/pull/N`, with any `anchor` (Q-RT-8).
- `isCurrent()` drops a late manifest after any newer navigation, because `invalidateNavigation` invalidates `prLoadGuard`.
- Proven by `f84_no_hash_write_before_the_manifest`: its `location.hash` assertion catches any write that changes the address, including the `files/0` case. The e2e tests `f84_cold_path_link_opens_the_file_after_the_manifest` and `f85_legacy_index_link_opens_and_shows_the_path_form` hold the files response and assert the address before and after the release. The cold e2e test fails if resolution fell back to an index, because the PR gained `aaa-added.md` ahead of the linked file.

**Encoding and the anchor**
- Paths with spaces and `%` round-trip (`f84_path_with_spaces_and_percent_opens`; `buildRoute` encodes each segment).
- The anchor travels through `settle`, the warm branch and `reviewLinkHash`. The unit test case `?anchor=intro` and the presenter e2e test (`branch-links.spec.ts:153`) cover it.

**Warm branch and demo mode**
- The warm branch resolves against the loaded files and replaces only when the link names a file. Back to `#/o/r/pull/N` selects file 0 without writing (proven by `f84_clicking_a_file_writes_the_path_form_and_back_returns`).
- Demo mode resolves at once. With `repo` null it writes no address, the same as before WP-12. An index past the end now shows the error instead of a blank selection.

**Write-loop guard (`route-adapter.ts`)**
- `publish` sets `known` before writing. Several pushes in one tick are safe: every queued `hashchange` reads the final `location.hash`, which equals `known`.
- A replace fires no `hashchange`, and a pending push event reads the replaced hash and is ignored.
- `onExternalChange` resets `known` on each subscribe, so the StrictMode unmount and remount, and the effect re-running on `sessionKey`, are both safe.
- Restore, then confirm or cancel, keeps `known` equal to the address. Using the accurate `previous` fixes the old `lastWrittenHash`, which could be stale.
- Module-level state is acceptable with the single subscriber, AppProvider.

**Push and replace**
- A click, a comment jump or an in-PR document link pushes the path form. A cold resolve replaces (in code; see WP12R-2 for the proof). `pushMarker`/`back` keep the reference view's history behaviour.
- `replaceHash` keeps `history.state`, so a reference marker survives a replace.

**PRDetail**
- Comment-jump cancel uses `onAddressChange`, which sees both the app's own and the user's changes, and compares parsed routes with `sameRoute`. Mode is ignored, while file and anchor still count (`f84_same_route_ignores_mode_but_not_file_or_anchor`).
- The existing comment-navigation e2e tests pass, including "browser Back cancels a queued jump". This is a reasoned deviation from the plan's `onExternalChange`, and the L2 page documents it.

**Links and errors**
- `reviewLinkHash` (DiffViewer) and `navigateReviewLink` (PRDetail) agree. Both match head paths only, and the base side builds a revision link (`f84_html_review_link_href_uses_the_path_form`).
- The error texts are unchanged for an index past the end. The new `no-such-path` text is plain (see WP12R-1 on its content).

**LR-26**
- Comments, prose strings and `new URL(..., window.location.href)` are not flagged. The adapter is exempt by exact path, and tests are skipped.
- `t30_layout_check_real_tree_is_clean` passes on the real tree.

**Compliance**
- Files, order and named proofs match the slice plan, and test names carry F-84, F-85 and NF-80.
- `hash-router.ts` is a plain re-export, and `buildPRHash` was removed with no remaining callers.
- The updated e2e assertions (`branch-links.spec.ts:96`, `:153`, `pr-comment-navigation.spec.ts:81`) follow the intended change rather than weakening it. `branch-navigation.test.tsx` never asserted the index form, so it needed no change.
- The plan row and the L2 page's adapter card, journeys, rules and Q-RT-5, Q-RT-8 and Q-RT-9 rows match the code, except for the diagram (WP12R-6).

**Project-specific checks**
- The static export builds with `output: "export"`.
- WP-12 adds no new dependencies and no new network destinations.
- The e2e test that seeds `localStorage.mardoc_github_token` works.
- `docs/data-and-security.md` is unaffected.

**Security pass:** no findings. Link paths only choose an index among the manifest's files and are re-encoded segment by segment on output. The reference marker merges a fixed key into the history state.

## Dispositions (builder, 2026-11-12)

| ID | Disposition |
|---|---|
| WP12R-1 | Fixed in `43982e4`. On `no-such-path` the app shows the first file, writes nothing, and the error names the path: "The linked file &lt;path&gt; is not in this PR." This holds on both the cold path (`settle`) and the warm branch. Tests: `f84_missing_path_opens_the_first_file_with_a_message` now expects the hash as followed; the e2e test `f84_missing_path_opens_the_pr_with_a_message` checks the message and the address; `f84_warm_link_to_the_open_pr_resolves_and_replaces` covers the warm case. |
| WP12R-2 | Fixed in `43982e4`. `f84_resolve_replaces_rather_than_pushes` holds the manifest and reads `history.length` before it resolves. `f84_no_hash_write_before_the_manifest` checks `history.length` in place of the `pushState` spy. Added the e2e test `f84_back_after_a_cold_link_skips_the_unresolved_address`: it starts on a blob page, follows `files/1`, waits for the path form, and Back returns to the blob page. Mutation check: with `{ replace: false }` at the cold publish, the unit test fails, and the e2e test fails on desktop and mobile (Back lands on the path form, not the blob page). The code was reverted afterwards. |
| WP12R-3 | Fixed in `43982e4`. `selectPRFile` clears the error only when it is the linked-file message (`linkedFileError` ref); other errors stay. Tests: `f84_selecting_another_file_clears_only_the_linked_file_error`, `f84_selecting_another_file_keeps_other_errors`. |
| WP12R-4 | Fixed in `524a614`. LR-26 adds `location.href =`, `location.assign(`, `location.replace(`, `globalThis.history`, `self.history`, `window["history"]`, and `{ hash }` or `{ history }` destructured from `location` or a global. The bare `history.<History member>` counts only in a file that declares no `history` of its own, so a local undo history passes. Aliases and template literals spanning lines are documented limits in the script header. Test: `nf80_lr26_only_the_route_adapter_touches_the_address_bar` covers each case and the local history. Before the change it failed (`layout check: ok`). The rule still finds all 9 uses in PRDetail as of `6d695c8`. |
| WP12R-5 | Fixed in `43982e4`. `f84_warm_link_to_the_open_pr_resolves_and_replaces`: with PR 12 loaded, `files/2` and an old base path each resolve to the path form with `history.length` unchanged and no second manifest fetch. `f84_confirming_a_link_over_a_dirty_editor_shows_its_address`: after "Discard changes" the address is `#/acme/docs/pull/12`. Mutation checks: the warm write as `"push"` fails the first test; removing `if (held) routeAdapter.publish(target)` fails the second. Both were reverted. |
| WP12R-6 | Fixed in `6a39fc4`. The edge "parse, build" runs from app-context to hash-router, and the adapter has no edge to it. The hash-router box reads `parseHash, buildRoute`. The figure label says the adapter imports no other module. The drawio source, the exported SVG and the inline copy agree. |
| WP12R-7 | Fixed in `524a614`. page.tsx imports `parseHash` and `buildFileHash` from `@/lib/routing/route`. |

## Re-review

- **Reviewer:** the same independent reviewer agent (Opus)
- **Date:** 2026-11-12
- **Fix commits:** `43982e4` (WP12R-1, -2, -3, -5), `524a614` (WP12R-4, -7), `6a39fc4` (WP12R-6), `326d39c` (dispositions, plan row). Diff `fcfe317..326d39c`; review branch fast-forwarded to `326d39c`.
- **Baseline:** no `ci` output was supplied. I did not run `npm run ci`.
- **How:**
  - Read the full fix diff.
  - Ran `npx vitest run` on `pr-file-links`, `check-layout`, `branch-navigation`, `review-links` and `routing-route`: 5 files, 60 passed.
  - Ran `node scripts/check-layout.mjs .` on the real tree: `layout check: ok`.
  - Ran `npx next build`, then `CI=1 PLAYWRIGHT_PORT=3420 npx playwright test e2e/pr-file-links.spec.ts e2e/branch-links.spec.ts e2e/pr-comment-navigation.spec.ts e2e/navigation-routing.spec.ts`: 54 passed, desktop and mobile.
  - Mutation checks on a throwaway copy of `src` (deleted afterwards), running `pr-file-links.test.tsx` against each mutant.
  - Re-ran the original LR-26 probe tree and a second one in `/tmp`.
  - Measured the header error in a throwaway Playwright probe on the static export.
  - Ran `sdlc-doclint` on the L2 page: 0 errors, 12 style warnings, the same count as before the fixes.

### Verdict

**PASS.** All seven original findings are closed, and each fix has a test that fails when the fix is reverted. I checked that for WP12R-1, -2, -3 and -5 by mutation. The re-review found two new Low findings, WP12R-8 and WP12R-9. Neither blocks owner acceptance; fix them or defer them with a backlog ID.

### Status of the original findings

| ID | Status | Evidence |
|---|---|---|
| WP12R-1 | Closed | `settle` publishes only when the link resolved. On `no-such-path` it reports the path and writes nothing (`app-context.tsx:1046-1051`). The warm branch selects with `"none"` (`:1131`). Mutation: making the publish unconditional fails `f84_missing_path_opens_the_first_file_with_a_message`. The e2e test `f84_missing_path_opens_the_pr_with_a_message` now asserts that the address stays `.../file/docs/gone.md`, and it passes on desktop and mobile. |
| WP12R-2 | Closed | Spot-verified as asked. Mutation: changing the cold publish to `{ replace: false }` fails `f84_resolve_replaces_rather_than_pushes`, which now reads `history.length` while the manifest is held. The new e2e test `f84_back_after_a_cold_link_skips_the_unresolved_address` passes on the real build. It starts on a blob page and calls `goBack()` after the rewrite, so it covers Q-RT-9 in a real browser. The `pushState` spy was replaced with a `history.length` check. |
| WP12R-3 | Closed | `selectPRFile` clears the error only while it equals the last linked-file message (`linkedFileError` ref). Mutation: deleting that line fails `f84_selecting_another_file_clears_only_the_linked_file_error`. `f84_selecting_another_file_keeps_other_errors` shows that a comments error survives a selection. |
| WP12R-4 | Closed | Re-ran the original probe tree. `location.href =`, `assign`, `replace`, `{ hash }` and `{ history: h }` destructuring, `globalThis.history`, `self.history` and `window["history"]` are now caught. A local `history` passes. The alias and multi-line template cases remain, and the script header now documents them. The real tree passes. A residual gap in the new local-history exemption is recorded as WP12R-9. |
| WP12R-5 | Closed | Mutation: the warm write as `"push"` fails `f84_warm_link_to_the_open_pr_resolves_and_replaces`. Removing `if (held) routeAdapter.publish(target)` fails `f84_confirming_a_link_over_a_dirty_editor_shows_its_address`. The warm test also covers the base-path fallback and the missing path with no second manifest fetch. |
| WP12R-6 | Closed | The drawio source, the exported SVG and the inline copy each contain `parseHash, buildRoute` and the `e-app-route` edge, and none of them names `parseRoute`. The figure label says the adapter imports no other module, which matches `route-adapter.ts`. |
| WP12R-7 | Closed | `page.tsx:16` imports both names from `@/lib/routing/route`. |

### New findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| WP12R-8 | Low | Bugs | `src/lib/app-context.tsx:1030`; `src/app/page.tsx:226` | The WP12R-1 message puts the path in the middle of the sentence: "The linked file `<path>` is not in this PR." The header shows errors in a `max-w-48 truncate` span with no `title` attribute. For any path longer than about 15 characters, "is not in this PR" is cut off, and the user cannot read the full message. | Measured on the static export at desktop 1280 px and iPhone 14. Open `#/acme/docs/pull/12/file/docs/guide/onboarding/setup.md`. The error span is 192 px wide but its text needs 364 px. The header reads roughly "The linked file docs/guide/onbo…" and never says the file is missing, while the PR shows a different file. The e2e test passes because CSS truncation does not affect `toBeVisible`. | Lead with the outcome: "Not in this PR: `<path>`". Also add `title={error}` to the span so the full text is reachable. |
| WP12R-9 | Low | Compliance | `scripts/check-layout.mjs:104`, `:243-248` | The WP12R-4 fix exempts a file from the bare `history.<member>` check when `LR26_LOCAL_HISTORY` matches anywhere in it. That pattern also matches an object key (`, history:`) and a call argument (`(history)` or `, history)`), so these files are exempt even though they declare no `history` of their own. At `f0a6535` such a file failed LR-26, so this is a regression for those files. | Reproduced with a planted tree in `/tmp`. `src/components/Editor.tsx` contains `setUndo({ past, history: next });` then `history.back();`. `src/components/Nav.tsx` contains `track("nav", history);` then `history.pushState({}, "", "#/x");`. Both pass the layout check, and only a file without the key or argument (`Plain.tsx: history.back();`) is flagged. | Drop the file-wide exemption. Remove `length` and `state` from `LR26_BARE_HISTORY`, the only members an array-like local shares with `History`. A local undo `history.push(..)` or `history.length` then passes, while `history.back()`, `pushState`, `replaceState`, `go` and `forward` are always flagged. Add the two planted files to `nf80_lr26_only_the_route_adapter_touches_the_address_bar`. |

### Checked in the fixes and found sound

- **The linked-file error ref:**
  - `pickLinkedPRFile` no longer sets state. The `{ index, resolved }` result is used the same way in `settle` and the warm branch, and an index link past the end still gives today's error.
  - An empty manifest yields index 0, unresolved. It reports a missing path only for a path link, and it never publishes, because `files[0]` is undefined.
  - In the warm branch, the `setError` updater from `selectPRFile` and the later `reportMissingLinkedFile` apply in order, so a new missing path replaces the old message. StrictMode's double call of the updater is idempotent.
  - Errors that are not the linked-file message are left alone.
- **The warm branch:**
  - It replaces only for a resolved file link and writes nothing for a missing path or a bare `pull/N`.
  - The external-change listener has already set `known` to the followed address, so leaving it in place keeps the write-loop guard consistent.
- **The dirty-editor path:**
  - Cancel still restores the previous address (`branch-navigation.test.tsx` passes).
  - Confirm publishes the target before navigating, and the new unit test shows the address after "Discard changes".
- **The LR-26 widening on the real tree:**
  - `layout check: ok`. No current `src/` file uses any of the new patterns outside the adapter.
  - `const { pathname } = window.location` is not flagged.
- **e2e fixture:** the additions to `mockPR` (commits, trees, branches, pulls, repo) serve only the blob start page of the new Back test. They do not change any earlier test's path.
- **Docs:** the L2 page's journey and failure-table rows describe the as-followed address and the clearing rule, which matches the code. The plan row says "pending re-review".

**Security pass on the fixes:** no findings. The path in the new message is rendered as React text.
