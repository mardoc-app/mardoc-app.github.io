# Security review: M1, GitHub sign-in stage 1

- **Review id:** 2026-10-28-m1-security-review (findings `SR-n`)
- **Pass:** Security only. Bugs and compliance belong to the main review.
- **Target:** `plan/m1-github-sign-in` @ `0f815ad`. Diff:
  `git diff main...plan/m1-github-sign-in -- . ':!docs' ':!demos'` (79 files).
- **Read first:** `REVIEW.md`; `docs/design/github-sign-in/design.md`
  (§ Auth Worker, § Worker routes, § Security and privacy); `requirements.md`
  (F-14, F-16, F-22, F-28, F-61, NF-11, A-10); `docs/risks.md` RK-1 to RK-3;
  the L1 security review `2026-10-21-github-sign-in-l1-security.md`.
- **How:** I read the code. I also bundled `worker/src/index.ts` from
  `0f815ad` with esbuild into `/tmp/mardoc-sr/worker.mjs` and ran
  crafted requests against it in Node 26, with `fetch` stubbed and a fake
  client secret. Nothing was sent to GitHub or Cloudflare, no browser was
  launched, and no product file was changed. I did not run the repo's
  vitest or Playwright suites, because this worktree has no `node_modules`.
  Browser-only behaviour is written up as owner steps.

## Verdict

**Safe for owner acceptance once SR-1 is fixed or explicitly accepted.**
The token handoff holds up against a cross-site attacker. The checks cover
the state cookie and PKCE, `/login`'s Sec-Fetch gate, the callback page's
escaping and CSP, the opener-only `postMessage` with a fixed target origin,
and the listener's origin, source and nonce checks. The token stays in
memory only, and the Worker never returns the refresh token.

SR-1 is a new gap that neither the design nor the L1 review covers: sign-in
inside a cross-site frame (fixed in WP-9, see Dispositions). SR-2 and SR-3
are hardening fixes.

**Counts:** High 0 · Medium 1 · Low 2 · Nit 0.

| ID | Severity | Pass | Location | Finding (one line) |
|---|---|---|---|---|
| SR-1 | Medium | Security | `src/components/GitHubConnectionTab.tsx:149,162`; `src/lib/auth/sign-in-window.ts:223-226,113-131`; no anti-framing on the static app | Sign-in is offered inside a cross-site frame. Fixed in WP-9 (F-19). |
| SR-2 | Low | Security | `worker/src/index.ts:119-123` | `/revoke` body size cap was enforced too late. Fixed in WP-9. |
| SR-3 | Low | Security | `worker/src/domain/page.ts:33-36,44` | With no opener, the callback page kept the result in its DOM. Fixed in WP-9. |

---

## Findings

### SR-1 (Medium): sign-in is offered and completes inside a cross-site frame

- **Pass:** Security
- **Location:** `src/components/GitHubConnectionTab.tsx`,
  `src/lib/auth/sign-in-window.ts`; no anti-framing on the static app.
- **Finding:** sign-in was offered and could complete inside a cross-site
  frame.
- **Failure scenario:** Details are kept privately; report security issues through the
  repository's private vulnerability reporting.
- **Fix:** Offer and start sign-in only in a top-level window.
  - In `GitHubConnectionTab` and `SignInBanner`, when
    `window.top !== window.self` and not in embed mode, replace the sign-in
    button with "Open MarDoc in a new tab to sign in", linking to
    `https://mardoc.app/` with `target=_blank` and `noopener`.
  - In `createSignInWindow.start()` (and in `onMessage`, as defence in
    depth), refuse when framed. One option is a new `framed` result code
    with the PAT option shown.
  - Add a unit test for the framed refusal (an F-14 test). Record the
    framing threat in design.md § Security and privacy.
  - When hosting moves to Cloudflare (D-2), add
    `frame-ancestors 'none'` to non-embed responses as a second layer.
- **Owner step (settles the severity):** kept privately.

### SR-2 (Low): `/revoke` reads an unbounded body when there is no Content-Length

- **Pass:** Security
- **Location:** `worker/src/index.ts:119-123`.
- **Finding:** the 4096-byte body cap on `/revoke` was checked only after
  the body was read, for requests without `Content-Length`.
- **Failure scenario:** Details are kept privately; report security issues through the
  repository's private vulnerability reporting.
- **Fix:** Refuse when `Content-Length` is missing. The tab's `fetch` with a
  string body always sends it. Alternatively, read `request.body` with a
  reader and abort once 4096 bytes have arrived. Add a Worker test with a
  streamed body and no length.

### SR-3 (Low): with no opener, the callback page keeps a live token in its DOM

- **Pass:** Security
- **Location:** `worker/src/domain/page.ts:44` (the result, including
  `token`, goes into `<script type="application/json" id="result">`) and
  `:33-36` (the `else` branch only changes `#msg`).
- **Finding:** The page renders the result before it knows whether anyone
  can receive it. When `window.opener` is null, the page:
  - stays open showing "Return to MarDoc and try again";
  - keeps the result in its DOM.

  `window.opener` is null when the MarDoc tab was closed during sign-in,
  or when the opener is lost on the way through github.com (A-10).
- **Failure scenario:** Details are kept privately; report security issues through the
  repository's private vulnerability reporting.
- **Fix:**
  - In the `else` branch, remove the `#result` element, or clear its
    `textContent`, before showing the message.
  - Optionally, revoke from the page: allow `connect-src 'self'` in
    `callbackCsp` and `fetch("/api/auth/revoke", …)` with the token
    (same origin, so `Origin` passes).
  - Add a page test asserting that the no-opener branch leaves no token in
    the DOM.

---

## Not proven

| Suspicion | What would settle it |
|---|---|
| GitHub re-authorizes a returning user without a consent screen. This sets SR-1's severity and may change RK-1's wording; details are kept privately. | Owner step in SR-1 (kept privately). |
| github.com sends a COOP header that severs `window.opener`, so every sign-in lands in SR-3's no-opener branch. | SP-3 / Part B of the M1 demo in a real browser (A-10). |
| `/revoke` load against GitHub's rate limits on the App's credentials could make a real Disconnect fail with `502 revoke_failed`. Details are kept privately. | GitHub's documented or observed limit for `DELETE /applications/{client_id}/token`. If it is low, add a Cloudflare rate-limiting rule on `/api/auth/revoke`. |
| `.github/workflows/test.yml` has no `permissions:` block. The new `worker` job runs `npm --prefix worker ci`, which executes the esbuild and workerd install scripts with the repo's default `GITHUB_TOKEN` scope. | The repo setting Settings → Actions → Workflow permissions. If it is read/write, add `permissions: contents: read` at the workflow level. |
| `wrangler dev` for `dev/local-auth` may listen on all interfaces, exposing the harness on the LAN. | `lsof -iTCP:8787 -sTCP:LISTEN` while it runs, as an owner step. The impact is small either way: stub tokens are fake, and real mode needs the visitor's own GitHub login. |
| Attempt cookies use `__Secure-` rather than `__Host-` (design.md, GSI-SEC-5); no login-CSRF path was found, because the tab accepts only its own client-generated nonce. | Revisit if any `*.mardoc.app` host is added. |

## Checked and found sound

- **`/login` cross-site refusal:** reproduced. `Sec-Fetch-Site` values
  `cross-site`, `same-site` and absent all get `403`; only `same-origin` +
  `document` gets a `302` with the cookie
  `__Secure-mardoc_auth_<n>=<redacted>; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`.
  The `302` carries `Referrer-Policy: no-referrer`, so the nonce does not
  reach github.com in a `Referer`. The nonce is pattern-checked before it
  is used in a cookie name, so there is no header injection.
- **State and CSRF:** `decideCallback` makes no outbound call without a
  cookie whose state matches (reproduced: forged state gives
  `state_mismatch`, `outbound calls: 0`). GitHub's `error` is read only
  after the state check, and is pattern-checked (an
  unexpected value becomes `exchange_failed`). The comparison is
  constant-time. `readAttempt` checks that the cookie's nonce equals the
  state's nonce, and that both random parts are 43 base64url characters.
  The exchange binds the PKCE S256 verifier. The response clears the
  cookie.
- **Callback page:** reproduced. A token value containing markup
  characters appears only in escaped form. The CSP is `default-src 'none'` with a fresh
  16-byte nonce per response and `frame-ancestors 'none'`. The refresh
  token never appears in the page (`refresh token in page: false`). The
  `postMessage` target is `APP_ORIGIN`, never `*`, and an invalid
  `APP_ORIGIN` fails closed with a `500`. The install page has no script.
  With `nosniff` and no CORS, `<script src>` and cross-origin reads are
  blocked.
- **Tab listener:** `sign-in-window.ts:113-131` checks the origin, then
  `event.source === popup`, then `parseSignInResult`, then the nonce, then
  that the session is `signing-in` on this attempt, then a `settled`
  flag. Rendered iframes (wrong source), other windows and other attempts
  are ignored. I also traced the named-window case (`mardoc-sign-in`). A
  page that opened the MarDoc tab can get a handle to the popup and
  navigate it, but:
  - a page it navigates the popup to fails the origin check;
  - a forged callback lacks the HttpOnly state;
  - a cross-site `/login` gets `403`.

  So the worst outcome is a failed attempt.
- **`parseSignInResult`:** strict types, a nonce pattern, `ok: true`
  requires a non-null nonce, `expiresIn` must be an integer in
  1..86400, and the code is wrapped in a try/catch. Data arrives by
  structured clone, so there are no getters to abuse.
- **Token lifetime and storage:** `credential.ts` keeps the token in
  module scope only, and the session, events and effects carry no token
  (`types.ts:44,59`). The only storage write is the marker
  `mardoc_auth_method=github-app`. `src/lib/auth` and `worker/src` contain
  no `console.*`. Octokit's error objects redact `authorization`. A
  sign-in token without an expiry is treated as already expired
  (`github-api.ts` `initOctokit`), and requests after expiry are refused
  before they are sent. A 401 ends the session. `replaceState` keeps the
  path, query and hash only.
- **Worker hygiene:** every response carries `no-store`, `no-referrer` and
  `nosniff`. All `Access-Control-*` headers are stripped. The catch-all
  returns `Internal error` with no detail. Routes match exact paths and
  methods. `/refresh` returns `404`.
- **Exchange adapter:** it is form-encoded through `URLSearchParams` and
  uses `redirect: "manual"`. It keeps only `access_token`, `expires_in`
  and `error`.
- **`/revoke`:** it has an exact `Origin` match (reproduced:
  `https://mardoc.app.evil.com` gets `403`), requires a JSON content type,
  and checks the token pattern. A GitHub `404` maps to `204`, so the
  response is not a token-validity oracle. The endpoint is scoped to the
  App's `client_id`, and only the tab's own sign-in token is revoked on
  Disconnect.
- **Embed init versus sign-in:** the two are disjoint by URL.
  - `isTrustedInit` requires `?embed=true` and `source === window.parent !== window`.
  - In embed mode the sign-in buttons and banner are hidden
    (`GitHubConnectionTab.tsx:149,162`, `SignInBanner.tsx:33`), and the
    marker is ignored at startup (`session.ts:63`).
  - The query string cannot change without a navigation, because
    `replaceState` keeps `location.search`.
  - So a framer of `?embed=true` cannot reach a sign-in token, and a
    signed-in tab never accepts `init` (RK-3).
- **The e2e hook:** `window.__MARDOC_E2E__ === true` is a strict boolean
  check made once at mount. DOM clobbering through an `id` attribute
  yields an element, not `true`, and a cross-origin window cannot set
  properties on MarDoc's window. The hook exposes `startSignIn`, a
  token-free `getSession` and `disconnect`. It is inert in production.
- **The dev harness `dev/local-auth`:** the product bundle built from
  `worker/src/index.ts` contains no stub code (grep for
  `stub|STUB|dev/local-auth` in the esbuild output finds nothing). The
  harness imports the product module, not the other way round. Next builds
  only `src/app` and `public/`, and the root tsconfig excludes `dev/`, so
  nothing from `dev/` reaches `out/`. Stub mode needs the explicit
  `STUB_GITHUB=1` var, and blocks all outbound fetches except to the
  in-process stub. `.dev.vars` is git-ignored at the root and in `worker/`.
  `worker/wrangler.toml` has no secrets, `workers_dev = false`,
  `preview_urls = false` and observability off.
- **Supply chain (`worker/`):** there are four devDependencies, all pinned
  exactly (`wrangler 4.154.0`, `typescript 7.0.2`, `vitest 5.0.5`,
  `@cloudflare/workers-types 5.20261028.1`). The lockfile has 170
  packages, all resolved from `registry.npmjs.org`, all with `sha512`
  integrity, and no typosquat-looking names. Install scripts run only for
  `esbuild`, `workerd` and `fsevents`, as expected. The deployed Worker
  has no runtime dependencies. Licensing (LGPL in sharp/libvips through
  miniflare) is a compliance point for the main review, not a security
  one.

---

## Dispositions

WP-9 fixes on branch `wp-9-fixes` (from `adbae0a`). Each fix has its failing test committed first; "test → fix".

| ID | Disposition | Commits | Tests |
|---|---|---|---|
| SR-1 | Fixed. New requirement F-19 and test T-34. `createSignInWindow().start()` does nothing when `window.top !== window.self` (or reading `top` throws), and the result listener ignores messages while framed. The app exposes `isFramed`; outside embed mode, Settings and the banner replace every Sign in button with "Open MarDoc in a new tab" (the current URL, `target="_blank"`, `rel="noopener noreferrer"`) and keep the token option. Design § Security and privacy records the framing threat and the later `frame-ancestors 'none'` layer for D-2. No new result code: a framed start is silent, because the UI never offers it. | `6c2c67a` → `b3116ee` | Unit: `f19_start_refuses_when_framed_sr1`, `f19_start_runs_when_top_level_sr1`, `f19_result_ignored_when_framed_sr1`, `f19_reading_top_that_throws_counts_as_framed_sr1`. Component: `f19_framed_settings_{signed_out,pat_active,expired}_offers_new_tab_not_sign_in_sr1`, `f19_framed_settings_still_offers_the_token_sr1`, `f19_framed_banner_offers_new_tab_not_sign_in_again_sr1`, `f19_embed_mode_shows_no_new_tab_link_sr1`. Playwright (a `127.0.0.1` page frames the app on `localhost`): `f19_framed_app_offers_a_new_tab_not_sign_in_sr1`, control `f19_top_level_app_still_offers_sign_in_sr1` |
| SR-2 | Fixed. `/revoke` reads the body through a 4 KiB cap and cancels the stream once it is passed, with or without `Content-Length`; a declared length over 4 KiB is still refused unread. Refusing a missing `Content-Length` was not chosen, because the existing `t22_a_thrown_error_still_gets_the_common_headers` sends a stream without one and expects the read error to surface. The design's revoke row says so. | `d23ee6d` → `ede0ebe` | `f61_revoke_chunked_oversize_body_is_refused_within_4_kib_sr2` , `f61_revoke_chunked_small_body_still_revokes_sr2` |
| SR-3 | Fixed. The page script reads `#result`, clears it and removes it from the DOM before either branch, so a page left open without an opener holds no token. The optional page-side revoke was not added (it would need `connect-src 'self'` in the callback CSP). T-32 still passes in Chromium against the real Worker. | `6b33e0c` → `6e56f0e` | `f23_callback_page_removes_result_after_reading_it_without_opener_sr3`, `f23_callback_page_removes_result_after_reading_it_with_opener_sr3`, `f23_callback_page_script_removes_the_result_element_sr3` (`worker/test/page.test.ts`) |

Still open from "Not proven": the owner step in SR-1 and the RK-1 wording it may change; COOP on github.com (SP-3); `/revoke` load against GitHub's limit; the Actions `permissions:` block; the harness's listen address; cookie tossing (`__Secure-` versus `__Host-`). None is changed by WP-9.

---

## Re-review (2026-10-28)

- **Reviewer:** independent reviewer agent (fresh context; did not write the fixes). **Pass:** Security. **Date:** 2026-10-28.
- **Fix commits:** `git diff adbae0a..ce064c7`: SR-1 `6c2c67a` → `b3116ee`, SR-2 `d23ee6d` → `ede0ebe`, SR-3 `6b33e0c` → `6e56f0e`, merged in `3ad6eea`.
- **Baseline (run by me in a scratch worktree detached at `ce064c7`; `node_modules` linked from the main checkout):**
  - Vitest: 86 files, 1205 passed, 5 expected fail.
  - Worker: 8 files, 86 passed.
  - Playwright `sign-in-*` and `embed-mode`, desktop (Chromium) and mobile (WebKit): 109 passed, 1 skipped.
  - T-32 (`REAL_WORKER=1`, Chromium, after `next build`): 4 passed.
- **How:** I read the fix diff and its context. I reverted each fix in the scratch worktree and ran its tests to confirm they fail, then restored it and checked `git status` was clean. I traced the bypass routes the lead named. No browser outside Playwright was launched, nothing was sent to GitHub or Cloudflare, and no product file is changed.

### Verdict

**SR-1, SR-2 and SR-3 are CLOSED. There are no new security findings.** On Q-1, I agree a framed `start()` should stay silent (reasons below). The "Not proven" items from the original review are unchanged, and the owner step in SR-1 still settles RK-1's wording.

### Per finding

| ID | Status | Evidence |
|---|---|---|
| SR-1 | CLOSED | **Adapter.** `start()` returns before dispatching when `!isTopLevelWindow(win)`. `onMessage` also refuses while framed. `isTopLevelWindow` is `try { win.top === win.self } catch { false }`. **Reverted** both checks: `f19_start_refuses_when_framed_sr1`, `f19_result_ignored_when_framed_sr1` and `f19_reading_top_that_throws_counts_as_framed_sr1` fail. With only the `start` check reverted, 2 fail; with only the `onMessage` check reverted, 1 fails. So each layer has its own test. **UI.** I forced `isFramed` to false in `GitHubConnectionTab` and `SignInBanner`: the four `f19_framed_*_offers_new_tab_*` component tests fail. **Browser.** `f19_framed_app_offers_a_new_tab_not_sign_in_sr1` passes in Chromium and WebKit. A `127.0.0.1` page frames the app on `localhost`. The test asserts that no Sign in button is shown, that the new-tab link has the frame's URL, `_blank` and `noopener`, and that the token option is there. It also asserts that a scripted `startSignIn()` leaves the session `signed-out`, with 0 `/login` requests, 0 health requests and no pop-up. The control `f19_top_level_app_still_offers_sign_in_sr1` passes. The original failure scenario now reaches neither `window.open` nor the listener. |
| SR-2 | CLOSED | `/revoke` still refuses unread when `Content-Length` is over 4096 or not a number. Otherwise it reads through `readCapped`, which cancels the reader as soon as the byte count passes 4096. **Reverted** the fix: `f61_revoke_chunked_oversize_body_is_refused_within_4_kib_sr2` fails; restored, it passes. `f61_revoke_chunked_small_body_still_revokes_sr2` shows that a chunked valid body still revokes. The cap now counts bytes, not UTF-16 units, so it is slightly stricter, and a real token body is under 300 bytes. The residual is one runtime chunk read past the cap before the check, which the runtime's chunk size bounds. |
| SR-3 | CLOSED | The page script now reads `#result`, sets `textContent = ""` and calls `remove()` before it looks at `window.opener`, so both branches leave no token in the DOM. **Reverted** `worker/src/domain/page.ts` to `adbae0a`: all three `f23_callback_page_removes_result_*_sr3` tests fail. T-32 against the real Worker under `wrangler dev` still passes (4/4), so the CSP nonce script still runs and posts. The residual is not a finding; a reload gets `state_mismatch` and no token. |

### Bypass routes traced for SR-1

- **Embed path (`?embed=true` framed by a hostile page).** `isEmbedded` hides every sign-in control, and `start()` still refuses, because the page is framed. `isTrustedInit` still requires `source === window.parent`; no sign-in token is reachable (RK-3). The new-tab link renders only when `!isEmbedded`, so its `href` never carries `embed=true`.
- **`window.top` that throws.** Browsers do not throw on reading `top` across origins (it is a `WindowProxy`, and identity comparison is allowed). The `catch` treats a host that does throw as framed, which fails closed. The unit test covers it.
- **Sandboxed frame** (for example `sandbox="allow-scripts allow-popups"`, with or without `allow-popups-to-escape-sandbox`). The frame gets an opaque origin, but `top !== self` still holds, so it is refused. Without `allow-popups`, the new-tab link cannot open; the token option remains, and an opaque origin has no `localStorage` anyway.
- **Hydration window.** `isFramed` starts `false` and is set in a mount effect, so the first paint can show Sign in. A click in that moment reaches `start()`, which refuses. Nothing opens and no event is dispatched.
- **Other ways to start an attempt.** The only `open-popup` effect comes from a `start` event. `start` is dispatched only by `createSignInWindow().start()`, which the e2e hook also uses (the Playwright case above covers that path). Even if a `start` event were dispatched some other way, `onMessage` refuses the result while framed.
- **A top-level window opened by another page.** It is not framed, so sign-in is offered; this is not clickjacking. Details are kept privately. When hosting moves to Cloudflare (D-2), `Cross-Origin-Opener-Policy: same-origin` (with `frame-ancestors 'none'`) is suggested for the D-2 note in design.md § Security and privacy. This is optional.
- **The new-tab link's `href`** is the frame's current URL, so a framer chooses the route the new tab opens at. That is no more than any link can do, and `noopener noreferrer` gives the new tab no handle back.

### Q-1: should a framed `start()` stay silent or report a result code?

**Stay silent (agree with the recommendation).**
- The UI never offers Sign in in a frame. The only user-reachable call is a click during the one-effect hydration window, and the button becomes the new-tab link straight away.
- A result code would add a value to the shared failure-code set, the message table and the reducer's rows. That is more surface for a path no user can take.
- Silence also tells a framing page nothing.

Record this as an interpretation in design.md § Top level only ("start does nothing; no result code") if it is not already explicit. The current text, "no pop-up, no health check, no session event", already implies it.

### New findings

None in the security pass. The re-review's code findings CR-8 to CR-10 are in [the code review](2026-10-28-m1-code-review.md#re-review-2026-10-28).

### Checked in the fixes and found sound

- `OpenInNewTabLink`: `target="_blank"` and `rel="noopener noreferrer"`. The `href` is `window.location.href`, or `/` when rendering on the server. It carries no token.
- `FRAMED_HINT` and the link text match F-19's acceptance and design.md § Settings screen.
- `isFramed` is exposed through context and never persisted. `SignInBanner` shows the link in place of Sign in again but keeps "Continue without signing in".
- The `/revoke` order is unchanged: `Origin`, then content type, then declared length, then capped read, then JSON and token pattern. `readCapped` returns `""` for a missing body, which then fails `JSON.parse` and gives 400.
- `health()`'s 503 body is `{"ok":false}`, with no value or variable name. The test asserts that neither the secret nor the client ID appears.
- The callback page script stays one nonce'd inline script. Its new statements add no input reflection (I-17 is unchanged).
