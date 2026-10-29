# SP-3: the callback page delivers the sign-in result to the opener, per browser

Date: 2026-10-27 (built). Time box: 1 day, starting when the owner deploys. Agent: spiker (Sonnet 5.5).
Environment: Node v26.9.0, wrangler 4.154.0 (from `worker/`, local runtime only); the live zone mardoc.app behind Cloudflare in front of GitHub Pages.
Proves: A-10, A-11 (production App settings), A-16, NF-20 in [requirements](../design/github-sign-in/requirements.md); Gate 0 row SP-3 in [plan.md](../plan.md). Blocks: WP-5 merge.
Claims are marked **verified** (ran it) or **inferred** (reasoned or read, not run).

**Status: PARTIAL, closed by the owner 2026-10-28.** Chrome and Safari on desktop pass; Firefox, Safari iOS and Chrome Android were not run. Agents never deploy, register GitHub Apps or touch Cloudflare; the owner does every step in the runbook.

## Question

Does the real callback page, served by the product Worker module through the live `mardoc.app` zone, deliver the sign-in result to the tab that opened the pop-up (`window.opener.postMessage` to `https://mardoc.app`), in current Chrome, Firefox and Safari on desktop, Safari on iOS and Chrome on Android, with a signed-in GitHub account and the production App settings?

Also recorded (not part of the yes/no): whether the zone's HTML rewriting alters the callback page; whether a returning user skips the consent screen; whether `GET /user/repos` is already limited to installations for a user token (A-16).

**Answer: yes for Chrome and Safari on macOS (2026-10-28); not yet for Firefox, Safari iOS and Chrome Android.** The owner stopped testing there ("enough testing - it is working") and accepts the untested browsers as a risk (RK-5).

## Pass criteria

Per browser, in the matrix below (five rows). A row **PASSES** when all hold:

1. The opener page's result box shows `delivered: true`, `eventOrigin: "https://mardoc.app"`, `sourceIsPopup: true`, `nonceMatched: true`, `ok: true`, `tokenArrived: true`, a `tokenLength` of at most 255, and `expiresIn: 28800`.
2. The pop-up closed itself (`popupClosedAfterMessage: true`), or the owner notes it did not.
3. `GET /user` shows the owner's login.
4. The same pop-up flow ran with a signed-in GitHub account (the consent screen, or the returning-user screen, appeared in the pop-up, not a full-page navigation of the opener tab).

A row **FAILS** when no message arrives within 180 s (`NO MESSAGE`), `popup` is `blocked` on a user click, the opener tab navigated, or the message is rejected (`rejected-*` entries with reason `origin`, `source` or `nonce`). A failure in any row fails the spike: the `BroadcastChannel` fallback needs its own ADR (A-10) and WP-5 stays blocked.

**Overall PASS** = all five rows pass. **FAIL** = any row fails. Anything not run is "not yet".

Recorded without pass/fail effect:

- **Zone rewriting.** `probe.mjs` byte-compares the served callback page and opener page with the product code's own render. Email Address Obfuscation ON, Automatic HTTPS Rewrites ON, Rocket Loader off were read through the API on 2026-10-27. Alteration of the callback page is a FAIL of criterion 1 for the browsers (the result would not arrive) and must be handled by a zone Configuration Rule, so the probe result is recorded for each run.
- **Returning user (consent).** On the second sign-in in a browser: did the consent screen appear again, or did GitHub redirect straight to the callback?
- **A-16.** The opener page reports whether every repo in `GET /user/repos` also appears under `GET /user/installations/{id}/repositories`.

## Method

The opener tab must be on the `https://mardoc.app` origin, but GitHub Pages serves today's app, which has no pop-up code. A disposable Worker (`docs/spikes/sp-3/worker.ts`) imports the product module `worker/src/index.ts` unchanged and adds exactly one route, `GET /api/auth/__sp3`, a minimal same-origin opener page. The owner routes `mardoc.app/api/auth/*` to it, so the opener page, `/api/auth/login`, the callback and the result all travel through the live zone with the product Worker's own code.

The opener page's button click calls `window.open("/api/auth/login?n=<nonce>", "mardoc-sign-in", "popup,width=600,height=720")` (the product constants in `src/lib/auth/contract.ts`), so the product `login` route's `Sec-Fetch-Site: same-origin` and `Sec-Fetch-Dest: document` checks are exercised for real. It listens for `message`, accepts a message only if `origin`, `source` and `nonce` all match (I-11), and shows only whether a token arrived, its length and `expiresIn`. It holds the token in one variable to call `GET /user`, `GET /user/repos`, `GET /user/installations` and `GET /user/installations/{id}/repositories` from page JS, shows only login, repo names and counts, then drops it. The token is never written to the DOM, console or storage (unit-tested).

**Actual dependency and target environment:** the GitHub App web flow on github.com with the production App, Cloudflare Workers routes on the live zone, and the five browsers.
**Simulated parts:** none in the owner run. Pre-deploy checks use a dummy secret and make no GitHub call.

## Prototype

- **Artifact:** `docs/spikes/sp-3/`: `worker.ts` (wrapper), `opener.ts` (page and checks), `wrangler.toml`, `probe.mjs`, `check.test.ts`. **Disposable. Not product source.**
- **What it demonstrates:** the opener survives github.com and the zone in each browser; the product callback page posts a result the opener accepts; the zone does not change the pages; A-16.
- **What it does not demonstrate:** the product's sign-in-window module, timeouts, blocked-pop-up UX, expiry, revoke, embeds, or what the real app page's CSP does to a pop-up.
- **Implementation boundary:** disposable prototype; product code is implemented separately (WP-5).
- **Safety:** no routes in `wrangler.toml`; `workers_dev = false`, `preview_urls = false`, observability off, no bindings. `CLIENT_ID` is passed with `--var`; the secret only with `wrangler secret put`. Nothing in the repo holds a client ID or secret.

## Pre-deploy evidence

### Unit tests (verified, Node v26.9.0)

```text
$ node --test docs/spikes/sp-3/check.test.ts
✔ accepts origin + source + nonce
✔ rejects wrong origin
✔ rejects wrong source
✔ rejects no popup
✔ rejects wrong nonce and null nonce
✔ rejects bad shapes
✔ page embeds checkMessage, CSP allows only the GitHub API, token never written to the DOM
✔ embedded script is valid JS and its checkMessage behaves the same
ℹ tests 8 / pass 8 / fail 0
```

### Local runtime (verified, `wrangler dev`, dummy secret in a gitignored `.dev.vars`, deleted afterwards; no GitHub call)

Command, from the repo root: `worker/node_modules/.bin/wrangler dev --config docs/spikes/sp-3/wrangler.toml --port 8799 --var CLIENT_ID:test`

```text
$ curl -si localhost:8799/api/auth/health
HTTP/1.1 200 OK   Cache-Control: no-store   {"ok":true,"version":"dev"}

$ curl -si localhost:8799/api/auth/__sp3
HTTP/1.1 200 OK   Content-Type: text/html; charset=utf-8   Cache-Control: no-store
content-security-policy: default-src 'none'; script-src 'nonce-…'; style-src 'nonce-…'; connect-src https://api.github.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
(the opener page, with checkMessage inlined)

$ curl -si localhost:8799/api/auth/callback        # bare GET: the real product page, state_mismatch result
HTTP/1.1 200 OK   content-security-policy: default-src 'none'; script-src 'nonce-…'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
…{"type":"mardoc-sign-in-result","v":1,"nonce":null,"ok":false,"error":"state_mismatch"}…o.postMessage(r,"https://mardoc.app");window.close();…

$ curl -si localhost:8799/api/auth/refresh   -> HTTP/1.1 404 Not Found
```

`node docs/spikes/sp-3/probe.mjs http://localhost:8799`: every check passes (health, callback status/CSP/nonce/byte-identity/JSON block, opener status/CSP/byte-identity, `/refresh` 404) except "`/` still served by Pages", which is expected locally (no Pages origin). Not proven locally: anything about browsers, GitHub or the zone.

Note: the bundled `checkMessage` text differs from Node's type-stripped text in whitespace only, so the probe excludes that function's body from the opener byte comparison; the unit test covers its behaviour.

## Owner runbook

One screen at a time. Stop at any failure and paste what you see. Never paste a client secret, token or code anywhere except the `wrangler secret put` prompt. The result box on the opener page contains no token.

**Screen 1. Register the production GitHub App.** GitHub > Settings > Developer settings > GitHub Apps > New GitHub App (Q-19, A-11). Set exactly:
- GitHub App name: `MarDoc`
- Homepage URL: `https://mardoc.app`
- Callback URL: `https://mardoc.app/api/auth/callback`
- Expire user authorization tokens: **on**
- Request user authorization (OAuth) during installation: **off**
- Setup URL: empty
- Webhook > Active: **off**
- Repository permissions: Contents **Read and write**, Pull requests **Read and write**, Metadata **Read-only**
- Where can this GitHub App be installed: **Any account**
- Create GitHub App. Name and slug are public and permanent (one-way door); if `MarDoc` is taken, stop and tell me.

**Screen 2. Client ID and secret.** On the App page, copy the **Client ID** (not a secret). Under "Client secrets" click **Generate a new client secret** and keep it on screen for screen 4. Then Install App > your account > pick at least one **private** repo (so A-16 has something to show) and, if you can, leave one readable private repo uninstalled.

**Screen 3. Deploy the spike Worker.** From `docs/spikes/sp-3` on branch `spike/sp-3` (it imports `../../../worker/src`; run `npm --prefix worker ci` once from the repo root):
`npx wrangler@4.154.0 deploy --var CLIENT_ID:<client id>`
Expect "Deployed mardoc-auth-sp3" and no URL (`workers_dev` is off). Record the wrangler version.

**Screen 4. Set the secret.** From `docs/spikes/sp-3`: `npx wrangler@4.154.0 secret put CLIENT_SECRET` and paste the secret at the prompt.

**Screen 5. Add the route.** Cloudflare dashboard > the `mardoc.app` zone > Workers Routes > Add route: `mardoc.app/api/auth/*` > Worker `mardoc-auth-sp3`. If the product Worker `mardoc-auth` is already routed there, stop: only one may own the route during this spike (remove its route first and restore it at cleanup).

**Screen 6. Probe the zone.** From the repo root: `node docs/spikes/sp-3/probe.mjs`. Expect `== done: 0 failure(s) ==`. A FAIL on a byte-identity or marker line means the zone rewrote the page: paste the output and stop. Also open `https://mardoc.app/api/auth/__sp3` once in Chrome and confirm the page shows a button.

**Screen 7. Chrome desktop.** Signed in to GitHub in this browser. Open `https://mardoc.app/api/auth/__sp3`, click **Sign in with GitHub**. In the pop-up, authorize. Copy the result box. Click the button a **second** time, in the same page, and note whether GitHub showed the consent screen again (returning user) or went straight back. Copy the box again.

**Screen 8. Firefox desktop.** Same as screen 7.

**Screen 9. Safari desktop.** Same as screen 7. If Safari blocks the pop-up, check Settings > Websites > Pop-up Windows for mardoc.app, report the blocked result first, then allow and repeat.

**Screen 10. Safari on iOS.** Same page on the iPhone, signed in to GitHub in Safari. Tap the button. Note whether the pop-up opens as a new tab or window, whether it closes itself, and copy the result box (long-press, Select All, Copy, or screenshot it).

**Screen 11. Chrome on Android.** Same as screen 10.

**Screen 12. A-16.** From any passing row, copy the `GET /user/repos`, `GET /user/installations` and `A-16` entries. `userReposLimitedToInstallations: false` means `GET /user/repos` returns repos the App is not installed on, so the installation endpoints are needed.

**Screen 13. Cleanup** (see Cleanup below).

### Paste-back format

No tokens, codes or secrets (the page shows none). In this order:

1. `npx wrangler --version`, the date, and each browser's version and OS.
2. Screen 6: the full `probe.mjs` output.
3. Screens 7 to 11, for each browser: the full result box; whether the pop-up closed itself; first and second sign-in consent behaviour (screen 7 asks for it in Chrome; add it for any other browser you tried); anything odd.
4. Screen 12: the A-16 entries.
5. Screen 13: what was deleted and kept.

## Results

Owner run, 2026-10-28, production App "MarDoc" (owner `mardoc-app`, Client ID in the owner's credentials folder), spike Worker `mardoc-auth-sp3` deployed with wrangler 4.154.0, route `mardoc.app/api/auth/*` (fail closed).

| Browser | Version / OS | Delivered (origin, source, nonce) | Token arrived, length, expiresIn | Pop-up closed itself | `/user` login | Second sign-in skips consent | Result |
|---|---|---|---|---|---|---|---|
| Chrome desktop | Chrome 156, macOS | yes: `https://mardoc.app`, popup, nonce matched | yes, 40, 28800 | yes | `josephbarnett` | yes: delivered in 1,017 ms after a reload, no consent screen (owner) | PASS |
| Firefox desktop | | | | | | | not yet (no Firefox on the owner's machine) |
| Safari desktop | Safari 27.2, macOS | yes: `https://mardoc.app`, popup, nonce matched | yes, 40, 28800 | yes | `josephbarnett` | not run; first run included a full GitHub sign-in inside the pop-up (63,482 ms) | PASS |
| Safari iOS | | | | | | | not yet |
| Chrome Android | | | | | | | not yet |

| Recorded item | Result |
|---|---|
| Zone rewriting: callback page byte-identical | PASS: `probe.mjs` against `https://mardoc.app`, 0 failures (CSP unchanged, nonce matches, byte-identical, no rewriting markers, no-store, not served by Pages) |
| Zone rewriting: opener page byte-identical, no markers | PASS (same probe run); `/` still served by Pages; `/api/auth/refresh` 404 |
| Returning user skips consent | Yes in Chrome: a second sign-in completed in about 1 s with no consent screen. This sets SR-1 to its higher severity; F-19 (framed sign-in refused) is the mitigation and is merged |
| A-16: `/user/repos` limited to installations | **No.** With 0 installations, `GET /user/repos` returned 58 public repositories across orgs (no private ones); `GET /user/installations` returned 0. F-40's installation-based list is required, as built |

## What this means

Chrome and Safari on macOS deliver the result through the live zone, so A-10 stands for them and WP-5's hand-off can ship there. Mobile browsers and Firefox are unproven (RK-5): a phone browser that opens the pop-up as a tab could still lose its opener. The zone needs no Configuration Rule. A-16 is false; `fetchUserRepos` keeps the installations path.

Original decision rule: if PASS: WP-5 may merge and A-10 stands. If any row FAILS: write an ADR for a `BroadcastChannel` or redirect alternative (A-10, RK-1 grows) before WP-5. If the zone rewrites the callback page: add a Configuration Rule for `/api/auth/*` (Email Obfuscation, Rocket Loader and Automatic HTTPS Rewrites off) and record it in the Worker README. A-16 sets whether `fetchUserRepos` keeps `GET /user/repos`.

## Limits

- The opener page is not the real app page: it has its own CSP and no framework. A future app-page CSP or `Cross-Origin-Opener-Policy` header on the real page could still break the opener, and is out of scope.
- The production Pages site is only served unchanged outside `/api/auth/*`; the spike does not touch it.
- "Current" browser versions are whatever the owner has on the day; the report records them.
- One GitHub account; no org-approval or SSO-enforced org case, no second-account case.
- Email Address Obfuscation only rewrites email-like text; the callback page contains none, so an unchanged page does not prove the setting is harmless for other pages.
- Browser extensions (blockers, Safari content blockers) and enterprise policies are not tested.

## Cleanup

Nothing deployed, registered or pushed by the agent; the local `.dev.vars` was deleted.

Owner cleanup: delete the route `mardoc.app/api/auth/*` for `mardoc-auth-sp3` in the dashboard; `npx wrangler@4.154.0 delete` from `docs/spikes/sp-3` (deletes the Worker and its secret); restore the product Worker's route if it was removed on screen 5. **Keep the production GitHub App `MarDoc`** (installation and its Client ID stay); optionally delete the client secret generated on screen 2 and generate the real one when the product Worker is deployed (SP-2 runbook). Confirm `curl -i https://mardoc.app/api/auth/health` is a Pages 404 or the product Worker's health, as intended.
