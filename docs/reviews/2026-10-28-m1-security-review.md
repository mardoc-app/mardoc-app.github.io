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

SR-1 is a new gap that neither the design nor the L1 review covers. A
hostile site can frame `mardoc.app`, trick the user into clicking Sign in,
and end up with a signed-in MarDoc instance it can steer and clickjack.
SR-2 and SR-3 are hardening fixes.

**Counts:** High 0 · Medium 1 · Low 2 · Nit 0.

| ID | Severity | Pass | Location | Finding (one line) |
|---|---|---|---|---|
| SR-1 | Medium | Security | `src/components/GitHubConnectionTab.tsx:149,162`; `src/lib/auth/sign-in-window.ts:223-226,113-131`; no anti-framing on the static app | Sign-in works inside a cross-site iframe, so a hostile framer can clickjack sign-in and then drive the signed-in frame (for example, PR approval). |
| SR-2 | Low | Security | `worker/src/index.ts:119-123` | `/revoke` reads the whole body when there is no `Content-Length`; the 4 KiB cap is enforced only after reading. Reproduced with 8 MiB. |
| SR-3 | Low | Security | `worker/src/domain/page.ts:33-36,44` | With no opener, the callback page leaves a live, unrevoked 8-hour token in its DOM. |

---

## Findings

### SR-1 (Medium): sign-in is offered and completes inside a cross-site frame

- **Pass:** Security
- **Location:** `src/components/GitHubConnectionTab.tsx:149,162`. The
  button is hidden only by `isEmbedded`, which comes from `?embed=true`
  (`src/lib/app-context.tsx:114-118`). `src/lib/auth/sign-in-window.ts:223-226`
  (`start`) and `:113-131` (`onMessage`) do not check `window.top`. The
  static app has no frame protection: `grep` finds no `frame-ancestors`,
  `X-Frame-Options` or `window.top` check in `src/` or `public/`,
  `public/_headers` does not exist, and the site is deployed by
  `.github/workflows/deploy.yml` to GitHub Pages, which cannot set those
  headers. Hash routing follows `hashchange`
  (`src/lib/app-context.tsx:1098-1106`).
- **Finding:** Before M1, a `mardoc.app` frame inside another site had no
  credential. Browsers partition its `localStorage` by top-level site, so a
  saved PAT is not visible there. M1 lets that frame get a full credential
  with one sign-in click.
  1. The popup is a top-level window, so the attempt cookie and the GitHub
     session are first-party.
  2. `/login` sees `Sec-Fetch-Site: same-origin`, because the request comes
     from the frame's own `mardoc.app` document (`worker/src/index.ts:84-88`).
  3. The callback posts to `window.opener`, which is the framed MarDoc
     window, and whose origin matches `APP_ORIGIN`.
  4. The listener's checks all pass: the origin is `mardoc.app`, the source
     is the popup it opened, and the nonce is its own.
- **Failure scenario (code path; the browser run is an owner step):**
  1. `evil.example` embeds `<iframe src="https://mardoc.app/">` (without
     `embed=true`, so the sign-in button is shown) under a decoy UI.
  2. The user is lured into two clicks: Settings, then **Sign in with
     GitHub** (`GitHubConnectionTab.tsx:149`). The click is real user
     activation, so `win.open("/api/auth/login?n=…")`
     (`sign-in-window.ts:138`) is not blocked.
  3. If the user has authorized the MarDoc App before, GitHub sends them
     straight to `/api/auth/callback` without a consent screen (see the
     owner step below). The popup flashes and closes, and the framed MarDoc
     now holds a token for every repository where MarDoc is installed.
  4. `evil.example` sets the iframe's `src` to the same URL with a new
     fragment, for example `#/<org>/<repo>/pull/<n>`. A fragment-only change
     does not reload the frame, so the in-memory token survives, and the
     `hashchange` handler opens the PR the attacker chose.
  5. More clickjacked clicks submit a review. The app supports `APPROVE`
     (`src/lib/github-api.ts:804,846`) and file commits
     (`createOrUpdateFileContents`, `github-api.ts:954,1096,1158,1195`).
     The victim then approves the attacker's PR in an org repo where
     MarDoc is installed.
  The parent cannot read the token, which is cross-origin. The harm is
  actions taken under the user's GitHub identity.
- **Why Medium, not High:** it needs several clickjacked clicks, and the
  one-click version needs GitHub's silent re-authorization for a returning
  user (not proven here). Without silent re-authorization, the user sees
  GitHub's consent screen in a top-level popup that the attacker cannot
  cover, which is a much weaker attack.
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
- **Owner step (settles the severity):** in your own browser, run the dev
  harness (`npm run dev:auth`) with the development App. Serve a local
  page from a second origin (for example `http://127.0.0.1:9000`) that
  frames `http://localhost:8787/`. Sign in from inside the frame twice:
  - The first sign-in shows consent.
  - Expected on the second, if the finding holds: no consent screen, the
    popup closes, and the frame shows you as signed in.

### SR-2 (Low): `/revoke` reads an unbounded body when there is no Content-Length

- **Pass:** Security
- **Location:** `worker/src/index.ts:119-123`.
- **Finding:** With no `Content-Length` header,
  `Number(request.headers.get("content-length") ?? "0")` evaluates to `0`
  and passes the check. `await request.text()` then buffers the whole
  body, and the 4096-byte cap is only checked afterwards. The comment at
  `:24` ("refused unread") does not hold for chunked bodies. The `Origin`
  check does not help against a non-browser client, which can send
  `Origin: https://mardoc.app`.
- **Failure scenario (reproduced):** I sent a `POST /api/auth/revoke` to the
  bundled Worker with `Origin: https://mardoc.app`,
  `Content-Type: application/json`, and an 8 MiB `ReadableStream` body
  (no `Content-Length`). Output:
  `revoke chunked content-length header: null` /
  `revoke chunked 8MB: 400 {"error":"bad_request"} bytes pulled: 8388608`.
  The Worker read all 8 MiB before refusing. Cloudflare accepts request
  bodies up to 100 MB on Free and Pro. Each such request makes the Worker
  buffer the body (as a UTF-16 string, which doubles it) in a
  128 MB isolate on a 10 ms CPU budget. This spends the Free plan's
  allowance faster than `/login` floods (NF-17) and can reset an isolate
  that is serving real callbacks.
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
  - keeps a working `ghu_` token in its DOM, readable through DevTools, by
    any extension with access to `mardoc.app`, or by anyone at the machine;
  - never revokes the token, so it stays valid for up to 8 hours.

  `window.opener` is null when the MarDoc tab was closed during sign-in,
  or when the opener is lost on the way through github.com (A-10).
- **Failure scenario (code path):** the user clicks Sign in, then closes the
  MarDoc tab while GitHub's consent screen is open, and approves in the
  popup. GitHub redirects to `/api/auth/callback`, and `decideCallback`
  exchanges the code and returns `ok: true` with the token
  (`callback.ts:115-118`). `renderCallbackPage` writes the token into
  `#result`. The script finds `o` null and takes the `else` branch. The
  token remains in the document, and nothing revokes it.
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
| GitHub re-authorizes a returning user without a consent screen. This sets SR-1's severity. It also means a same-origin rendered document (RK-1) could mint fresh tokens with one user click: escape the `allow-scripts allow-same-origin` sandbox, call `/login` from the parent, and listen on the parent's `message` event. That makes RK-1's "bounded by 8 hours" a per-token bound, not a session bound. | Owner step in SR-1. If confirmed, extend RK-1's wording to say that `/login` acts as a click-gated refresh. |
| github.com sends a COOP header that severs `window.opener`, so every sign-in lands in SR-3's no-opener branch. | SP-3 / Part B of the M1 demo in a real browser (A-10). |
| Flooding `/revoke` with guessed tokens (one GitHub call each, with the App's Basic credentials; `Origin` can be forged outside browsers; reproduced: `revoke forged origin (non-browser): 204 outbound GitHub calls: 1`) could trigger GitHub rate limits on the App's credentials, so a real Disconnect gets `502 revoke_failed` and the token stays valid. | GitHub's documented or observed limit for `DELETE /applications/{client_id}/token`. If it is low, add a Cloudflare rate-limiting rule on `/api/auth/revoke`. |
| `.github/workflows/test.yml` has no `permissions:` block. The new `worker` job runs `npm --prefix worker ci`, which executes the esbuild and workerd install scripts with the repo's default `GITHUB_TOKEN` scope. | The repo setting Settings → Actions → Workflow permissions. If it is read/write, add `permissions: contents: read` at the workflow level. |
| `wrangler dev` for `dev/local-auth` may listen on all interfaces, exposing the harness on the LAN. | `lsof -iTCP:8787 -sTCP:LISTEN` while it runs, as an owner step. The impact is small either way: stub tokens are fake, and real mode needs the visitor's own GitHub login. |
| Cookie tossing from a sibling `*.mardoc.app` host can replace an attempt cookie, because the name uses `__Secure-` rather than `__Host-` (design.md:283, GSI-SEC-5). I found no login-CSRF path: the tab accepts only its own client-generated nonce, which the attacker cannot read. That leaves a denial of service only. | Revisit if any `*.mardoc.app` host is added. |

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
  after the state check, and is pattern-checked (reproduced:
  `error=</script>` became `exchange_failed`). The comparison is
  constant-time. `readAttempt` checks that the cookie's nonce equals the
  state's nonce, and that both random parts are 43 base64url characters.
  The exchange binds the PKCE S256 verifier. The response clears the
  cookie.
- **Callback page:** reproduced. A token from GitHub containing
  `</script><script>alert(1)</script>&` appears only in escaped form
  (`</script>`). The CSP is `default-src 'none'` with a fresh
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
    signed-in tab never accepts `init`. The residual forged `init` is RK-3
    as accepted.
- **The e2e hook:** `window.__MARDOC_E2E__ === true` is a strict boolean
  check made once at mount. DOM clobbering through an `id` attribute
  yields an element, not `true`, and a cross-origin window cannot set
  properties on MarDoc's window. The hook exposes `startSignIn`, a
  token-free `getSession` and `disconnect`, which a same-origin script
  already has (RK-1). It is inert in production.
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
| SR-2 | Fixed. `/revoke` reads the body through a 4 KiB cap and cancels the stream once it is passed, with or without `Content-Length`; a declared length over 4 KiB is still refused unread. Refusing a missing `Content-Length` was not chosen, because the existing `t22_a_thrown_error_still_gets_the_common_headers` sends a stream without one and expects the read error to surface. The design's revoke row says so. | `d23ee6d` → `ede0ebe` | `f61_revoke_chunked_oversize_body_is_refused_within_4_kib_sr2` (8 MiB stream, no length: `400`, at most 16 KiB pulled; before the fix all 8 MiB were pulled), `f61_revoke_chunked_small_body_still_revokes_sr2` |
| SR-3 | Fixed. The page script reads `#result`, clears it and removes it from the DOM before either branch, so a page left open without an opener holds no token. The optional page-side revoke was not added (it would need `connect-src 'self'` in the callback CSP). T-32 still passes in Chromium against the real Worker. | `6b33e0c` → `6e56f0e` | `f23_callback_page_removes_result_after_reading_it_without_opener_sr3`, `f23_callback_page_removes_result_after_reading_it_with_opener_sr3`, `f23_callback_page_script_removes_the_result_element_sr3` (`worker/test/page.test.ts`) |

Still open from "Not proven": the owner step in SR-1 (does GitHub re-authorize a returning user silently?) and the RK-1 wording it may change; COOP on github.com (SP-3); `/revoke` flooding against GitHub's limit; the Actions `permissions:` block; the harness's listen address; cookie tossing (`__Secure-` versus `__Host-`). None is changed by WP-9.
