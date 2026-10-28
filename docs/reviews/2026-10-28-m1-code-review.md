# M1 code review: GitHub sign-in stage 1

- **Reviewer:** independent reviewer agent (fresh context). **Date:** 2026-10-28.
- **Scope:** `git diff main...plan/m1-github-sign-in -- . ':!docs' ':!demos'` at `0f815ad` (product code, Worker, dev harness, tests, scripts, CI wiring). I also read `docs/setup-github-pat.md` and `docs/known-issues.md` to answer the TOOL-01 question.
- **Checked against:** `REVIEW.md`; `docs/design/github-sign-in/requirements.md`, `design.md` (Session status table, Worker routes, Callback check, Layout rules, Verification); `docs/plan.md` M1 and WP-1 to WP-9; `docs/plan/WP-1.md` to `WP-8.md`; the wave 1 checkpoint review.
- **Baseline (run by me in a scratch worktree at `0f815ad`):**
  - `node scripts/check-layout.mjs`: `layout check: ok`.
  - `npx vitest --run`: 86 files, 1188 passed, 5 expected fail (the existing `it.fails` in `html-roundtrip` and `readme-claims`).
  - `npm --prefix worker test`: 8 files, 80 passed.
  - `npx next build`: static export builds (`/` and `/_not-found`, both `○ (Static)`).
  - `out/`: no `__stub-github`, `STUB_GITHUB` or stub secret. The only `client_secret` string is Octokit's log-redaction regex. `__MARDOC_E2E__` is present, as expected for the gated hook.
  - Playwright was not run: the brief did not include a baseline `ci` output, and M1-1 and M1-2 are known failures. I read every sign-in spec instead.
- **How:** I read the full diff and its context, then traced every row of the design's session table through `session.ts` and the effect runner in `app-context.tsx`. I traced every failure code through `sign-in-window.ts`, and the Worker routes against `contract.ts` and design § Callback check. I checked tests for vacuous or over-mocked proofs, and `skip`/`fail` markers. The review hook allows writes only under `docs/reviews/`, so I could not write throwaway fixtures. Findings marked "confirmed by reading" were traced in the code but not executed.

## Verdict

**Safe for owner acceptance after CR-1 to CR-3 are fixed or recorded as DEBT-n.** The core is sound:
- The reducer matches the design table row for row.
- The pop-up adapter handles every tab-raised code.
- The Worker follows the contract and the callback decision order.
- The stage 1 gate (T-10, T-11) and T-32 are real proofs, not vacuous ones.

The Medium findings are a stale repository picker when the credential changes while Settings is open (F-40), an untested 401-to-`expired` wiring (F-34), and a layout check that misses the most likely ways I/O could reach the domain. No High findings.

## Findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| CR-1 | Medium | Bugs | `src/components/SettingsPanel.tsx:83-102` (effect deps `[isAuthenticated, isOpen]`); `:169` (`onDisconnected`) | The repository list loads only when `isAuthenticated` or `isOpen` changes. Before M1 a credential change always passed through "not authenticated", because you had to Disconnect before connecting a new PAT. Now PAT → sign-in, sign-in A → sign-in B and sign-in → saved PAT all keep `hasCredential` true. The list is not re-fetched, and `fetchUserRepos` then branches on the credential kind it sees at call time. | The F-18 path. Seed a PAT and open Settings; the picker loads every repo from `GET /user/repos`. On GitHub Connection, click Sign in with GitHub and finish. Open the Repository tab: it still lists the PAT's repos, including ones where MarDoc is not installed (against F-40). Picking one gives F-42's not-installed notice. The F-44 empty-installations message cannot appear. The list stays wrong until Settings is closed and reopened. After Disconnect restores a saved PAT, `onDisconnected` empties the list and nothing refills it. Confirmed by reading. No spec opens the picker after signing in over a PAT: `t10_no_token_in_web_storage_with_saved_pat` and the `t13_*` tests don't, and the mocks' `/user/repos` entry `acme/not-installed` would catch it. | Key the effect on `sessionKey` (plus `isOpen`). Clear `userRepos` when the key changes. Ignore a response that arrives after the key changed. Add a Playwright case: `pat: true`, sign in from the open Settings, then expect `acme/not-installed` to have count 0 in the picker. |
| CR-2 | Medium | Compliance (tests claim more than they check) | `src/lib/app-context.tsx:596-597`; `src/__tests__/auth-credential.test.tsx:234-238`; no matching e2e spec | F-34's acceptance is "Playwright with a mocked 401". No spec returns a 401 on a signed-in read. The journeys reach `expired` only through the fake clock (tick), and `f52_*_user_401` covers only `GET /user` during an attempt. The component test `f35_same_login_keeps_open_document_and_edits` says "A 401 ends the session" but dispatches `auth-error` directly. `github-api-expiry.test.ts` proves the client calls its callback, using its own callback. Nothing proves that a real 401 moves the tab to `expired`. F-35's Playwright acceptance ("make the editor dirty") is also met only by the component test; `t31_token_expiry_with_a_fake_clock` never dirties the editor. | Delete the `setOnAuthError(...)` effect at `app-context.tsx:596`. Every unit, component and e2e test in the diff still passes, by reading each one. In production, a revoked token (for example after the user revokes the App on github.com) then gets a 401. Settings shows "…sign-in has ended. Sign in again.", but the status stays `signed-in`. The banner never appears, and Settings offers neither Sign in again nor the token form (`showPatOption` is false while signed in with no error). The user is stuck until they Disconnect. | Add a Playwright case: sign in, then make `mockRepos` answer 401 for `/repos/**`. Click Refresh document and expect `status: "expired"`, the banner "Your GitHub sign-in has ended", and no "Open Settings to re-authenticate". Dirty the editor in `t31_token_expiry_with_a_fake_clock` before expiry and check the text after Sign in again. |
| CR-3 | Medium | Compliance (CI gap, LR-10, LR-11) | `scripts/check-layout.mjs:18-20, 97, 104-110` | The check is lexical, and it misses the commonest ways I/O enters a domain module. (a) It does not inspect imports other than `react`/`react-dom`, so `session.ts` may import `./credential` or `../github-api`, both of which do I/O. `worker/src/domain/*` may import `../adapters/github`. (b) The lookbehind `(?<![.\w$])` skips member access, so `globalThis.fetch(...)`, `self.localStorage`, `window2.document` and `process.env.X` all pass. The current tree is clean: `session.ts` imports only `./types` and `./contract`, and the domain files import only the contract and each other. | A later change adds `import { resetGitHubSession } from "../github-api"` to `session.ts` to run `reset-client` inline. Or `callback.ts` calls `globalThis.fetch(TOKEN_URL, …)`. `node scripts/check-layout.mjs` still prints `layout check: ok`, and `t30_layout_check_real_tree_is_clean` passes. The hexagonal rule the user's rules require is unenforced. Confirmed by reading the regex. Not executed, because the hook blocked fixture files. | Make LR-10 an allow-list of imports: `session.ts` may import only `./types` and `./contract`. LR-11: `worker/src/domain/**` may import only `./*` and `../../../src/lib/auth/contract`. Also flag `globalThis.`/`self.` followed by a banned name, and `process.env`. Add fixtures for each case to `check-layout.test.ts`. |
| CR-4 | Low | Bugs (robustness) | `worker/src/index.ts:77-80, 148`; `worker/wrangler.toml:14` | `/health` returns `{"ok":true}` without checking that `CLIENT_ID` (shipped as `""`) and `CLIENT_SECRET` are set. Only `APP_ORIGIN` is checked, and only on the other routes. | The owner deploys from a tag but forgets the `CLIENT_ID` var. Health passes, so the tab never shows `worker_unavailable`. The pop-up lands on `github.com/login/oauth/authorize?client_id=&…`, GitHub's error page, and posts nothing. The user waits, closes it, and sees "The sign-in window closed". The PAT option is offered, but the cause is hidden and F-51's 5-second path never fires. | Have `health` return 503 `{"ok":false}` when `CLIENT_ID` or `CLIENT_SECRET` is empty (body without values). The tab then reports `worker_unavailable` within 5 s. Add a route test. |
| CR-5 | Low | Compliance (docs match behaviour) | `docs/known-issues.md:63`; `docs/setup-github-pat.md:38`; `src/lib/mock-data.ts:212, 221, 253, 401` | WP-6 did **not** fully close TOOL-01. The Settings PAT help now matches the guide: `GitHubConnectionTab.tsx` steps match `setup-github-pat.md`, and `grep read:org` finds nothing in either Settings component, so F-54 passes. But TOOL-01 still says "in-app/demo token help still differs from the updated PAT guide", and the demo document's token help still tells users to tick `read:org`. The guide's line 38 ("The current in-app help also suggests `read:org`") is now false for Settings. The rest of TOOL-01 (`npm start`, lint, fixed waits, independent workflows) is outside WP-6. | A reviewer applies REVIEW.md's check that "known-issues.md matches the behaviour" and finds TOOL-01 describing Settings text that no longer exists. A new user reading the demo docs ticks `read:org`, which the guide says is not needed. | In WP-9: reword guide line 38 to say only the demo sample text suggests `read:org`, or remove it once `mock-data.ts` follows the guide. Narrow TOOL-01 to the items that remain. Record the WP-7 row's open item as done or as a DEBT-n row. |
| CR-6 | Low | Compliance (C-14) | `scripts/demo.sh:74` | C-14's acceptance is literal: "No agent-run command in the WP logs calls `wrangler deploy`". `npm run demo -- m1`, which agents run, calls `wrangler deploy --dry-run --outdir`. A dry run uploads nothing, so this is a wording conflict, not a deploy. | Someone checks C-14 by grepping WP logs or demo logs for `wrangler deploy`, finds this call and records a C-14 failure, or stops trusting the grep check. The line is also one edit away from a real deploy in an agent-run script. | Bundle with a command that cannot upload (for example `wrangler build` if the pinned wrangler supports it, or esbuild on `worker/src/index.ts`). Otherwise add the dry-run exception to C-14's acceptance text and the WP-8 log. |
| CR-7 | Nit | Compliance | `e2e/README.md:47` | The spec index lists only `sign-in-flow.spec.ts` and `sign-in-ui.spec.ts`. It omits `sign-in-journeys`, `sign-in-stage1-gate`, `sign-in-real-worker` (with its `REAL_WORKER=1` project) and `fixtures/sign-in-session.ts`. | A contributor looking for the stage 1 gate or T-32 does not find them from the e2e README. | Add the three specs and the fixture, and note that `real-worker` runs only with `REAL_WORKER=1`. |

**Counts:** High 0, Medium 3, Low 3, Nit 1.

**About known items (new detail only):**
- **DEBT-3:** besides T-32, `.github/workflows/test.yml` also skips `tsc -p dev/local-auth/tsconfig.json`, which `npm run ci` runs. A type error in the harness surfaces only locally.
- **M1-3:** no new finding. The text match in `page.tsx` also fires for a missing file in an installed repo, as M1-3 already implies.

## Checked and found sound

**Session reducer (`src/lib/auth/session.ts`) against design § Session status**
- Every table row is implemented:
  - `start` from non-attempt states saves `statusBeforeAttempt`, clears `lastError` and emits open-popup, health-check and the 10-minute deadline. `start` while `signing-in` gives `focus-popup`; while `checking-user` nothing changes.
  - In `signing-in`, the failure events map to codes: `health-failed` gives `worker_unavailable` and closes the pop-up; `popup-closed` arms the 1 s grace; `close-grace-passed` gives `window_closed`; `deadline` gives `timeout` and closes the pop-up.
  - `result(ok)` moves to `checking-user`, clears the grace and deadline timers, and arms the 10 s user check. `result(error)` returns to the status before the attempt.
  - Same login swaps the token only and keeps the session key. A new login with a clean editor does the full reset and sets the marker. A dirty editor asks and stops the 10 s timer while the question is open. Confirm takes the clean row; cancel gives `cancelled`; `user-failed` or the 10 s deadline gives `exchange_failed`.
  - `tick` and `auth-error` during an attempt move `statusBeforeAttempt`, as the checkpoint note asked.
  - Late events are ignored by nonce.
  - The `connect-pat`, `connect-embed`, `continue-without`, `disconnect` and `disconnect-and-remove-pat` rows are present.
- `failed()` always clears all three timers for the attempt's nonce. A forged `expiresIn` becomes `non_expiring_token` (I-15, CP-8).
- `expiry()` emits `reset-client` once: `expired` is not re-entered.
- `startupCredential` follows the decision order: saved PAT, then marker (never in embed mode), then none.

**Effect runner (`app-context.tsx`)**
- Events dispatched while effects run are queued, so effects run in order against the latest state. A blocked pop-up's queued `popup-blocked` clears the deadline timer that was armed just before it.
- The pop-up opens synchronously inside the click.
- `revoke` reads the token before `reset-client` clears it, and revokes only a sign-in token.
- `reset-client` separates expiry (`expireGitHubSession`, which keeps the route and state) from disconnect (`resetToNoCredential`).
- A saved PAT becomes active after a sign-in Disconnect, but not after `disconnect-and-remove-pat`.
- The hash-route effect is keyed on `sessionKey` and `awaitingSignIn`, so a same-login token swap does not re-navigate (F-35), and the reload prompt neither navigates nor shows demo data (F-32, F-37).

**Pop-up adapter (`src/lib/auth/sign-in-window.ts`)**
- The I-11 checks run in the documented order: origin, source is the attempt's pop-up, parse, nonce, still `signing-in`. A second result for the same attempt is refused (`settled`).
- Every tab-raised code has a path:
  - `popup_blocked`: `window.open` returns null or throws.
  - `worker_unavailable`: health is not 200, the body is not `{ok:true}`, the request fails, or there is no answer within 5 s. The request is then aborted.
  - `window_closed`: the 500 ms poll, then the 1 s grace. Reading `closed` throwing counts as closed.
  - `timeout`: the deadline timer.
  - `exchange_failed`: the user-check timer gives `user-failed`.
  - `cancelled`: through `guardNavigation`'s new `onCancel`.
- Health and timer callbacks are inert after `dispose`. Revoke is best effort, 5 s, `keepalive`, same-origin.

**GitHub client (`github-api.ts`, `rate-limit.ts`)**
- A sign-in token is refused before sending at or after `expiresAt`, on every retry attempt, and by stale Octokit instances (I-15). A sign-in token without an expiry is treated as expired.
- A 401 is not retried and is reported once per credential.
- `formatApiError` uses the sign-in wording for a sign-in credential and keeps today's text for a PAT.
- `fetchUserRepos` lists installations and then their repositories for a sign-in token (A-16), and paginates both.
- `fetchLoginForToken` uses a throwaway client, so the active client and caches are untouched.
- No other code path sends a GitHub token outside Octokit.

**Worker (`worker/src`) against `contract.ts` and design**
- Routes and methods match. Anything else, including `/refresh`, is 404.
- Every response goes through `respond`: `no-store`, `no-referrer`, `nosniff`, and `Access-Control-*` is stripped.
- `/login` requires `Sec-Fetch-Site: same-origin` and `Sec-Fetch-Dest: document`, validates the nonce, and sets the `__Secure-` cookie with the specified attributes and `Max-Age=600`. It expires all but the newest two older attempt cookies.
- The callback follows the six-step order. The cookie `state` is compared in constant time. The error code is pattern-checked. Only `access_token`, `expires_in` and `error` are read from GitHub's answer, so the refresh token is dropped in the adapter (I-13).
- The page escapes `<`, `>` and `&` in the result JSON, posts only to `APP_ORIGIN`, and has a fresh 16-byte CSP nonce. The install page and plain-text pages run no script.
- Revoke checks `Origin`, content type, size and token pattern, uses basic auth, and maps GitHub's 404 to 204.
- `wrangler.toml` has no bindings and no secret, `workers_dev` and preview URLs are off, and observability is off.
- `worker/test/setup.ts` fails any test that calls a `console` method (I-16, NF-15).

**Tests**
- The stage 1 gate (`sign-in-stage1-gate.spec.ts`) asserts the token is non-empty and live (it was sent to `/user`) before checking:
  - `localStorage`, `sessionStorage`, readable cookies, every IndexedDB store, Cache Storage, and Playwright `storageState` including HttpOnly cookies;
  - URLs, `Location` and `Referer` headers, `history.length` and performance entries.

  It is not vacuous.
- T-32 drives the real Worker module under `wrangler dev`. It refuses a harness that is not in stub mode, and proves the cookie attributes, CSP, cookie clearing, the PKCE round trip (the stub checks S256) and that the injected script is blocked.
- Unit tests cover each I-11 rejection; WP-5 records a mutation check. The reducer has one test per design row plus a fuzz test for totality.
- The only new skip is `sign-in-ui.spec.ts:120` (keyboard order, desktop only), with a reason. There are no new `fail`, `fixme` or `.only` markers.
- Test names carry their IDs.

**Hexagonal layout:** the current tree satisfies LR-10 and LR-11, and the check runs in `npm run ci` and in its own Actions job (gaps in CR-3).

**Dev harness and test hook cannot affect production**
- `dev/local-auth/` is excluded from the root `tsconfig.json` and the Vitest run. It is not imported by `worker/src`, it is a separate wrangler project (`mardoc-auth-local`, no routes, no `workers_dev`), and it is absent from `out/`.
- `window.__mardocAuth` is installed only when `window.__MARDOC_E2E__ === true`, a strict boolean, so a DOM-clobbered element cannot enable it. It exposes no token, only actions a same-origin script could already take, and is removed on unmount.

**Embed `init` (F-16):** `isTrustedInit` requires `?embed=true`, a framed page and `source === parent`. Cached init is replayed only in embed mode.

**CI wiring:** `npm run ci` runs:
1. the layout check;
2. Vitest;
3. the Worker's `ci` install, typecheck and tests;
4. the harness typecheck;
5. `next build`;
6. Playwright;
7. T-32 in Chromium.

The Actions workflow adds a Worker job. T-32 and the harness typecheck are missing from Actions (DEBT-3 and the note above).

**Static export and project checks**
- `next build` produces a static export, with no server routes.
- The token goes only to `api.github.com` and the same-origin Worker, and the AI feedback path sends no token.
- PAT-seeded specs keep working: start-up still reads `mardoc_github_token`, and `connectPat` persists it as before.

## Dispositions

WP-9 fixes on branch `wp-9-fixes` (from `adbae0a`). Each bug fix has its failing test committed first, then the fix; a test commit and a fix commit are listed as "test → fix".

| ID | Disposition | Commits | Tests |
|---|---|---|---|
| CR-1 | Fixed. The repository list belongs to the session key: it empties and reloads whenever the key changes, even with Settings open, skips the cache after a change and drops a response for an earlier key. Design § Settings screen says so. | `dbf98ff` → `47f32e6` | `f40_picker_reloads_on_sign_in_cr1`, `f44_empty_installations_reachable_after_sign_in_over_pat_cr1`, `f53_picker_refills_after_disconnect_restores_the_pat_cr1` (`e2e/sign-in-journeys.spec.ts`; all three failed before the fix) |
| CR-2 | Fixed (coverage). A real 401 on a signed-in read and F-35's dirty-editor acceptance now have Playwright cases. Both passed on first run: the wiring was right, only the proof was missing. No code change. | `dbf98ff` | `f34_signed_in_401_shows_expired_view_with_sign_in_again_cr2` (401 on `/repos/**` → `expired`, banner, Sign in again, token form, no "Open Settings to re-authenticate"); `f35_same_login_sign_in_again_keeps_dirty_editor_cr2` |
| CR-3 | Fixed. `scripts/check-layout.mjs` allow-lists imports (LR-10: `./types`, `./contract`; LR-11: siblings and `src/lib/auth/contract`), covers re-exports, side-effect, dynamic and `require` imports and computed imports, and flags `globalThis`, `self`, `process` (member access included) and `x.env` in the Worker domain. `config.ts` (build-time `process.env`) joins the adapters as exempt. LR-10 and LR-11 in design.md match. | `8e8b5a9` → `bbd514e` | `t30_lr10_session_imports_only_types_and_contract_cr3`, `t30_lr10_other_domain_files_import_no_adapter_or_package_cr3`, `t30_lr10_member_access_to_globals_is_caught_cr3`, `t30_lr11_worker_domain_imports_only_siblings_and_contract_cr3`, `t30_lr11_member_access_to_globals_is_caught_cr3`, `t30_allowed_imports_pass_cr3` (`src/__tests__/check-layout.test.ts`) |
| CR-4 | Fixed. `/health` answers `503 {"ok": false}` when `CLIENT_ID` or `CLIENT_SECRET` is empty, naming neither. The tab already treats it as `worker_unavailable`; a unit case and a Playwright case prove the F-51 message. The design's route table and T-23 say so. | `06cd973` → `746e179`; e2e `865d51b` | `f27_health_not_ok_without_client_id_or_secret_cr4` (Worker); `f51_worker_unavailable_on_health_503_ok_false_unconfigured_cr4` (unit); `f51_unconfigured_worker_health_shows_unavailable_cr4` (Playwright) |
| CR-5 | Fixed. The demo document's token help no longer asks for `read:org`; the PAT guide says MarDoc does not ask for it; TOOL-01 keeps only the items that remain (`npm start`, lint, fixed waits, independent workflows). plan.md's WP-7 row records it. | `071b41c`, `dc65a5b` | `e2e/sign-in-ui.spec.ts` (Settings text has no `read:org`); `grep read:org src/lib/mock-data.ts` finds nothing |
| CR-6 | Fixed. Step 5 of `npm run demo -- m1` bundles `worker/src/index.ts` with esbuild from `worker/node_modules` (ESM, `workerd`/`worker`/`browser` conditions) and keeps the stub-string and `dev/`-source checks; the source check now resolves map paths against the repo. `scripts/demo.sh` no longer contains `wrangler deploy`. `demos/m1.md` step 5 matches. | `500a62a` | Checked by hand: the product bundle has 0 stub strings and 0 `dev/` sources; the harness bundled the same way has 5 and 1, so both checks can fail |
| CR-7 | Fixed. The e2e README lists `sign-in-stage1-gate`, `sign-in-journeys`, `sign-in-framed`, `sign-in-real-worker` (with `REAL_WORKER=1` and its projects) and `fixtures/sign-in-session.ts`. | `9159ede` | — (docs) |
| DEBT-3 note | Recorded: the DEBT-3 row in plan.md now also names the skipped harness type check. | `dc65a5b` | — (docs) |

**Verification at `332206f`:** `PLAYWRIGHT_PORT=3109 npm run ci`: layout check ok; Vitest 86 files, 1205 passed, 5 expected fail; Worker typecheck and 86 tests pass; harness typecheck passes; `next build` exports. Playwright: 308 passed, 2 failed, 22 skipped, 16 did not run; both failures are `image-flows.spec.ts:124` (M1-1, known) and the skips follow from that serial file. ci stops there (DEBT-5), so T-32 ran separately: `REAL_WORKER=1 REAL_WORKER_PORT=8797 npx playwright test --project real-worker`, 4 passed.

## Re-review (2026-10-28)

- **Reviewer:** independent reviewer agent (fresh context; did not write the fixes). **Date:** 2026-10-28.
- **Fix commits:** `git diff adbae0a..ce064c7` (WP-9: `dbf98ff` → `47f32e6`, `8e8b5a9` → `bbd514e`, `06cd973` → `746e179`, `865d51b`, `071b41c`, `dc65a5b`, `500a62a`, `9159ede`, `332206f`, merge `3ad6eea`). The explainer update `aac9e81` (DEBT-6, `architecture.html` only) is included at the lead's request.
- **Baseline (run by me in a scratch worktree, detached at `ce064c7`, then `aac9e81`; `node_modules` linked from the main checkout):**
  - `node scripts/check-layout.mjs`: `layout check: ok`.
  - `npx vitest --run`: 86 files, 1205 passed, 5 expected fail. `npx tsc --noEmit -p .`: exit 0.
  - `npm --prefix worker test` (as `npx vitest --run` in `worker/`): 8 files, 86 passed.
  - Playwright, dev server on port 3217: every `sign-in-*` spec (flow, ui, stage1-gate, journeys, framed) and `embed-mode`, desktop and mobile: 109 passed, 1 skipped (the known keyboard-order skip).
  - `npx next build`, then `REAL_WORKER=1 REAL_WORKER_PORT=8797 npx playwright test --project real-worker` (T-32): 4 passed.
  - `sdlc-doclint docs/design/github-sign-in/architecture.html` at `aac9e81`: 0 errors, 0 warnings.
- **How:** I read the whole fix diff and its context. For each fix I reverted the fix lines in the scratch worktree (with `sed` or `git checkout adbae0a -- <file>`), ran the named tests, and confirmed they fail; then I restored the file and confirmed `git status` was clean. I probed the layout check with fixture trees in `/tmp/cr3-rr`. A throwaway Playwright spec for the CR-1 race could not be written (the review hook allows writes only under `docs/reviews/`), so that case is confirmed by reading plus a mutation run.

### Verdict

**All seven findings are CLOSED.** Each fix holds when I re-trace its failure scenario, and each test fails when its fix is reverted. There is one exception: CR-1's "drop a late response" guard has no test. The re-review adds two Low findings and one Nit (CR-8 to CR-10). None blocks owner acceptance. CR-8 and CR-9 can be fixed in WP-9 or recorded as DEBT-n.

### Per finding

| ID | Status | Evidence |
|---|---|---|
| CR-1 | CLOSED | Re-traced the F-18 path. `PAT → sign-in` changes `sessionKey` from `pat` to `sign-in:octo`, so the effect (deps `[isAuthenticated, isOpen, sessionKey, loadRepos]`) empties the list, skips the cache and reloads through installations. `sign-in → Disconnect → saved PAT` reloads `/user/repos`. A key change while Settings is closed is caught on the next open, because `listKey` is only updated while it is open. **Reverted** `SettingsPanel.tsx` to `adbae0a`: `f40_picker_reloads_on_sign_in_cr1`, `f44_empty_installations_reachable_after_sign_in_over_pat_cr1` and `f53_picker_refills_after_disconnect_restores_the_pat_cr1` all fail; restored, all pass. `loadingRepos` can stay `true` after a key change to `null` mid-load, but the list (and its spinner) is rendered only while `isAuthenticated`, and the next load resets it, so there is no visible effect. The late-response guard is untested: see CR-9. |
| CR-2 | CLOSED | **Reverted** the `setOnAuthError(() => dispatchSession({ type: "auth-error" }))` line in `app-context.tsx`: `f34_signed_in_401_shows_expired_view_with_sign_in_again_cr2` fails (it times out waiting for `expired`); restored, it passes. That was the exact mutation CR-2 said nothing caught. `f35_same_login_sign_in_again_keeps_dirty_editor_cr2` dirties ProseMirror, expires the token with the fake clock, signs in again as the same login, and checks the text, the hash and that no `/contents/` read happened. That meets F-35's Playwright acceptance. No code change was needed, as the disposition says. |
| CR-3 | CLOSED (residual gap in CR-8) | The named gaps are closed. Imports are now an allow-list, with re-exports, side-effect, dynamic, `require` and computed imports covered. Member access to `globalThis`, `self` and `process` is caught, and so is `x.env` in the Worker domain. **Reverted** `scripts/check-layout.mjs` to `adbae0a`: 5 of the 9 tests in `check-layout.test.ts` fail. The tree is clean at `ce064c7`. LR-10 and LR-11 in design.md match the script. The ban list is still a closed deny-list, and the exemption matches by file name: see CR-8 (reproduced). |
| CR-4 | CLOSED | `health()` returns `503 {"ok":false}` when `CLIENT_ID` or `CLIENT_SECRET` is empty, and the body names neither. **Reverted** the line: `f27_health_not_ok_without_client_id_or_secret_cr4` fails. On the tab's side, `sign-in-window.ts` treats any non-200 health as `health-failed`, and the reducer gives `worker_unavailable` and closes the pop-up. The unit case `f51_worker_unavailable_on_health_503_ok_false_unconfigured_cr4` and the Playwright case `f51_unconfigured_worker_health_shows_unavailable_cr4` pass. The Playwright case checks the F-51 text in under 5 s, the token option and that the pop-up closed. No regression in the harness: `dev/local-auth/worker.ts` fills the stub `CLIENT_ID` and `CLIENT_SECRET` in stub mode, so T-32's health probe still gets 200 (T-32: 4 passed). In real harness mode without `--var CLIENT_ID`, health now says 503, which is the right signal. Docs: see CR-10. |
| CR-5 | CLOSED | `grep -rn read:org src docs/setup-github-pat.md docs/known-issues.md` finds only guide line 38, which now says "MarDoc does not ask for `read:org`". `mock-data.ts` now asks for `repo` only. TOOL-01 keeps only `npm start`, lint, fixed waits and independent workflows. plan.md's WP-7 row records the change. |
| CR-6 | CLOSED | `scripts/demo.sh` no longer contains `wrangler deploy`. I ran step 5's esbuild command by hand to `/tmp/cr6-bundle`: it builds, and the stub-string grep counts 0. The source-map check now resolves paths against the repo root. `set +e` at line 22 keeps `grep -c`'s exit code 1 from aborting. `demos/m1.md` step 5 matches. |
| CR-7 | CLOSED | `e2e/README.md` lists the stage1-gate, journeys, framed and real-worker specs (with `REAL_WORKER=1` and its projects), and `fixtures/sign-in-session.ts`. |

### New findings

| ID | Severity | Pass | Location | Finding | Failure scenario | Fix |
|---|---|---|---|---|---|---|
| CR-8 | Low | Compliance (CI gap, LR-10, LR-11) | `scripts/check-layout.mjs:26-29` (`LR10_EXEMPT`, `GLOBALS`, `LR10_IDENTS`, `LR11_IDENTS`), `:153` (`path.basename(f)`) | The check bans a fixed list of eight names. Any other I/O global passes, and so do timers and clocks in the reducer, which design.md says has "no I/O, so tests drive it with a fake clock". The adapter exemption also matches by file name, so any file named `credential.ts`, `sign-in-window.ts` or `config.ts` anywhere under `src/lib/auth/` is exempt. | **Reproduced.** In `/tmp/cr3-rr`, `src/lib/auth/session.ts` calls `navigator.sendBeacon`, `new XMLHttpRequest()`, `indexedDB.open`, `location.assign`, `setTimeout`, `Date.now()`, `Math.random()`, `(0, eval)("fetch")`, `new Function("return fetch")`, `caches.open`, `new WebSocket`, `new BroadcastChannel`, `top.document` and `parent.opener`. `worker/src/domain/callback.ts` calls `caches.default.match` and `new Function("return fetch")`. `src/lib/auth/sub/credential.ts` has `import "../../github-api"` and `fetch("/")`. `node scripts/check-layout.mjs /tmp/cr3-rr` prints `layout check: ok` and exits 0. | Exempt adapters by exact relative path (`src/lib/auth/credential.ts` and so on). Turn the identifier rule into an allow-list for the domain. Simplest: type-check `src/lib/auth/{session,types,contract}.ts` and `worker/src/domain/**` under a tsconfig with `lib: ["ES2022"]`, `types: []` and no DOM. That catches every DOM and Workers global at compile time. Keep the lexical check for `eval`, `Function`, `setTimeout`, `setInterval`, `Date.now` and `Math.random`. Add fixtures for `navigator`, `XMLHttpRequest` and a sub-directory `credential.ts`. |
| CR-9 | Low | Bugs (test gap, F-40) | `src/components/SettingsPanel.tsx:90-104` (`loadRepos`); `e2e/sign-in-journeys.spec.ts:318-353` | The disposition says the list "drops a response for an earlier key". Nothing tests that, and the guard compares session keys rather than credentials, so two PATs (both key `pat`) look the same. | (a) **Mutation run:** I deleted `if (currentKey.current !== key) return;` and made `finally` unconditional. All three `*_cr1` Playwright cases still pass, so the guard can regress unseen. (b) **Confirmed by reading:** a saved PAT A on an account with many repositories. Settings opens and `fetchUserRepos()` paginates `/user/repos` slowly. The user clicks Disconnect (key `null`), pastes PAT B and clicks Connect (key `pat` again). B's list loads, then A's late response arrives. `currentKey.current === "pat" === key`, so A's repositories replace B's and are written to `mardoc_user_repos`. The picker shows repositories PAT B may not reach until Settings is reopened. This is unlikely: A must finish after B, which started seconds later. | Guard on a load generation, not the key. Keep a `useRef` counter that is incremented on every effect run that changes the key and on `onDisconnected`. Capture it in `loadRepos` and drop a response when it has moved on. Add a Playwright case that holds `/user/repos` for 3 s with `page.route` (registered after `mockRepos`), signs in while it is pending, waits 4 s and expects `acme/not-installed` to have count 0. |
| CR-10 | Nit | Compliance (docs match behaviour) | `worker/README.md:12` (route table), `:97-99` (runbook step 7, T-25 probe) | The Worker README still says health answers only `200 {"ok": true, …}`. Design.md's route table and T-23 now include the 503. | The owner deploys without `wrangler secret put CLIENT_SECRET` and runs step 7's `curl -i …/api/auth/health`. They get `503 {"ok":false}`, and the README neither lists this answer nor says what to do. | Add the 503 to the route table, and in step 7 add: "`503 {"ok":false}`: `CLIENT_ID` or `CLIENT_SECRET` is not set; set it (step N) and probe again." |

**Counts (re-review):** High 0, Medium 0, Low 2, Nit 1.

### Explainer update (`aac9e81`, DEBT-6)

Checked against design.md and requirements.md at the same commit:
- **Settings card, Boundary.** It says that, framed outside embed mode, the page shows "Open MarDoc in a new tab" (`_blank`, `noopener noreferrer`) and keeps the token option. This matches F-19 and design.md § Settings screen "Framed".
- **Auth state card, Interfaces and Failure.** "Starts nothing when framed (`top !== self`, or reading `top` throws): no pop-up, no health check, no session event, and its listener ignores results", exposed as `isFramed`. This matches design.md § "Top level only" and the code (`isTopLevelWindow`, `start`, `onMessage`).
- **Auth Worker card, Failure, and the "worker-down" journey.** They describe `503 {"ok":false}` for an empty `CLIENT_ID` or `CLIENT_SECRET`, treated as `worker_unavailable` with F-51's message. This matches the route table and T-23.
- **The new "framed" failure scenario.** The picker builds its options from `[data-scenario]`, so the entry appears. Its actors (`auth-state`, `settings`) exist. Its links resolve: `design.md#security-and-privacy` and `design.md#verification` match real headings.
- **Doclint:** 0 errors, 0 warnings.

One observation, not a finding: the page still marks the Auth Worker "○ To build", and the auth-state card says "To build: everything else" at the `2b79817` snapshot. Since M1 built these, the F-19 lines now sit next to pre-M1 status badges. Refreshing the badges and snapshots belongs with the M1-close docs pass, not DEBT-6. DEBT-6 can be marked DONE.

### Checked in the fixes and found sound

- **Settings list (CR-1):** `currentKey` is assigned during render, so the effect and `loadRepos` see the committed key. The Refresh button reuses `loadRepos`. `onDisconnected` still clears the list and the cache. A same-login token swap keeps the key, so F-35 is unaffected and the list does not reload.
- **Health (CR-4):** `appConfig()` is the one place `env.CLIENT_SECRET` is read (C-13). The 503 goes through `json()` and `respond()`, so it has the common headers. A missing `APP_ORIGIN` still fails closed on the other routes.
- **Layout check (CR-3):** comments are stripped before scanning, and single-line strings are blanked, so the words in a comment or string do not cause false positives. A multi-line import is reported on its specifier's line. A missing directory is not a violation. `config.ts` (build-time `process.env`) is exempt, as design.md now says.
- **Regression sweep:** the full Vitest, Worker, sign-in e2e (desktop and mobile), embed-mode and T-32 runs above all pass. `tsc` is clean.
- **Demo (CR-6):** step 2 now includes `sign-in-framed.spec.ts`. Step 5 cannot upload.
