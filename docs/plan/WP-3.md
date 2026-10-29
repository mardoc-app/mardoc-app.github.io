# WP-3: Auth Worker

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** PENDING
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** sdlc:core-builder (Opus), own worktree. This is
  credential handling.

## Goal

Build the Auth Worker exactly as design.md specifies:
[Auth Worker](../design/github-sign-in/design.md#auth-worker),
[Worker routes](../design/github-sign-in/design.md#worker-routes),
[Sign-in result message](../design/github-sign-in/design.md#sign-in-result-message),
[result codes](../design/github-sign-in/design.md#sign-in-result-codes) and
[Callback check](../design/github-sign-in/design.md#callback-check-auth-worker-workersrcdomaincallbackts).

The routes are health, login, callback (sign-in and install return) and
revoke. Every other path, including `/refresh`, is a 404. The callback page
hands the result to the opener and closes.

The domain logic is pure (LR-11). GitHub calls sit behind a port in
`worker/src/adapters/github.ts`.

**Requirements proved:** F-20 to F-29, F-61, I-12, I-13, I-16, I-17, NF-14,
NF-15, C-13, C-16 (T-20, T-21, T-22, T-23, T-27).

## Files that change

| Path | Change | New? |
|---|---|---|
| `worker/src/domain/login.ts` | Make `state` (`<nonce>.<32 random bytes, base64url>`), the PKCE verifier (32 bytes, base64url) and its S256 challenge; build the authorize URL | yes |
| `worker/src/domain/callback.ts` | The callback decision order, steps 1 to 6, taking an exchange port; uses a constant-time compare for `state` | yes |
| `worker/src/domain/cookies.ts` | Build and parse attempt cookies with the prefix, attributes and `Max-Age=600`; prune all but the newest two | yes |
| `worker/src/domain/page.ts` | Render the callback page: CSP with a per-response 16-byte nonce, the result as escaped JSON in `<script type="application/json" id="result">`, and one nonce'd script that posts to `APP_ORIGIN` and closes. Also the install-return page and the "Return to MarDoc" text when `window.opener` is null | yes |
| `worker/src/adapters/github.ts` | `exchange(code, verifier)`: POST form-encoded to `https://github.com/login/oauth/access_token` with `accept: application/json`. Returns only `access_token`, `expires_in` and `error`; drops everything else (I-13). `revoke(token)`: `DELETE https://api.github.com/applications/{client_id}/token` with basic auth | yes |
| `worker/src/index.ts` | Routing and the common headers (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, no `Access-Control-*`), the `Sec-Fetch-*` and `Origin` checks, and the env (`CLIENT_ID`, `APP_ORIGIN`, secret `CLIENT_SECRET`). Health returns `{"ok": true, "version": "<sha or dev>"}` | yes, replaces the WP-1 skeleton |
| `worker/test/*.test.ts` | Tests named in the Proof table | yes |
| `worker/wrangler.toml` | Nothing beyond WP-1, unless a var is needed (`VERSION`) | no |

Nothing outside `worker/`. The contract comes from `src/lib/auth/contract.ts`
(frozen in WP-1).

## Increments and proof points

**Riskiest assumption:** GitHub accepts a GitHub App token exchange that is
form-encoded, carries PKCE and the client secret, and returns
`expires_in` and a refresh token. **Cited, not re-proved:**
- SP-1's Worker (`docs/spikes/sp-1/worker.mjs:40-80`) sent exactly this
  request, and the owner reported PASS (2026-10-21).
- GitHub's docs list `client_secret` as required and `code_verifier` as
  required once a challenge is sent.

The real exchange runs again in SP-3 and the owner's demo. Here, GitHub is
stubbed.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | Pure domain: `state`, PKCE, cookies and the callback decision order | WP-1 merged | `npm --prefix worker test -- domain`. Every case below passes, including design.md's worked examples. **FAIL:** an exchange call on `state` mismatch, or a refresh token reaching the result | PENDING |
| 2 | The HTTP routes, headers and callback page | Increment 1 | `npm --prefix worker test` passes for every route case, header case and page case below. `node scripts/check-layout.mjs` exits 0 (LR-11) | PENDING |
| 3 | Runs under the real Workers runtime locally | Increment 2 | `npx wrangler dev` in `worker/` with `--var CLIENT_ID:test` and a dummy `CLIENT_SECRET` in `worker/.dev.vars`, which git ignores. No Cloudflare login needed; if wrangler insists on a login, record BLOCKED and stop. Then `curl -i localhost:8787/api/auth/health` gives 200 with `ok: true` and `no-store`. `/api/auth/refresh` gives 404. `/api/auth/login?n=<22 chars>` without `Sec-Fetch-*` gives 403, and with `-H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-Dest: document'` gives 302 to github.com with `code_challenge_method=S256` and a `Set-Cookie` that has the prefix and `Max-Age=600`. Then `npm run ci` | PENDING |

### Cases (Worker unit, GitHub stubbed)

- **Callback order (T-20):**
  - no `state` with `installation_id` → install page, no exchange;
  - no `state` → `state_mismatch` with nonce null;
  - a bad nonce → `state_mismatch` with nonce null;
  - no cookie, or a cookie that differs → `state_mismatch` with the nonce, and the stub records zero calls;
  - `error=access_denied` → that code;
  - `error=<script>` → `exchange_failed`;
  - no `code` → `state_mismatch`;
  - a JSON `error` from GitHub → that code;
  - a network error or a 500 → `exchange_failed`;
  - no `expires_in` → `non_expiring_token`;
  - success → `ok` with only the token and `expiresIn`.
- **Login (T-20, T-22):**
  - a bad `n` → 400;
  - missing `Sec-Fetch-*` headers, or `Sec-Fetch-Site: cross-site` → 403;
  - a good request → 302 whose authorize URL has `client_id`, the fixed `redirect_uri`, `state`, the S256 `code_challenge` and the method;
  - three older attempt cookies on the request → all but the newest two get `Max-Age=0`.
- **Page (T-21):**
  - CSP exactly as designed;
  - a hostile `state` or `error` value never appears unescaped;
  - no `ghr_` or `refresh_token` in any response body, header or cookie;
  - `postMessage` targets `APP_ORIGIN`, never `*`;
  - the cookie is cleared.
- **Routes (T-21, T-22, T-23):**
  - every response has `no-store` and no `Access-Control-*` header;
  - `/refresh` and unknown paths give 404;
  - health gives 200 with `ok: true`;
  - revoke: a missing or foreign `Origin` gives 403; a bad body gives 400; GitHub 404 gives 204; GitHub 500 gives 502 `revoke_failed`; GitHub is called with basic auth.
- **No logging (T-22):** with `console.*` spied in every test, no call.
- **Secrets (T-27):** `grep -rn "client_secret\|CLIENT_SECRET" worker/src` shows only reads from `env`. No secret value appears in the repo or `out/`. `wrangler.toml` has no bindings and no secret.

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| `src/lib/auth/contract.ts` | yes (WP-1) | None: implements it |
| The `/api/auth/*` routes | Defined by design.md | Implements them |

## Risks

- **What could break:** nothing in the app, because the Worker isn't
  deployed by this WP. The owner deploys it before SP-3.
- **The riskiest step:** the callback page's escaping and CSP, because it is
  the one place that echoes input (I-17). Property-style tests with hostile
  strings cover it.
- **Options not taken:** a JSON body for the exchange. SP-1 proved the
  form-encoded one.

## Proof

| Test | Level | Proves |
|---|---|---|
| `t20_callback_*` | Worker unit | F-20, F-21, F-29, I-12 |
| `t20_login_*` | Worker unit | F-20, F-21, F-28 |
| `t21_page_*` and `t21_no_refresh_*` | Worker unit | F-23, F-24, F-25, I-13, I-17 |
| `t22_*` | Worker unit | F-26, F-28, NF-14, NF-15, I-16 |
| `t23_*` | Worker unit | F-27, F-61 |
| `t27_secret_*` | Worker unit plus review | C-13, C-14 |

Commands, exactly as run:

```sh
npm --prefix worker test
node scripts/check-layout.mjs
npm run ci
```

## Relevant lessons

None apply.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead.
- [ ] Every test above passes and carries its IDs.
- [ ] `npm run ci` is green, with its output pasted in the PR.
- [ ] Docs updated: a short `worker/README.md` with the owner's deploy
      steps (tagged commit, secret, dashboard route, observability off,
      usage notification at 50%) for SP-3.
- [ ] Independent review findings dispositioned.
- [ ] The plan.md row is set to DONE.
