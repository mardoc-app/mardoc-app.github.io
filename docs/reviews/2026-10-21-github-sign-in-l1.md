# Design review GSI-L1: GitHub sign-in, stage 1 (L1 package)

- **Reviewer:** independent design reviewer (Opus-class, fresh context; did not write the work)
- **Date:** 2026-10-21
- **Scope:** `docs/design/github-sign-in/` at commit `8c8588d`: `intent.md`, `requirements.md`, `architecture.html` (with `diagrams/`), `design.md`. Read against `strategy.html` (L0, D-1), ADR 0001, SP-1, the R-2 baseline, `docs/risks.md` (RK-1..3), `docs/plan.md` Gate 0 and Backlog from adoption, issue #146, and the code at `2b79817df4eb4929da6809f215ed4cb3750a37da`.
- **Baseline:** no `ci` output was supplied. This is a docs-only change, so I did not run `npm run ci`. `sdlc-doclint docs/design/github-sign-in`: 0 errors, 1 warning (design.md:5, `copied-status`). `sdlc-trace`: every sign-in requirement reports "no test" (expected, no code yet); all T-n rows exist; no dangling link comes from this package (the one reported, `docs/features/README.md:58`, predates it). `src/` is unchanged between `2b94d90`, `2b79817` and `8c8588d` (verified by `git diff --stat`), so the snapshot claim holds.
- **How:** read the page and the record twice (explainer alone first, owner questions written before the record); fact-checked every S-n against issue #146 (fetched with `gh issue view 146`) and the L0 page; checked every cited line and status marker in `app-context.tsx`, `github-api.ts`, `rate-limit.ts`, `SettingsPanel.tsx`, the three iframe sites and `package.json`/`tsconfig.json`; compared the `.drawio` and `.svg` cell IDs and the four `.mmd` files with the page; walked the session table and Worker routes as a builder. Nothing was executed against GitHub or Cloudflare (no probes, no curl), and no browser render checks were run (themes, contrast, 375/1280/1800 px grids, keyboard, print). Those are CI or owner steps. "Code-read" below means traced in source, not executed.
- **Branch and commit:** per the brief, nothing was committed and no `review/` branch was made. The report is an uncommitted file in the scratch worktree (HEAD detached at `8c8588d`).

## Verdict

**CHANGES NEEDED before owner acceptance of the Gate 0 package.** 0 High, 12 Medium, 11 Low, 4 Nit.

The direction is sound and the package is unusually complete: the S-n quotes from #146 and the L0 are accurate, every line citation to the code checks out (one off by three lines), the exists/proposed markers match the code, and the explainer answers most owner questions without opening the record. No finding is a security hole or a false interface claim. The Mediums fall in three groups. The session model does not yet say enough for a builder to implement F-34, F-35 and the reload/expiry paths without inventing behaviour (1 to 3, 6). A few common user paths are missing or broken as drawn: the install-link return trip, signing in with no installation, and a PAT user whose fallback is deleted (4, 5, 7). The package takes decisions that belong to the owner or to other registers, and relies on proof and CI machinery that does not exist yet (8 to 12). None of these needs a redesign; most are a table row, a requirement row or a spike scope change.

**Process deviation (items 5 and 6 of the brief).** Assessed in [its own section](#process-deviation-and-intent-status) and as GSI-L1-12. Short form: deriving requirements and design before the owner corrected `intent.md` is not a defect in the S-n rows, which are accurate, but it means every lead-originated decision (F-53, Q-27, A-12, A-14, F-15) reaches the owner as if it were agreed. Record the owner's correction of `intent.md` (or an explicit "accepted as written") in the same step as Gate 0 acceptance, and list those decisions for an explicit call.

## Findings

| ID | Sev | Pass | Location | Finding (short) |
|---|---|---|---|---|
| GSI-L1-1 | Medium | Bugs | design.md Session status; `app-context.tsx:182,286-308,764-784` | The state the whole app gates on (`githubToken`) is not specified; one natural build loses edits on same-login sign-in again (F-35) |
| GSI-L1-2 | Medium | Bugs | design.md Session status table, Hard cases | "Same login as current" is undefined for a PAT or after expiry; several events have no row |
| GSI-L1-3 | Medium | Bugs | design.md GitHub client recap; `rate-limit.ts:136-152` | Nothing turns a 401 into `expired`, and `formatApiError` cannot know the credential kind (F-34) |
| GSI-L1-4 | Medium | Bugs | requirements A-11; design.md GitHub App; SP-1 runbook step 1 | "Request user authorization during installation = on" sends the install tab to the Worker callback; unhandled, and not what SP-1 proved |
| GSI-L1-5 | Medium | Bugs | requirements F-40..F-42, stories | No state for "signed in, MarDoc installed nowhere", the first-time reviewer's real position |
| GSI-L1-6 | Medium | Bugs | design.md Callback check step 1, `window_closed` | A callback with no cookies fails silently, with no message and no PAT option |
| GSI-L1-7 | Medium | Compliance | requirements F-53, A-13, Q-21; I-14 | Success deletes the saved PAT, the fallback the owner asked to keep (S-17) |
| GSI-L1-8 | Medium | Compliance | requirements A-19, Q-27; design.md Security; plan.md ADO-1 | Pulls ADO-1 into stage 1 against accepted Q-11 and RK-3, with no requirement row |
| GSI-L1-9 | Medium | Compliance | plan.md ADO-3 (Q-15); requirements F-71 | Owner decision Q-15 (align the in-app PAT scopes with the guide) is not carried |
| GSI-L1-10 | Medium | Compliance | design.md Verification T-10..T-18; NF-19; SP-3 | The page that carries the token is never run before build or in CI; SP-3 is too narrow |
| GSI-L1-11 | Medium | Compliance | T-30, LR-10/11, A-17; `package.json`, `tsconfig.json` | The "ci layout check" and Worker tests the design relies on do not exist; `worker/` would enter `next build` |
| GSI-L1-12 | Medium | Compliance | intent.md Status; process | Requirements and design derived before the owner corrected intent.md |
| GSI-L1-13 | Low | Bugs | requirements F-33; design.md Data | The F-33 test (`expires_in: 5`) cannot pass with the 60 s margin |
| GSI-L1-14 | Low | Bugs | design.md Hard cases; Worker cookies | "Two tabs each sign in alone" is false for cookies |
| GSI-L1-15 | Low | Security | design.md Callback check, callback page | `error` is trusted before `state`; no escaping or format rule for echoed values |
| GSI-L1-16 | Low | Security | requirements A-10; design.md Assumptions | The BroadcastChannel fallback is weaker than "F-14's test changes" suggests |
| GSI-L1-17 | Low | Bugs | design.md Worker routes | Contract gaps: revoke after expiry, missing `Origin`, free-plan exhaustion |
| GSI-L1-18 | Low | Compliance | design.md components; requirements F-10, F-32 | UI parts with no owner or requirement: banner, "Continue without signing in", PAT-active Settings |
| GSI-L1-19 | Low | Compliance | architecture.html | The page leaves four owner questions unanswered |
| GSI-L1-20 | Low | Compliance | requirements (form) | Several rows state more than one obligation or say how; Must rows with no story; missing † |
| GSI-L1-21 | Low | Compliance | intent.md S-25..S-27; requirements X-n | S-25..S-27 are not verbatim; S-19 against F-22 is a conflict with no X-row |
| GSI-L1-22 | Low | Compliance | design.md Worker, architecture.html Auth Worker card | SP-1 is cited for findings its report does not contain |
| GSI-L1-23 | Low | Compliance | requirements F-70; REVIEW.md | Doc updates miss `known-issues.md` and the new storage key row |
| GSI-L1-24 | Nit | Compliance | design.md:5 | `sdlc-doclint` warning left unexplained |
| GSI-L1-25 | Nit | Compliance | architecture.html Reality table | `rate-limit.ts:146-149` is the comment; the message is at 149-152 |
| GSI-L1-26 | Nit | Compliance | requirements F-27, T-23 | `/health` returns `version`, the test expects `{"ok":true}` |
| GSI-L1-27 | Nit | Compliance | worker-down.mmd | Diagram omits the pop-up that the text opens first |

### GSI-L1-1 (Medium, Bugs): the app's token gate is not specified; one natural build loses unsaved edits on sign in again

- **Location:** design.md § Session status (rows `login(same as current)`, `login(new or none before)`) and § App auth state; `src/lib/app-context.tsx:182` (`isAuthenticated = !!githubToken`), `:286-308` (`setGithubToken`), `:764-784` (hash-route effect), `:596-607` (`_openFileInternal`).
- **Finding:** the design keeps the credential in a new `credential` object and says same-login sign in again "calls only `initOctokit(token)`". But the app gates on the React `githubToken` state at ten sites (`:182, 452, 495, 545, 569, 593, 684, 704, 770, 789`) and on `isDemoMode`. The design never says what those hold in each session status, or which function sets them. Two builds are plausible. If the new token goes into `githubToken` state, the effect at `:765-784` lists `githubToken` as a dependency and calls `navigateRef.current(window.location.hash)` with no `guardNavigation`, so the open document is reloaded. If the builder reuses `setGithubToken`, that function also persists the token (`:297`) and breaks I-10. Only one narrow build ("leave `githubToken` as the old string at expiry, call `initOctokit` only") satisfies F-35, and it works by accident, with a stale token string in context.
- **Failure scenario (code-read, not executed):** the reviewer edits a file; the 8-hour token expires; the builder stored the new token in `githubToken`. They click Sign in again and the pop-up returns. The effect re-runs with a non-empty hash, `navigateToHash` calls `_openFileInternal`, which runs `setFileContent("")` and re-fetches from GitHub. The unsaved edit is gone and F-35's Playwright check ("the edit and route are unchanged") fails. For HTML files and PR comment text there is no draft to restore.
- **Fix:** add a table to design.md giving `githubToken`, `isDemoMode`, `isAuthenticated` and the Octokit state for each session status; name a separate `applySignInCredential` that never touches `TOKEN_KEY`; say the hash effect must not re-fire for a same-login swap (key it on login, or guard with `editorIsDirty`). Make F-35's test use a dirty editor.

### GSI-L1-2 (Medium, Bugs): the session table is not total; "same login" is undefined in common cases

- **Location:** design.md § Session status table and Hard cases; Data table (Sign-in marker).
- **Finding:** a builder has to invent behaviour for these:
  1. `login(same as current)`: a PAT credential has no `login` (nothing fetches `/user` for a PAT today), and after expiry or reload the previous login is not kept. Say which applies.
  2. `result(ok)` is shown only inside `signing-in`; `initOctokit` runs before `GET /user`, yet the `result(error)` row says "restore previous credential state". If `GET /user` fails (401, network), no row exists, and the previous credential is already replaced.
  3. No row for `result` arriving after `timeout` or `popup-closed`, for `connect-pat` from `expired`/`sign-in-again`/`signed-in`, for the `embed` credential kind, or for "Continue without signing in" (used in the start-up journey).
  4. The marker is cleared on Disconnect of a sign-in credential only. Connecting a PAT does not clear it; Disconnecting the PAT does not either.
  5. A sign-in swap does not clear `mardoc_user_repos`, the cached repo list that `SettingsPanel.tsx:78` shows first.
- **Failure scenario:** a PAT user (login `octo`, never fetched) clicks "Sign in with GitHub (replaces your saved token)" and returns as `octo`. If the build calls this "same as current", it skips PAT removal (F-53, I-14 broken), skips the marker, and keeps the PAT-era `mardoc_user_repos`; Settings then lists repositories the sign-in token cannot reach, against F-40. If it calls it "new", the full reset runs, which is fine here but then cannot be told apart from the expiry case. Separately: a user signs in, later Disconnects their PAT, reloads, and sees "Sign in again" for a session that ended on purpose (item 4).
- **Fix:** rewrite the table as a total function over (status, event) with these events added: `user-failed`, `result` outside `signing-in` (ignore), `connect-pat`, `continue-without`, `disconnect` for every credential kind. Define `lastLogin` as in-memory, kept through `expired`, and say a PAT or embed credential counts as "no previous login". Clear the marker and `mardoc_user_repos` on any change of credential kind.

### GSI-L1-3 (Medium, Bugs): nothing converts a 401 into `expired`, and the F-34 message cannot be chosen

- **Location:** design.md § GitHub client (recap), session event `auth-error`; `src/lib/rate-limit.ts:136-152`; `src/lib/github-api.ts:43-82`.
- **Finding:** `formatApiError(error, context)` is a pure function called from many `catch` blocks (for example `app-context.tsx:469, 553, 605, 698, 756`). It has no access to the credential kind. The design says it "says Sign in again … when the credential is a sign-in token" and that a 401 "has the same effect" as expiry, but names no mechanism for either. The Octokit hook in `initOctokit` is a `wrap("request")` with retry; the design adds an expiry check but no 401 reaction. The error the expiry hook throws must also satisfy `isAuthError` (status 401) or the old message appears.
- **Failure scenario:** the reviewer revokes MarDoc at github.com/settings/applications at 10:00. At 10:05 they open a file. Octokit returns 401; the catch block calls `setError(formatApiError(...))` and shows "your GitHub token is invalid or expired. Open Settings to re-authenticate." F-34 fails; the session stays `signed-in`, no banner, and the expiry check never fires.
- **Fix:** specify that the `wrap` hook dispatches `auth-error` once on a 401 for a sign-in credential, that `initOctokit` records the credential kind in a module variable that `formatApiError` reads, and that the expiry hook throws an error with `status: 401`. Add them to the GitHub client card.

### GSI-L1-4 (Medium, Bugs): the production App setting sends the install tab to the Worker callback, and SP-1 did not prove it

- **Location:** requirements A-11; design.md § GitHub App ("Request user authorization (OAuth) during installation" on); SP-1 runbook step 1 (that option **off**).
- **Finding:** SP-1's test App had the option off, read-only permissions and no webhook. The production App (A-11) turns it on. GitHub's setting text says that with the option on, the installing user is sent to the Callback URL after installation, with an authorization `code`, `installation_id` and `setup_action`, and no MarDoc `state`. The design's callback handles only `?code&state` and `?error&state`. (Confirm GitHub's exact behaviour in SP-3 with the production setting; I did not run it.)
- **Failure scenario:** a repo owner follows Settings → "Install MarDoc on more repositories" (new tab, F-41) and installs. GitHub redirects that tab to `https://mardoc.app/api/auth/callback?code=…&installation_id=…&setup_action=install`. There are no MarDoc cookies, so decision-order step 1 returns `state_mismatch`, and the page says "Return to MarDoc and try again" even though the install worked. The main new-user path ends on an error page on `mardoc.app`.
- **Fix:** either set the option off in A-11 (no redirect; nothing in stage 1 uses the extra authorization), or specify the callback for `setup_action`/`installation_id` ("MarDoc installed. Go back to the MarDoc tab and press Refresh") with an F row and a Worker test. Run SP-3 with the production App settings, and make the Settings link `rel="noopener noreferrer"`.

### GSI-L1-5 (Medium, Bugs): no state for "signed in, MarDoc installed on nothing"

- **Location:** requirements F-40..F-42 and the four stories; architecture.html Journeys.
- **Finding:** the target user is a reviewer who has never made a token. For them the likeliest first result is zero installations. F-11 and the first story assume MarDoc is already installed. F-42 covers a 404 on a deep link only, and F-41 is a link in Settings. No requirement says what the repository picker shows when `GET /user/installations` is empty.
- **Failure scenario:** a product manager signs in, Settings says "Signed in with GitHub as pm", and the repository list is empty with no text. They conclude sign-in is broken and close the tab; the PAT option is behind a control they have no reason to open.
- **Fix:** add an F row (Must) with copy and acceptance: empty list shows "MarDoc isn't installed on any repository you can reach", the install link, "ask a repository owner", and the token option. Cover it in a story.

### GSI-L1-6 (Medium, Bugs): a callback with no usable cookies fails silently; closing races the message

- **Location:** design.md § Callback check step 1, § Sign-in result message ("nonce: null … the tab ignores"), result code `window_closed`; architecture.html failure card "State mismatch".
- **Finding:** when the nonce cookie is missing, the Worker posts `nonce: null`, which the tab must ignore. The pop-up then closes itself, the tab sees `popup-closed` with no result, and reports `window_closed`, which "shows no error" and no PAT option. That contradicts F-52 ("show what failed and offer the PAT") for the most likely `state_mismatch` cause. Separately, the tab detects closure by polling `popup.closed` (the design does not say how), and the callback calls `postMessage` and then `window.close()`. If the poll fires first, `popup-closed` moves the state back and the later result is ignored, so a successful sign-in is reported as `window_closed`.
- **Failure scenario:** a visitor with cookies restricted for `mardoc.app` (strict privacy mode) clicks Sign in. They approve on GitHub, the window flashes and closes, and nothing is shown. They repeat it three times with the same result and have no hint to use a token.
- **Fix:** carry the (non-secret) nonce inside `state` (for example `state = nonce.random`), so the callback can echo it even without cookies and the tab can show `state_mismatch`. Treat `popup-closed` as provisional: wait about 1 s† for a result before reporting, then show "The sign-in window closed. Try again, or use a token."

### GSI-L1-7 (Medium, Compliance): success deletes the saved PAT, the fallback the owner asked to keep

- **Location:** requirements F-53, A-13, Q-21, I-14; intent.md Affected users ("Existing PAT users: keep their saved token"); S-17, C-17.
- **Finding:** F-53 removes `mardoc_github_token` once sign-in succeeds. It is a lead decision (Q-21, PENDING) that reverses the intent table and the L0 line "the PAT option stays". No X-row records the conflict. F-53's acceptance says "sign in and confirm", but the design has no confirm step: "the click is the confirmation" is only a button label. I-14 ("at most one credential") exists mainly so the F-30 gate test is clean; a clean test profile does that without deleting anything.
- **Failure scenario:** a designer uses a PAT for an org repo `org/docs`. They try Sign in with GitHub. It succeeds, but MarDoc is not installed on `org/docs` and the owner's approval takes days. The PAT is already deleted. `org/docs` is unreachable until they make and paste a new token, which is the step this feature exists to remove.
- **Fix:** default to keeping the saved PAT, inactive while a sign-in credential is active ("one active credential"), restored on Disconnect of the sign-in. If the owner prefers deletion, make F-53 a Could with a real confirmation and add the X-row.

### GSI-L1-8 (Medium, Compliance): the `init` listener fix is pulled into stage 1 against accepted decisions, with no requirement row

- **Location:** requirements A-19, Q-27; design.md § Security ("Forged `init`"), T-15; architecture.html Concerns and Reality; plan.md ADO-1; risks.md RK-3; mardoc requirements Q-11 (DONE).
- **Finding:** Q-11 (accepted 2026-10-21) put the origin, source and embed-mode checks into the **SEC-01 closure criteria** (ADO-1, due with SEC-01 on 2026-11-17). L0 says stage 1 waits for a SEC-01 owner and date, not for the fix. Q-27 asks to ship them before stage 1. It is a scope addition with no F/NF row, no work package, no X-row, no amendment to RK-3 or ADO-1, and ADO-1 covers four listeners (`init`, `file:content`, `theme:change`, image bridge) while T-15 tests only `init`.
- **Failure scenario:** M1 work packages are cut from F/NF rows. Nothing there requires the `init` checks, so they are not planned. Stage 1 ships. A rendered document posts `{type:"init", token:"<attacker PAT>"}`; `applyInitData` (`app-context.tsx:324-331`) swaps the Octokit client, and the user's next comment is written to the attacker's account. The architecture page told the owner the default was that this ships first.
- **Fix:** either add an F row (Must, stage 1, source RK-3/Q-27) naming which listeners and tests, plus a plan.md dependency, or say stage 1 ships with RK-3 open and amend A-19, Q-27 and the Concerns row. Add an X-row against Q-11 either way.

### GSI-L1-9 (Medium, Compliance): owner decision Q-15 / ADO-3 is not carried

- **Location:** plan.md Backlog from adoption (ADO-3, stage "Sign-in L1"); `SettingsPanel.tsx:196-221`; setup-github-pat.md; requirements F-71.
- **Finding:** Q-15 (accepted) says the guide is right and the UI is aligned "when Settings changes for sign-in". ADO-2 and ADO-4 are carried (F-72, Q-28). ADO-3 is not: F-71 only links the guide. The in-app panel still tells users to make a classic token with `repo` and `read:org`, while the guide lists fine-grained permissions first.
- **Failure scenario:** stage 1 ships. A user whose sign-in fails opens "Use a personal access token" and is told to create a classic `repo` token: the broad, long-lived credential the feature exists to retire, from the fallback path.
- **Fix:** add an F row (Should or Must) that the in-app PAT instructions match setup-github-pat.md, with a check that the panel no longer names `read:org`.

### GSI-L1-10 (Medium, Compliance): the token-carrying page is never run before build or in CI; SP-3 is too narrow

- **Location:** design.md § Verification (T-10..T-18), NF-19, A-15, Q-23; plan.md SP-3; SP-1 Method ("returns only JSON").
- **Finding:** SP-1 proved routing and scoping with a Worker that returns JSON only. SP-3 asks only whether `window.opener` survives github.com. Nothing proves that the real callback HTML runs through the Cloudflare proxy: the nonce'd inline script, the CSP, `window.close()`, the cookie round trip, and any HTML-rewriting features of the zone. In CI, NF-19 and A-15 mock `/api/auth/*` with Playwright routes, so the Playwright "mocked exchange" must also fake the callback page. The page and script that carry the token run only in the owner demo (T-26). The design's own evidence that the opener survives is a curl of the unauthenticated `/login` and `/login/oauth/authorize` pages, which can differ from the signed-in consent page.
- **Failure scenario:** the zone has Rocket Loader or script rewriting on. The callback script's type is rewritten, `postMessage` never runs, the pop-up stays blank until the 10-minute timeout, and every CI check is green because the test double posts the message itself.
- **Fix:** widen SP-3 to serve the real callback page (imported from the product module) through the live zone and run it in the five browsers, recording the zone's HTML-rewriting settings, with a signed-in GitHub account and the production App settings. In CI, add one Playwright run that drives the real Worker module (Miniflare or `wrangler dev` with a stubbed GitHub) so the real page posts to the real tab. Run SP-3 before the hand-off work package.

### GSI-L1-11 (Medium, Compliance): the CI machinery the design relies on does not exist

- **Location:** design.md § Layout rules (LR-10, LR-11), T-30, T-31; requirements A-17; `package.json` (`ci` = `vitest --run && next build && playwright test`), `tsconfig.json` (`include: **/*.ts`), AGENTS.md command table.
- **Finding:** T-30 is "ci layout check", but `npm run ci` has no layout check and no `sdlc-trace` step, although AGENTS.md says it does. A-17 puts Worker tests "in `npm run ci`", but there is no Worker test runner, no new devDependency list (wrangler, Workers types, a Workers-compatible test pool) and no review of that supply-chain change. `tsconfig.json` includes `**/*.ts`, so `next build` would type-check `worker/**` against the DOM lib.
- **Failure scenario:** the first `worker/src/index.ts` that uses `ExportedHandler<Env>` or `env.CLIENT_SECRET` types fails `next build`. Or the build passes by loosening types, and LR-10/LR-11 are enforced by nothing, so `session.ts` imports `window` and T-30 "passes" because no one runs it.
- **Fix:** add a first work package for the harness: a `worker/tsconfig.json` and an exclude in the root config, the layout-check script wired into `ci`, and the dependency list with justification. Otherwise mark LR-10/LR-11 as review-only.

### GSI-L1-12 (Medium, Compliance): requirements and design were derived before the owner corrected intent.md

See the section below.

### GSI-L1-13 (Low, Bugs): the F-33 test cannot pass with the 60 s margin

- **Location:** requirements F-33 acceptance; design.md § Data (`expiresAt = receivedAt + expiresIn·1000 − 60 000`); A-18.
- **Finding / scenario:** with `expires_in: 5`, `expiresAt` is 55 s in the past when the result arrives. The status goes `signed-in → expired` at once (and never passes through `expiring`, because 10 minutes† before is also past). "After 5 s the prompt appears" cannot be observed; the user never sees "Signed in".
- **Fix:** test with `expires_in: 90` and a fake clock, or define `margin = min(60 s, expiresIn / 10)`. State what happens when `expiresIn` is shorter than the margin.

### GSI-L1-14 (Low, Bugs): the sign-in cookies are shared by all tabs

- **Location:** design.md § Hard cases ("Two MarDoc tabs each sign in alone; no state is shared"), § Auth Worker (three cookies, `Path=/api/auth`, cleared at callback).
- **Finding / scenario:** the cookies are per browser, not per tab. Tab A starts sign-in, then tab B does (for example when several tabs expire together). B's `/login` overwrites A's `state`, verifier and nonce cookies. A's callback sees a different `state`, returns `state_mismatch`, and clears the cookies, so B's callback finds none and fails silently (see GSI-L1-6). Both tabs fail.
- **Fix:** name the cookies per attempt (suffix the nonce, `__Secure-mardoc_auth_<nonce>` holding state and verifier) and have the callback read the one named by the echoed nonce; correct the sentence.

### GSI-L1-15 (Low, Security): the callback trusts `error` before `state` and has no escaping rule

- **Location:** design.md § Callback check decision order (step 2 before step 3), § Worker routes (callback page).
- **Finding / scenario:** `error` from the query is copied into the result "→ that code" before `state` is checked, and the nonce is read back from a cookie. Within 10 minutes of any `/login` (an attacker page can open one in a pop-up), a link to `/api/auth/callback?error=<payload>` reaches the page with a valid nonce cookie and a chosen `error`. Same-origin document scripts can also write cookies at `Path=/api/auth`. The CSP stops injected scripts, but HTML injection (a link or text) on a `mardoc.app` page remains possible if a builder inlines the JSON without escaping `<`. The record says neither how the page encodes values nor what an allowed code looks like.
- **Fix:** allow-list the `error` value (`^[a-z_]{1,40}$`, else `exchange_failed`), check `state` first, re-validate the nonce cookie against the `/login` pattern, JSON-encode with `<` escaped, and state that the page contains no other reflected input.

### GSI-L1-16 (Low, Security): the A-10 fallback is weaker than the assumption says

- **Location:** requirements A-10; design.md § Assumptions ("T-12 changes").
- **Finding / scenario:** if the opener does not survive (A-10 wrong), `BroadcastChannel` removes the `event.source` check from I-11 and delivers the token message to every same-origin context: other MarDoc tabs and rendered-document iframes, which can listen passively. A hostile document would not need to hook `fetch` to get the token. "F-14's test changes from opener to channel" understates it: I-11, F-14, the SEC-01 concern and T-12 change.
- **Fix:** state in A-10's "If it is wrong" that I-11 is weakened and RK-1 grows, and require an ADR (the one Q-8 already promises) before the fallback is built.

### GSI-L1-17 (Low, Bugs): Worker contract gaps

- **Location:** design.md § Worker routes.
- **Finding / scenario:**
  1. `POST /revoke` returns `502 revoke_failed` for any GitHub failure. GitHub answers 404 for a token that has already expired, so Disconnect after expiry shows a failure. Map 404 to `204`.
  2. A request with no `Origin` header is neither allowed nor refused in the table.
  3. `/health`, `/login` and `/callback` are unauthenticated, and the Free plan stops at 100,000 requests a day (NF-17). A script that hits `/login` can exhaust it; sign-in then fails closed (the PAT still works) with no alert, because NF-17 is checked only at milestone close.
  4. `state`, verifier and CSP-nonce lengths and encodings are unspecified (RFC 7636 needs 43 to 128 characters).
- **Fix:** add the missing rows and values; add a dashboard alert at 50% of the daily limit to the runbook.

### GSI-L1-18 (Low, Compliance): UI parts the design names but does not own or require

- **Location:** design.md § App auth state and start-up journey ("Settings and the banner"); requirements F-10, F-32; `SettingsPanel.tsx` connected view.
- **Finding / scenario:** the "banner" (expiry warning, sign-in expired, Sign in again) is a new UI part with no card or owner. "Continue without signing in" appears in the record but in no requirement. F-10 covers only "no credential is active", while the design also puts the sign-in button on a PAT-connected Settings view. F-32 says "instead of silently showing demo data" but nothing says what the main pane shows for a retained hash route while `sign-in-again` (today `isDemoMode` is true and `_openFileInternal` shows empty content). F-42 places the "may not be installed" message in the Settings screen, but a deep-link 404 reaches the user through `setError` in the main pane. There is no `ux.html`. A builder will invent all of these.
- **Fix:** add a UI part (banner) to the components table and cards; add requirement rows for the missing states; add one short UX note or a `ux.html` with the six states.

### GSI-L1-19 (Low, Compliance): the explainer leaves four likely owner questions unanswered

- **Location:** architecture.html.
- **Finding:** see the table in "Owner questions". Missing from the page alone: what happens to my saved PAT on a successful sign-in (only the button label is mentioned); whether unsaved edits survive a reload; who operates the Worker, what it costs and what happens if the operator is away (L0's operating commitment, Q-9, the 2FA mitigation in RK-2); and what must happen before this can ship (SP-3, the App registration, ADO-1 appear only in table cells).
- **Scenario:** the owner reads only the page and approves, unaware that a Worker outage during the operator's absence cannot be fixed (Q-9) or that a reload discards unsaved HTML edits.
- **Fix:** add a short "Operating it" paragraph (operator, Free plan, rotation, Q-9) and a "What must happen first" list to the page; add the reload edit behaviour to the reload journey.

### GSI-L1-20 (Low, Compliance): requirement-row form

- **Location:** requirements.md.
- **Finding:** several rows state more than one obligation: F-10 (first option; token hidden behind a control), F-26 (no state; cookie lifetime; cleared at callback), F-42 (message; two links), F-51 (time limit; offer the token), F-52, F-60, F-70 (three files; two statements), NF-18 (keyboard; screen reader). Some say how: F-24/NF-15 ("no `console` method is called"), F-26. Must rows F-15, F-22, F-25, F-26, F-60, F-70, F-72 appear in no story and have no acceptance demo. Cookie `Max-Age=600` and `timeout` use "10 minutes" without †. NF-16 asks for p95 from five timed sign-ins, which cannot show a p95.
- **Failure scenario:** a work package covers "the first option" but not "token hidden", and the row is marked passed. A single 3.2 s run during the demo cannot be judged against a p95 of 3 s.
- **Fix:** split the multi-obligation rows, state NF-16 as "each of five runs under 3 s†" (or ask for 20), add † to the 10-minute figures, and list the uncovered Must rows in a story or give them a demo line.

### GSI-L1-21 (Low, Compliance): attribution and conflict records

- **Location:** intent.md S-25..S-27; requirements F-15, F-22, X-n.
- **Finding / scenario:** S-25, S-26 and S-27 are quoted as owner words, but they differ from the L1 brief as relayed to this review (for example S-25 reads "the PAT kept as a fallback … the 8-hour sign-in again" against "PAT kept as fallback … sign in again after 8 hours"; S-27 adds "is"). Mark them as paraphrases or use the exact text. F-15 cites "Derived from intent out of scope", which is not an ID. S-19 says "lock the worker's CORS to the MarDoc origin" while F-22 (cited to S-19) says no CORS headers at all; same-origin makes that correct, but it is a departure from the owner's words and has no X-row. S-15 is quoted without its first clause ("Tokens refresh silently"), which X-20 covers.
- **Fix:** correct the quotes or mark them; cite F-15 to C-17/A-20; add an X-row for S-19.

### GSI-L1-22 (Low, Compliance): SP-1 cited for findings its report does not contain

- **Location:** design.md § Auth Worker ("form-encoded, as SP-1 found"), § GitHub (`expires_in: 28800`, "as SP-1 criterion 4 showed"); architecture.html Auth Worker card ("SP-1 proved routing, form-encoded exchange and scoping").
- **Finding:** per the brief, SP-1's Results section is pending and not a defect. The specifics are the issue: the report as committed contains the request header (`content-type: application/x-www-form-urlencoded`, in `worker.mjs:73`) but no finding about it, and no recorded `expires_in`. They are owner-reported only. Also, SP-1's test App differs from the production App (read-only permissions, option off, no revoke call, no callback page).
- **Fix:** when the Results are filled, confirm these three claims against the pasted output; until then label them "owner-reported".

### GSI-L1-23 (Low, Compliance): documentation list is incomplete

- **Location:** requirements F-70; REVIEW.md project checks.
- **Finding / scenario:** F-70 names README, data-and-security.md and capabilities.md. REVIEW.md also requires `known-issues.md` to match. `data-and-security.md` has a "Where state lives" table that will not list `mardoc_auth_method`, and `known-issues.md` still says the 401 path asks users to re-enter a token. After release a reader of the table concludes MarDoc stores no new key.
- **Fix:** add both files to F-70's acceptance (`grep` for `mardoc_auth_method` in the table).

### Nits

- **GSI-L1-24:** `sdlc-doclint` warns at design.md:5 (`copied-status`, the word "accepted"); the checklist asks for no unexplained warnings. Link the baseline instead of restating its status.
- **GSI-L1-25:** architecture.html Reality table cites `rate-limit.ts:146-149` for the 401 message; lines 146-149 are the comment and the signature, the message is at 151 (function 149-152). The card's `131-160` range is right.
- **GSI-L1-26:** `/health` returns `{"ok":true,"version":"<git sha>"}` but F-27 and T-23 expect `{"ok":true}`; say "contains `ok: true`".
- **GSI-L1-27:** worker-down.mmd omits the pop-up that step 1 of the text opens first; the text also says "a `before` request hook" where the code uses `hook.wrap("request")`.

## Process deviation and intent status

**What happened.** The requirements skill's rule is that the owner corrects `intent.md` before requirements are derived. Here the lead seeded intent from #146, the L0 and the owner's brief, and derived requirements, design and the page in one pass. `intent.md` says "Draft until the owner has corrected it", which is honest and should stay until the owner acts.

**What the deviation did and did not cost.**
- *Not a defect:* S-10..S-24 and S-28 match their sources word for word (checked against #146 and the L0). Every S-n is cited by at least one F, NF or C row, so coverage is complete. Out of scope is not empty. The outcome is observable.
- *Defect that follows from it:* the derived rows are the lead's decisions and no one has corrected them: F-53 (delete the PAT; conflicts with the intent table, GSI-L1-7), A-19/Q-27 (scope addition, GSI-L1-8), A-12/Q-20 (marker, which F-32 depends on although it is a PENDING default), A-14/Q-22 (token revoke, against S-20's "revoke the grant"), F-15 and F-36. The intent's own Problem sentence "often broad and long-lived" has no evidence behind it. Intent and requirements already disagree in one place (PAT users keep their token), and the intent document says in that case intent is corrected first.
- *Gate effect:* if the owner accepts the Gate 0 package as it stands, the plan.md row will read ACCEPTED while intent.md still says Draft.

**Assessment and recommendation.** Not a blocker for review; a blocker for acceptance only until the owner has read intent.md. Ask the owner to correct or accept `intent.md` first (one pass, ten minutes), record it in the Gate 0 row, then list the lead-originated decisions above for an explicit yes or no. If the owner changes intent, re-derive only the affected rows.

## Size and proof sequence

**Earliest meaningful evidence.** The hand-off (pop-up, callback page, opener, cookies) is the riskiest assumption and has no real evidence yet. Order: (1) SP-3 extended as in GSI-L1-10; (2) a thin vertical slice with the real Worker callback module, the sign-in window adapter and the session module, driven by a real-Worker Playwright run; (3) expiry and 401 handling (GSI-L1-1 to 3); (4) installs and the repository list (A-16, GSI-L1-4, 5). A-16 (whether `GET /user/repos` is already installation-filtered for a user token) is a cheap owner check that can move into SP-3.

**Assumptions tested only with fakes.** The whole CI proof (T-10..T-18, NF-19) runs against a mocked exchange and a mocked callback page. Real GitHub, real Cloudflare and real browsers appear only in T-25/T-26 and SP-3.

**Candidates to split or defer.** Stage 1 as drafted bundles a four-route Worker, the session model, install UX, revoke (F-61, Should), an expiry banner (A-18), the `init` fix (ADO-1, GSI-L1-8), documentation, a browser matrix and a secret runbook. Suggested separation: the hand-off proof and slice first; revoke (F-61) and the warning banner (A-18) can follow the first usable release; ADO-1 stays with SEC-01 unless the owner decides otherwise. These are optional suggestions; the lead decides and records scope before implementation.

**Added concerns.** Each Medium above has an accepted source or a concrete scenario. GSI-L1-5 (empty installations), GSI-L1-4 and GSI-L1-9 are additions I recommend as blockers; GSI-L1-17, 18 and 23 can be deferred to the work-package plan.

## Owner questions

I wrote these before opening the record, and answered them from `architecture.html` alone.

| Question | Answer on the page | Result |
|---|---|---|
| Who benefits and why now? | § 01 Why | Answered |
| What does the user click, and how many clicks? | § 01 What improves; Settings card | Answered |
| Where does my token live, and can a document steal it? | § 06 Concerns, RK-1 row | Answered |
| What happens if the Worker is down? | § 04 journey "Sign-in is down"; § 05 | Answered |
| What if my org has not installed MarDoc? | § 04 org-install journey | Answered, but not "installed nowhere" (GSI-L1-5) |
| Do I lose my place when the token expires? | § 04 token expiry | Answered |
| Do I lose unsaved edits on reload? | Not stated | Gap (GSI-L1-19) |
| What happens to my saved PAT on sign-in? | Settings failure cell (button label only) | Partial (GSI-L1-7, 19) |
| Who runs the Worker, what does it cost, what if they are away? | Not on the page | Gap (GSI-L1-19) |
| What happens after I install from the link? | Not stated | Gap (GSI-L1-4) |
| What must be true before this ships? | Reality table lists to-build; SP-3 and ADO-1 only in cells | Partial (GSI-L1-19) |

## Checked and found sound

- **Quotes and sources.** S-10 to S-24 match issue #146 and the L0 text word for word. S-28 matches the L0. The intent document's Out of scope list is non-empty. Every S-n is cited by at least one F, NF or C. Every Q-n (Q-8, Q-19..Q-28) has a recommended default and a matching A-n with an "if wrong" column. The one-way door (Q-19) is flagged.
- **Code citations.** `SettingsPanel.tsx:97-110, 196-253`, `app-context.tsx:91, 144-146, 286-318, 324-331, 353-376`, `github-api.ts:33-41, 43-82, 1408-1430`, `HtmlViewer.tsx:358`, `DiffViewer.tsx:1120` and `RepositoryReference.tsx:53` all point at what is claimed. Status markers (Settings ◐, auth state ◐, GitHub client ◐, localStorage ●, iframes ●, Pages ●, Worker ○, App ○) match the code. The snapshot SHA is the full SHA and `src/` is unchanged since the baseline.
- **Interface claims.** `resetGitHubSession()` clears the Octokit instance and all caches, and `setGithubToken(null)` resets state as the record says. All GitHub traffic goes through the Octokit instance, so an expiry hook in `initOctokit` covers REST and GraphQL. The sandbox is `allow-scripts allow-same-origin` in all three viewers. The NF-10 permission set (Contents read/write, Pull requests read/write, Metadata read) matches the endpoints in `github-api.ts` and the permissions table in setup-github-pat.md (issue comments through Pull requests write).
- **Consistency.** Route names, cookie names, result codes, the nine states, T-10..T-31 and the traceability table agree between requirements, design.md and the page. Every F, NF and C has a traceability row. The `.drawio` and `.svg` cell IDs match; the four `.mmd` participants and order match the page's participants and journeys; every local link and anchor in the package resolves. The "eleven defaults" count is right.
- **Level and form.** Levels are declared and correct (intent, requirements and page L1; record L2). The page renders from inline CSS and SVG with a no-network CSP, links the record, requirements and ADR, and keeps every component and journey readable with JavaScript off. Headlines are claims. The page distinguishes exists from to-build at a full SHA.
- **Security design.** `state` is checked before any outbound request (I-12); the token goes only to the pop-up's opener with a fixed target origin, so a page that opens `/login` from another origin cannot receive it; a nonce plus `event.source` check blocks an iframe's forged result; the callback page has a restrictive CSP; no refresh route or refresh token exists (F-24, F-25, I-13); no CORS headers, `no-store` and no logging (F-22, NF-14, NF-15); `/revoke` needs the token and an `Origin` check; the Worker holds no storage binding. RK-1, RK-2 and SEC-01 are carried honestly as open and not accepted; stage 2 is a note only (C-16).
- **Carried decisions.** Q-10 (copy) is F-72, Q-17 is Q-28, and Q-4, Q-7 and Q-9 are carried from D-1. ADR 0001 is cited for the direction, and Q-8 is deferred to an ADR rather than decided silently.

## Owner steps

Live checks I could not and should not run: (1) SP-3 with the production App settings, a signed-in GitHub account and the real callback page, in the five browsers (GSI-L1-4, 6, 10); (2) the A-16 repository-list check against a real user token; (3) browser render checks for `architecture.html` (dark and light contrast, 375/1280/1800 px grids, keyboard selection, reduced motion, print), which are document-only and need a browser.
