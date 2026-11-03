# WP-10: independent code review

- **Reviewer:** independent reviewer agent (fresh context; did not write the code).
- **Date:** 2026-11-03.
- **Scope:** `git diff d030377..wp-10` (commits `5b25d04` to `e754a78`): `src/lib/routing/route.ts`, `src/lib/routing/view-mode.ts`, `src/lib/tree-expansion.ts`, `src/lib/hash-router.ts`, `scripts/check-layout.mjs`, `tsconfig.domain.json` and the four test files.
- **Against:** `docs/plan/WP-10.md` (accepted 2026-11-02); `docs/design/l2-links-routing.html` § 05, § 07, § 08; `docs/design/l2-repo-browsing.html` § 05, § 07, § 08; `docs/design/requirements.md` F-80 to F-89, NF-80; `REVIEW.md`.
- **Baseline:** at `wp-10` (`e754a78`): `npx vitest --run` on `routing-route`, `routing-view-mode`, `tree-expansion`, `check-layout`, `hash-router` and `review-links` tests: 6 files, 59 tests passed. `node scripts/check-layout.mjs`: `layout check: ok`. `npx tsc -p tsconfig.domain.json`: exit 0. Full `npm run ci` not run by the reviewer.
- **How:** read the full diff and its callers (`app-context.tsx` `navigateToHash` and `_openPRInternal`, `SignInBanner.tsx` `routeLabel`, `page.tsx`, `DiffViewer.tsx`, `HtmlViewer.tsx`, `RepositoryReference.tsx`). Ran throwaway probes (deleted afterwards) that compare the pre-WP-10 `parseHash` with the new wrapper over 16 inputs, build partial routes, round-trip awkward paths, bound-check `parse`, and run the `f84` round-trip assertions against a mutant of `encodePath`. Ran `check-layout.mjs` on a throwaway fixture tree. Three passes: Bugs, Security, Compliance.

**Verdict:** FAIL

Two Medium findings must be fixed, or deferred with a backlog ID, before owner acceptance. WP10-1 breaks the plan's "No user-visible behaviour changes" rule for existing callers. WP10-2 lets the NF-80 guard stop checking without saying so. Both fixes are small. There are no High findings. The three pure modules match the contract in every other case I tested.

## Findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| WP10-1 | Medium | Bugs / Compliance | `src/lib/hash-router.ts:22-28` | The compatibility wrapper is not behaviour-preserving. Before WP-10, the legacy `parseHash` returned `{type:"none"}` for a `/pull/N/file/<path>` link. Now it returns `type:"pr"` with `file` set and no `prFileIdx`. Current callers ignore `file`, so they treat the link as "PR N, first file". This breaks the plan's Goal ("No user-visible behaviour changes in this WP; `hash-router.ts` keeps today's exports for the current callers"). | Reproduced (old vs new `parseHash`). Open `#/acme/docs/pull/12/file/docs/b.md`. **Before:** `navigateToHash` shows "Invalid document link." **After:** `_openPRInternal(pr, repo, undefined)` opens PR 12 at file 0 (`docs/a.md`) without a message. `setHash(buildPRHash(repo, 12, 0))` then rewrites the address to `#/acme/docs/pull/12`, so the path is lost. `SignInBanner.routeLabel` also changes from `null` to "acme/docs pull request #12". The same applies to `#/a/b/pull/12/file/3`. | In the wrapper, return `{ type: "none" }` when `route.file?.kind === "path"` until WP-12 moves app-context to `file`. Add a wrapper test: `legacyParseHash("#/a/b/pull/1/file/x.md")` equals `{type:"none"}`. Alternatively, record that the behaviour change is accepted (owner decision) and add a test that pins it. |
| WP10-2 | Medium | Compliance | `scripts/check-layout.mjs:69-73, 193-201`; `tsconfig.domain.json` `include` | LR-12 checks three exact paths and skips any path that is missing (`continue; // missing files are not violations`). The `tsconfig.domain.json` include entries are literal paths, and `tsc` also ignores a missing one. If a module is renamed or moved, both NF-80 guards stop checking it, and CI stays green. A new file under `src/lib/routing/` is never checked. The design (l2-links-routing § 08) names the entry `routing/** except route-adapter.ts`. The script's own header says "A new file under either tree is domain code by default". LR-12 breaks both. | Reproduced. In a fixture tree, `src/lib/routing/routes.ts` contains `window.location.hash` and `src/lib/tree/expansion.ts` contains `localStorage.getItem(...)`. Neither listed path exists. `node scripts/check-layout.mjs <fixture>` prints `layout check: ok` and exits 0. A `tsconfig` whose `include` names a missing `route.ts` reported no error for that entry. In the repo, a rename of `tree-expansion.ts` in WP-13 would turn off its purity check without notice. | Make a missing listed file a violation (`LR-12 <path> missing`). In `check-layout.test.ts`, have the fixture helper write stub files, or add a test-only flag. Cover `src/lib/routing/**` except `route-adapter.ts` by walk, as LR-10 does, with the sibling allow-list. In `tsconfig.domain.json`, use `src/lib/routing/**/*.ts` with an `exclude` for the adapter. Add a case to `nf80_lr12_rejects_imports_and_banned_globals` for an impure new file under `routing/`. |
| WP10-3 | Low | Bugs | `src/lib/routing/route.ts:78-81` | `buildRoute` on a partial route writes the string `undefined` into the URL. Most of these strings parse to `none`. Missing owner or repo instead gives a well-formed route to a repository that does not exist. | Reproduced. `buildRoute({type:"repo"})` returns `#/undefined/undefined`, and `parseHash` reads it as repo `undefined/undefined`. `buildRoute({type:"repo", owner:"a"})` returns `#/a/undefined`. App-context would fetch that repo and show a "not found" error, not "Invalid document link." Also `{type:"pr"}` without `prNumber` gives `#/a/b/pull/undefined`, and `{type:"file"}` without `branch` gives `#/a/b/blob//x.md`. These two parse to `none`. | Return `"#/"` when the route lacks `repoFullName` and either `owner` or `repo`. Do the same when a `pr` route lacks a valid `prNumber`, or a `file` route lacks `branch` or `filePath`. Add one test row per case. |
| WP10-4 | Low | Compliance | `src/lib/routing/route.ts:108-124` | The plan's file table says "the old `build*Hash` as thin wrappers over `buildRoute`", and the design says the same ("build*Hash become thin wrappers"). The code has two independent builders that share only `encodePath`, and no test checks that they agree. | Reproduced. `buildBranchHash("a/b", "")` returns `#/a/b/tree/`, which parses to `none`. `buildRoute({type:"repo", repoFullName:"a/b", branch:""})` returns `#/a/b`. When WP-12 replaces `buildBranchHash`, `buildFileHash` and `buildRepoHash` with `buildRoute`, the output already differs for this input. A later encoding change made in only one builder would make Copy link and in-app links disagree. | Implement `buildRepoHash`, `buildBranchHash` and `buildFileHash` as calls to `buildRoute`. `buildPRHash` must keep `files/` until WP-12, so keep it separate and say so in a comment. Alternatively, add a test that the two builders give the same output for the same inputs. Update the plan text if the deviation is intended. |
| WP10-5 | Low | Bugs (test) | `src/__tests__/routing-route.test.ts:6-12` | `f84_round_trips_path_links_with_spaces_percent_hash_and_unicode` checks only round trips. It does not pin the built string for the path form, and its paths do not include `?`, which is the one character `parseHash` splits on. A weaker encoder passes the test and builds links that open the wrong file. | Reproduced (mutation). With `encodePath` changed from `encodeURIComponent` to `encodeURI`, every assertion in the test still passes. That mutant builds `docs/what?.md` as `#/a/b/pull/1/file/docs/what?.md`, which parses to path `docs/what`. `hash-router.test.ts` "shared-link identity" has no `?` path either. | Add `docs/what?.md` and `a&b=c.md` to the path list. Add one exact-string assertion that matches the design example: `buildRoute({type:"pr", repoFullName:"acme/docs", prNumber:12, file:{kind:"path", path:"docs/my guide.md"}, mode:"preview"})` returns `#/acme/docs/pull/12/file/docs/my%20guide.md?mode=preview`. |
| WP10-6 | Low | Compliance | `src/lib/tree-expansion.ts:31-37` | `parse` keeps the first 200 paths in sorted order. The design (l2-repo-browsing § 05, Bound) says "Beyond 200 paths the earliest in sorted order are dropped", which keeps the last 200. The plan says "keeps the first 200", so the plan and the design disagree. The cap also counts duplicates before they are removed. | Reproduced. A stored array `d000`…`d200` (201 items) parses to `d000`…`d199`. Under the design rule it keeps `d001`…`d200`. A stored array of 200 × `"a"` plus `"b"` and `"c"` parses to `{"a"}` only, so `b` and `c` reopen collapsed after a reload, although the set holds 3 paths. | Settle one rule in both the plan and the design before WP-13 builds `expansion-store`. Remove duplicates before the cap: `[...new Set(strings)].sort().slice(…)`. Add a test for the duplicate case. |
| WP10-7 | Low | Bugs | `src/lib/tree-expansion.ts:11` | `reveal` skips any path that starts with `__`. The design states the same rule, which is meant for virtual files. Real repository folders such as `__tests__/` or `__snapshots__/` at the top level match it too, so F-81 fails for files under them. The app's virtual prefixes are `__local__/` and `__new__/` (`Editor.tsx:531-532`). | Open `#/o/r/blob/main/__tests__/fixtures/README.md`. `reveal` adds nothing, so `__tests__` and `__tests__/fixtures` stay collapsed and the selected file is not visible. F-81's check ("only its ancestors are expanded and the file is highlighted and visible") fails. The unit test `f81_reveal_adds_only_ancestors` uses exactly `__tests__/a/b.md` as the case that must add nothing. | Match the exact virtual prefixes (`__local__/`, `__new__/`) and update the l2-repo-browsing § 05 row to match. Change the test to use `__local__/a/b.md` and add a positive case for `__tests__/a/b.md`. The same `startsWith("__")` exists before WP-10 at `page.tsx:227` and `app-context.tsx:943`, so it may instead be accepted as a known gap with a backlog ID. |
| WP10-8 | Nit | Compliance | `src/lib/routing/view-mode.ts:3` | The header says "Mode choice by precedence lives elsewhere", but `pickMode` is in this file. | A WP-11 builder who reads the header looks elsewhere for precedence logic and may write a second copy. | Change it to "Tokens and the precedence rule (`pickMode`); the caller supplies storage and screen facts." |

Counts: High 0, Medium 2, Low 5, Nit 1.

## Checked and found sound

**URL grammar (`route.ts` `parseHash`)**
- Every form in l2-links-routing § 05 parses: repo, `tree/`, `blob/`, `pull/N`, `pull/N/file/<path>`, `pull/N/files/<idx>`, plus `anchor` and `mode` in the query. Unknown query keys are ignored.
- `file/3` gives path `"3"`, and `files/3` gives index 3. `files/03`, `files/3/x`, `file` with nothing after it, `file/`, `file/a//b` and bad escapes all parse to `{type:"none"}`.
- PR numbers must be positive safe integers and indexes must be non-negative safe integers. `pull/0` is rejected.
- `mode` goes through `parseMode`. `Preview`, `bogus`, an empty value and a missing value all give `undefined`, and the rest of the route is kept.
- Probe: for every input without `file/` or `mode`, the wrapper's output is byte-identical to the pre-WP-10 `parseHash`. This covers `files/0`, `files/3`, trailing `/`, `tree/feat%2Fx`, bad escapes, `""` and `#/`.

**Encoding round trips (`buildRoute`)**
- Reproduced round trips for spaces, `%`, `#`, `?`, `&`, `=`, `+`, a literal `%2F`, `\`, emoji, CJK and accented names, and a leading space in a segment. Each also carries `anchor` `h?#&+` and `mode=preview`.
- Branches that contain `/` and spaces are encoded as one segment.
- Query order is `anchor` then `mode`. A PR route without `file` builds `#/o/r/pull/N`. An index `file` is never built (F-85).

**`resolvePRFile`**
- Matches the plan in every case: no ref with files, no ref with no files (`index-out-of-range`), path found, path missing (`no-such-path`), index in range, index past the end, negative index and `NaN`.

**Old builders (`buildRepoHash`, `buildBranchHash`, `buildFileHash`, `buildPRHash`)**
- Signatures and output are the same as at `d030377`. The encoding is unchanged, `buildPRHash` still writes `files/{idx}` only when the index is above 0, and the anchor encoding is the same.
- `hash-router.test.ts` and `review-links.test.ts` are unchanged and pass.
- The callers in `DiffViewer.tsx`, `HtmlViewer.tsx`, `RepositoryReference.tsx`, `page.tsx` and `app-context.tsx` build the same strings as before.

**View modes (`view-mode.ts`)**
- The tokens match Q-RT-1 and Q-RT-2 at their defaults.
- `pickMode` follows this order: link, twin of the link, remembered mode, twin of the remembered mode, fallback. Only modes in `available` qualify, and the function never throws.
- All seven rows of the plan's table pass, as do the cross-kind cases (`diff` to `inline`, `head` to `preview`).

**Tree expansion (`tree-expansion.ts`)**
- `reveal` adds only ancestors and nothing for a top-level file.
- `toggle` and `collapseAll` return new sets and never change their input.
- `serialize` is a sorted JSON array.
- `parse` is total: invalid JSON, `""`, an object, a string or mixed items give a valid set, and it never throws.

**LR-12 and the domain type check**
- The import allow-lists match the plan. `tree-expansion.ts` may import nothing, and the routing files may import only `./route` and `./view-mode`, with or without an extension.
- LR-12 uses the same banned globals and patterns as LR-10.
- `nf80_lr12_rejects_imports_and_banned_globals` covers a bad import and a banned global for each file, plus a clean case that includes a comment mentioning `localStorage`.
- `t30_layout_check_real_tree_is_clean` passes.
- `tsconfig.domain.json` includes the three files, and the domain `tsc` exits 0. `route.ts` uses only `URLSearchParams` and `decodeURIComponent`, which the domain config allows.
- The script's header comment describes LR-12.

**Security pass**
- No new dependency.
- No new I/O: the three modules touch no browser state.
- The decoded `file/` path is used only for an exact match in the PR file list.
- The `mode` value passes through an allow-list of 8 tokens.
- `parse` caps how many items it keeps.

**Compliance**
- Only the files in the plan's table changed.
- The tests carry the requirement IDs from the plan's Proof table. There is one extra test, `f81_toggle_and_collapse_all_return_new_sets`.
- The "Done when" doc updates are still open, as the plan allows before merge: l2-links-routing and l2-repo-browsing do not yet mark the modules as built, and the plan.md row is not yet DONE.
