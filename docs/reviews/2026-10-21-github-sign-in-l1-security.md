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

| ID | Severity | Pass | Location | Finding (one line) |
|---|---|---|---|---|
| GSI-SEC-1 | Medium | Security | design.md A-10; requirements.md A-10; architecture.html 163-165, 192 | The `BroadcastChannel` fallback has weaker trust properties than the opener handoff; the design must say so. |
| GSI-SEC-2 | Medium | Security | design.md callback page, result shape, callback check | Callback page escaping of reflected `error`/`nonce` is unstated; error was checked before state. |
| GSI-SEC-3 | Medium | Security | design.md §Security; requirements.md A-19, Q-27; app-context.tsx:355-376 | `init` checks (RK-3) are presented as shipping before stage 1 but are a PENDING assumption. |
| GSI-SEC-4 | Low | Security | architecture.html failure picker 163-165 | Failure card overstates what I-11 covers for rendered documents (SEC-01). |
| GSI-SEC-5 | Low | Security | design.md Auth Worker cookies | `__Secure-` (not `__Host-`) cookies can be overwritten by a sibling `*.mardoc.app` host. |

---

## Findings

### GSI-SEC-1 — BroadcastChannel fallback (A-10) weakens I-11

- **Severity:** Medium
- **Pass:** Security
- **Location:** `design.md` A-10 table row, callback page fallback, I-11
  statement; `requirements.md` A-10; `architecture.html` failure picker.
- **Finding:** I-11 binds a result to the attempt by `event.origin`,
  `event.source` and the nonce. The A-10 `BroadcastChannel` fallback cannot
  carry the `event.source` binding, so its trust properties are weaker than
  the opener handoff, and the design did not record that.
- **Failure scenario:** Details are kept privately (SEC-01, RK-1, RK-3); report security issues
  through the repository's private vulnerability reporting.
- **Fix:** State in A-10 and in the architecture that the two handoffs have
  different trust properties, and keep the opener path (origin, source and
  nonce checks) as the default. A switch to the fallback needs its own ADR.

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
- **Failure scenario:** without a stated encoding rule, a reflected value
  could alter the callback page. This cannot be reproduced (no product
  code), so it is recorded as a contract gap, not a confirmed defect.
- **Fix:** Add an invariant/row to the design: the callback page serializes
  the result with `JSON.stringify` into a JSON context (or a
  `<script type="application/json">` block read by the nonce script), never
  by string interpolation into markup; `error` is mapped to the fixed code
  enum before it reaches the page; and `n` is validated to base64url
  22-64 at `/login` (already in the route table — cite it here). Give T-20
  or T-21 an assertion that an unexpected `error`/`nonce` value cannot alter
  the page.

### GSI-SEC-3 — Stage 1 `init` protection (RK-3) is treated as shipped but is gated on a PENDING decision

- **Severity:** Medium
- **Pass:** Security
- **Location:** `design.md` §Security and RK-3; `requirements.md` A-19,
  Q-27 (PENDING); `src/lib/app-context.tsx` `init` listener.
- **Finding:** The design's security section states that Q-27's default
  ships the origin, source and embed-mode checks before stage 1 (T-15), but
  Q-27 is PENDING, so the mitigation is an assumption, not committed scope.
- **Failure scenario:** Details are kept privately (SEC-01, RK-1, RK-3); report security issues
  through the repository's private vulnerability reporting.
- **Fix:** Make the `init` origin, source and embed-mode check (F-16) a hard
  dependency of the stage 1 gate, or record RK-3 as an explicitly
  owner-accepted risk for stage 1. Do not assert the checks ship before
  stage 1 while Q-27 is PENDING.

### GSI-SEC-4 — Architecture overstates I-11's protection for rendered documents

- **Severity:** Low
- **Pass:** Security
- **Location:** `architecture.html` failure picker; `design.md` §Security.
- **Finding:** One failure card could lead a reader to think I-11 covers
  rendered documents. I-11 only stops a result from an unrelated attempt or
  window; rendered-content isolation is SEC-01. Details are kept privately (SEC-01, RK-1, RK-3); report security issues through the repository's private vulnerability reporting.
- **Fix:** Reword the card to state I-11's limit and point to RK-1.

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
  assertion on unexpected `error`/`nonce` values.
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

## Re-review at 90b9de9

By the same reviewer, returned as a message and recorded here by the lead.

| ID | Status | Reason |
|---|---|---|
| GSI-SEC-1 | Closed | A-10 and design.md's assumptions table state the fallback's weaker trust properties and that the fallback needs its own ADR. |
| GSI-SEC-2 | Closed | I-17, the escaped-JSON callback page, `state` checked first, the `error` allow-list and nonce pattern; T-21 asserts them. |
| GSI-SEC-3 | Closed as a design issue | F-16 is a stage 1 Must; RK-3 stays open until the owner decides Q-27. The code path is unchanged until F-16 is built. |
| GSI-SEC-4 | Closed | The failure card states the RK-1 limit of I-11. |
| GSI-SEC-5 | Closed | design.md explains `__Secure-` against `__Host-` and the `auth.mardoc.app` revisit. |

Putting the nonce in `state` and naming the cookie by the nonce is safe against login CSRF and session fixation: the whole `state`, including 32 random bytes, must still match the HttpOnly cookie, and the cookie name is built only from pattern-checked characters.

New findings:
- **GSI-SEC-6 (Low):** sign-in availability; attempt cookies needed a bound. Details are kept privately.
- **GSI-SEC-7 (Low):** Disconnect re-activates a saved PAT without the user being told (RK-1).

The reviewer also flagged a contradiction: design.md said stage 1 "accepts" RK-1, while only the owner accepts risks.

Verdict: safe for owner acceptance of the design; fix GSI-SEC-6 and GSI-SEC-7 before build.

## Lead dispositions

| ID | Disposition |
|---|---|
| GSI-SEC-1 to 5 | Fixed at `90b9de9`; closed by re-review. |
| GSI-SEC-6 | Fixed: `/login` requires `Sec-Fetch-Site: same-origin` and `Sec-Fetch-Dest: document`, and expires all but the newest two attempt cookies; T-22 asserts both. |
| GSI-SEC-7 | Fixed: F-55 (Must). The signed-in view says the saved PAT will be used after Disconnect and offers "Remove saved token" and "Disconnect and remove saved token"; T-13 asserts the copy. |
| RK-1 wording | Fixed: design.md says stage 1 leaves RK-1 open, bounded by 8 hours and installed repos. |
