# Security review: GitHub sign-in L1 (stage 1)

- **Review id:** 2026-10-21-github-sign-in-l1-security
- **Pass:** Security only (bugs and compliance belong to the main review).
- **Scope:** `docs/design/github-sign-in/design.md`, `requirements.md`,
  `architecture.html`, ADR 0001, `docs/risks.md` RK-1..RK-3, L0
  `strategy.html`, and the existing code paths they build on
  (`src/lib/app-context.tsx`, the three sandboxed iframes, the SP-1 spike
  Worker `docs/spikes/sp-1/worker.mjs`).
- **Branch/commit reviewed:** `design/github-sign-in-l1` @ `8c8588d`.
- **Nature:** design review. There is no product code for the Worker or the
  sign-in window adapter yet, so every finding reasons from the specified
  contracts or cites an existing code path that the design relies on.

## Verdict

**Safe for owner acceptance of the design, with fixes.** No High finding:
the design's core token-handoff contract (state cookie, PKCE S256, nonce +
`event.source` binding, memory-only token, no refresh route, no CORS, no
logging) is sound against a cross-site attacker. The findings are about
(a) a fallback that silently weakens a stated invariant, (b) one
attacker-influenced HTML surface whose escaping contract is unstated, and
(c) a security property the design treats as shipped that is actually gated
on a PENDING owner decision. Fix GSI-SEC-1, GSI-SEC-2 and GSI-SEC-3 (or
make their contingency explicit in the design) before build.

**Counts:** High 0 · Medium 3 · Low 2 · Nit 0.

---

## Findings

### GSI-SEC-1 — BroadcastChannel fallback (A-10) silently weakens I-11 to nonce-only

- **Severity:** Medium
- **Pass:** Security
- **Location:** `design.md` lines 139 (A-10 table row), 331-333 (callback
  page fallback), 616 (I-11 statement); `requirements.md` A-10 (line 181);
  `architecture.html` lines 163-165, 185, 192.
- **Finding:** I-11 and its test T-12 state that the tab accepts a result
  only when `event.origin` is the app origin, `event.source === ` the
  attempt's pop-up, and the nonce matches, and the architecture claims a
  forged result from "another window, an iframe or with a wrong nonce" is
  ignored. The A-10 fallback replaces the `postMessage`-to-`window.opener`
  handoff with `BroadcastChannel("mardoc-sign-in")`. A `BroadcastChannel`
  message carries **no `source` and no cross-origin `origin` check** — it is
  delivered to every same-origin context that has the channel open, and the
  `event.source` leg of I-11 is unenforceable. Under the fallback the nonce
  is the **only** binding. The design records "T-12 changes" but does not
  record that the guarantee itself weakens, and the architecture's
  "forged result is ignored (I-11)" card would become false for the channel
  path.
- **Failure scenario (proof, by contract):** SEC-01/RK-1 lets a rendered
  document's script run as `mardoc.app`. With the fallback active, that
  script opens `BroadcastChannel("mardoc-sign-in")`, reads the live
  attempt's nonce from the tab's in-memory auth state (same origin, parent
  window), and broadcasts `{type:"mardoc-sign-in-result", nonce:<real>,
  ok:true, token:<attacker token>}` before the genuine callback posts. The
  tab cannot distinguish it from the real callback (no `source`, nonce
  matches), so it accepts the attacker's token (confused deputy). The
  `event.source` check that defeats this on the `window.opener` path does
  not exist on the channel. (This is a same-origin RK-1 escalation, not a
  cross-site attack; a cross-origin page cannot join the channel.)
- **Fix:** State in A-10 and in the architecture that the two handoffs have
  different trust properties: the `window.opener` path binds on
  `event.source` + nonce; the `BroadcastChannel` path can bind on nonce
  only. If SP-3 forces the fallback, note that T-12's iframe/other-window
  guarantee holds only for the opener path, and keep the opener path as the
  default so the stronger binding is the normal case.

### GSI-SEC-2 — Callback page escaping contract is unstated for the one attacker-influenced HTML surface on the app origin

- **Severity:** Medium
- **Pass:** Security
- **Location:** `design.md` lines 328-333 (callback page + CSP), 335-346
  (result shape), 587-604 (callback check); route table line 323 (`n`
  validation).
- **Finding:** The callback page is HTML served from `mardoc.app/api/auth`
  — the app's own origin. Its inline script embeds the sign-in result
  (`token`, `nonce`, `error`) and calls `postMessage(result, APP_ORIGIN)`.
  Two of those fields are attacker-influenced: `error` is relayed from
  GitHub's response, and `nonce` originates from the `?n=` query echoed
  through the nonce cookie. The design specifies a strong CSP
  (`script-src 'nonce-<random>'`, `default-src 'none'`, `frame-ancestors
  'none'`) and specifies `n` as "base64url, 22 to 64 chars" at `/login`,
  but it does **not** state that the callback page must JSON-encode /
  escape these values when it writes them into markup or script, nor does
  it restate the `?n=` validation and the `error` whitelist as the
  sanitization boundary for the callback page. The SP-1 spike does sanitize
  (`error` is reduced to `[a-z_]{,64}`; `n` is validated) but the spike is
  disposable and the product contract in design.md omits it.
- **Failure scenario (proof, by contract):** if the product callback page
  interpolates `error` or `nonce` into the HTML or into the inline script
  without encoding, a GitHub-returned or cookie-derived value containing
  `</script>` or a quote/`<` breaks out. The CSP's `script-src
  'nonce-<random>'` blocks injected `<script>` tags, but it does **not**
  block breaking the existing nonce-tagged inline script's string literal
  (DOM/script-context injection inside an already-authorized script). Because
  the page is on the app origin, such an injection runs with the token in
  hand. This cannot be reproduced (no product code), so it is recorded as a
  contract gap, not a confirmed defect.
- **Fix:** Add an invariant/row to the design: the callback page serializes
  the result with `JSON.stringify` into a JSON context (or a
  `<script type="application/json">` block read by the nonce script), never
  by string interpolation into markup; `error` is mapped to the fixed code
  enum before it reaches the page; and `n` is validated to base64url
  22-64 at `/login` (already in the route table — cite it here). Give T-20
  or T-21 an assertion that a hostile `error`/`nonce` value cannot alter the
  page's DOM or script.

### GSI-SEC-3 — Stage 1 token-swap protection (RK-3) is treated as shipped but is gated on a PENDING decision; the live code path has no checks

- **Severity:** Medium
- **Pass:** Security
- **Location:** `design.md` lines 624-626 (§Security, "Forged `init`"),
  659 (RK-3 open); `requirements.md` A-19 (line 190), Q-27 (line 284, status
  PENDING); live code `src/lib/app-context.tsx:355-376` and
  `applyInitData` 324-331/348-351.
- **Finding:** The design's security section states: "Q-27's default ships
  ADO-1's origin, source and embed-mode checks before stage 1 (T-15)," and
  the architecture presents the `init` hardening as the RK-3 mitigation. But
  Q-27 is PENDING and A-19 says "If wrong: a forged `init` can replace a
  signed-in token with another token ... RK-3 stays open for stage 1; T-15
  is dropped." So the mitigation is an **assumption**, not committed scope,
  while the security prose reads as if it is done. The sign-in feature
  raises the stakes of RK-3: a swapped token during an authenticated review
  session is a confused-deputy that makes the victim act under an
  attacker-supplied credential.
- **Failure scenario (proof, code path):** the current `init` listener at
  `app-context.tsx:355-360` does `if (!data || data.type !== "init")
  return; ... applyInitData(data)` with **no** `event.origin` check, **no**
  `event.source` check, and the listener is registered unconditionally
  (added in the effect at line 363, not gated on embed mode). `applyInitData`
  (lines 324-331) then calls `setGithubTokenState(data.token)` and
  `initOctokit(data.token)`. After a user signs in, a script in a rendered
  document (SEC-01, same origin, reachable via `window.parent`) posts
  `window.parent.postMessage({type:"init", token:"<attacker ghu_ or
  ghp_...>"}, "*")`. The listener accepts it and re-initialises Octokit with
  the attacker's token, so the victim's subsequent comments/commits are made
  with the attacker's credential (and `setIsEmbedded(true)` is toggled). This
  is a concrete code path today; stage 1 relies on ADO-1 removing it.
- **Fix:** Promote the `init` origin/source/embed-mode check from an
  assumption (A-19) to a **hard dependency of the stage 1 gate**: make T-15
  non-optional and list ADO-1 as a prerequisite of shipping sign-in, or
  record RK-3 as an explicitly owner-accepted risk for stage 1 (currently
  design.md line 659 says RK-3 is *not* accepted). The security prose at
  lines 624-626 should not assert the checks ship "before stage 1" while
  Q-27 is PENDING.

### GSI-SEC-4 — Architecture overstates I-11's protection against same-origin document iframes

- **Severity:** Low
- **Pass:** Security
- **Location:** `architecture.html` lines 163-165 (failure picker,
  "Rendered HTML iframes: a document script posts a correctly shaped result
  ... ignored (I-11)"); `design.md` lines 575-576, 620-623.
- **Finding:** The failure picker frames the iframe threat as "a document
  script posts a forged result, and I-11 ignores it." That is a weak,
  slightly misleading framing: under SEC-01/RK-1 a same-origin document
  script does not need to forge a result — it reads the in-memory token
  directly through `window.parent` or adds its own `message` listener on the
  parent window and captures the real result. I-11 provides **no**
  protection against the acknowledged RK-1 threat; it only stops a result
  from an unrelated attempt/window. The residual-risk statement elsewhere
  (design.md 620-623, architecture §Concerns 179-181) is accurate; this one
  card could lead a reader to think iframes are handled by I-11.
- **Failure scenario (proof, by contract):** a document script runs as
  `mardoc.app`; the token is reachable after sign-in through the parent
  window's in-memory auth state; the script reads it with no `message`
  involved, so I-11 is never consulted. Confirmed structurally by the
  sandbox attributes at `HtmlViewer.tsx:358`, `DiffViewer.tsx:1120`,
  `RepositoryReference.tsx:53` (`allow-scripts allow-same-origin`).
- **Fix:** Reword the iframe failure card to say the same-origin script
  reads the token directly (RK-1), and that I-11 only defends against
  cross-attempt/foreign-window results — not against SEC-01.

### GSI-SEC-5 — `__Secure-` cookies (not `__Host-`) are overwritable by a sibling mardoc.app subdomain

- **Severity:** Low
- **Pass:** Security
- **Location:** `design.md` lines 251-255 (cookie attributes), 127-129
  (fallback host `auth.mardoc.app`); route table line 371.
- **Finding:** The three sign-in cookies use the `__Secure-` prefix with
  `Path=/api/auth`. `__Secure-` requires only the `Secure` attribute; it
  does **not** forbid a `Domain` attribute, so any context able to set
  cookies for `mardoc.app` (a sibling subdomain such as the stated fallback
  `auth.mardoc.app`, or any other `*.mardoc.app` host) can set/overwrite
  `__Secure-mardoc_auth_state` on `Domain=mardoc.app`. The stronger
  `__Host-` prefix (which forbids `Domain` and pins the cookie to the exact
  host) cannot be used here because `__Host-` also mandates `Path=/`, and
  the design deliberately scopes to `/api/auth`.
- **Failure scenario (proof, by contract):** if a `*.mardoc.app` subdomain
  is ever attacker-influenced, it can fixate the `state`/`verifier`/`nonce`
  cookies, a classic cookie-fixation precursor to login CSRF. Today no such
  subdomain is described, so this is latent, not exploitable — hence Low. It
  becomes material if the design ever adopts the `auth.mardoc.app` fallback
  (design.md 127-129) and both hosts share the registrable domain.
- **Fix:** Note the trade-off in the design: `__Host-` is unavailable due to
  the path scoping, so the cookies rely on there being no untrusted
  `*.mardoc.app` host. If the fallback host is ever used, re-evaluate cookie
  isolation (separate registrable domain, or accept the path scoping and
  document the assumption that all `*.mardoc.app` hosts are trusted).

---

## What I checked and found sound

- **Login CSRF / forged callback.** The `state` cookie match before any
  outbound exchange (I-12, callback check step 3, design.md 592-595, T-20)
  defeats a cross-site forged callback: the attacker cannot set the victim's
  HttpOnly `__Secure-` state cookie, so a callback with an attacker code +
  arbitrary state fails the constant-time comparison and no exchange runs.
  Confirmed against the SP-1 shape (`worker.mjs:66`).
- **Token leakage via URL/history/Referer/Location.** The token is returned
  only via `postMessage`, never in a redirect, URL, `Location` header or
  cookie (I-10, route table "never a redirect", NF-11, T-11). The callback
  carries `code` (not the token) and the pop-up closes; `Referrer-Policy:
  no-referrer` on all `/api/auth/*` responses plus the callback CSP
  `default-src 'none'` stop Referer/subresource leaks. Sound.
- **`postMessage` target origin.** The callback posts to a fixed
  `https://mardoc.app`, and the tab checks `event.origin`,
  `event.source === popup` and nonce (I-11) on the opener path. A
  cross-origin opener cannot receive the token (target origin mismatch) and
  cannot satisfy `event.source`. Sound for the default handoff (see
  GSI-SEC-1 for the fallback).
- **PKCE S256.** `code_challenge_method=S256` with a server-side verifier
  (F-21, T-20); verifier held in an HttpOnly cookie, never exposed to the
  page. Sound.
- **No refresh route / no refresh token stored.** `/refresh` is 404; the
  refresh token is dropped inside the exchange and never returned, logged or
  stored (I-13, C-16, F-24, F-25). This is the correct mitigation for RK-1
  while SEC-01 is open, and matches ADR 0001's rationale. Sound.
- **No CORS headers.** No `Access-Control-Allow-*` on any response (F-22).
  A cross-origin `fetch` to `/revoke` (POST, `application/json`) is a
  non-simple request, so the browser preflights; the Worker answers no
  CORS, and the real request is blocked — the `Origin` check on `/revoke` is
  defence in depth, and the route cannot be an open relay because it
  requires the token in the body. Sound.
- **No logging.** I-16 / NF-15 / T-22 forbid `console` and any token/code/
  verifier/secret in logs; RK-2 (Cloudflare in the path) is correctly left
  open and documented (F-70). Sound.
- **Secret handling.** Client secret only in Worker `env` (C-13, T-27); repo
  grep finds `client_secret` only in docs and the disposable spike config
  (which holds no value), never a literal secret. Sound.
- **"Stage 1 needs nothing stored."** Only the non-secret
  `mardoc_auth_method` marker is persisted (Q-20); the token lives in a
  closure and the Octokit instance (design.md 368, I-10). Correct — no
  secret is stored.
- **Expiry / fail-closed.** The request hook refuses to send at/after
  `expiresAt` with a 60s skew margin (I-15, NF-12), re-checked on
  `visibilitychange` for sleep, and a 401 forces `expired`. Fail-closed, not
  fail-open. Sound.
- **Open redirect.** The callback never redirects and `redirect_uri` is
  fixed to the Worker; no open-redirect surface. Sound.

## Not proven (would settle with product code or SP-3)

- **Callback-page injection (GSI-SEC-2):** cannot be reproduced without the
  product Worker. Settled by reading the built callback page and a T-20/T-21
  assertion on hostile `error`/`nonce`.
- **Opener survival vs. COOP (A-10):** the design asserts github.com sends
  no `Cross-Origin-Opener-Policy` (curl 2026-10-21) so the opener survives;
  SP-3 is to confirm per browser. If an intermediate GitHub response (e.g. a
  device-verification or interstitial page) ever sets COOP, the handoff
  falls back to BroadcastChannel and GSI-SEC-1 applies. Settled by SP-3.
- **`event.source === popup` after a cross-origin round trip:** whether the
  pop-up's `WindowProxy` identity the tab holds still `===` the `event.source`
  the browser reports after navigation through github.com. This is the crux
  of I-11/T-12; if it does not hold in some browser, the nonce becomes the
  sole binding (as in the fallback). Settled by SP-3 / T-12 on real
  browsers.
