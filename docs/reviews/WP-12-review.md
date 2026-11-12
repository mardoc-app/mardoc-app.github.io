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
