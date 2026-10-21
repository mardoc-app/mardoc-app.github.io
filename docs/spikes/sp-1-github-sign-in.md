# SP-1: GitHub App sign-in through a Worker route on mardoc.app

Date: 2026-10-21. Time box: 2 days, starting when the owner deploys. Agent: spiker (Sonnet 5.5).
Environment: Node v26.9.0 (prototype checks); live zone mardoc.app behind Cloudflare in front of GitHub Pages.
Proves: L0 proofs 1 and 2 in [strategy.html](../design/github-sign-in/strategy.html) and [ADR 0001](../adr/0001-web-sign-in-github-app-worker-route.md). Blocks: the L1 `github-sign-in` design.
Claims are marked **verified** (ran it) or **inferred** (reasoned or read, not run).

**Status: built, awaiting owner deploy.** Results and Conclusion are pending.

## Question

Can a GitHub App sign-in round trip through `https://mardoc.app/api/auth/callback` on the live Cloudflare zone, with installation-scoped access, without changing Pages hosting?

- **PASS:** all of the following, measured on the live zone after the owner deploys.
  1. A sign-in round trip through `https://mardoc.app/api/auth/callback` returns the GitHub login.
  2. `/` and one static asset still serve Pages: `x-github-request-id` present.
  3. `/api/auth/health` returns the Worker's JSON 200 while routed. After the owner removes the route, the Pages 404 comes back, with `x-github-request-id`.
  4. The user token gets 200 on `GET /repos/{INSTALLED_REPO}` and 404 on `GET /repos/{UNINSTALLED_REPO}`.
  5. A non-owner org member's install request is observed end to end: request, owner approval, then the token reaches `ORG_REPO` with 200 (manual).
  6. `/api/auth/*` responses aren't served stale from a cache: no `x-github-request-id` on routed paths, and `cache-control: no-store`.
  7. (SP-2) With `CLIENT_SECRET_A` and `CLIENT_SECRET_B` both set, `?secret=a` and `?secret=b` each complete a round trip.
- **FAIL:** the callback can't be routed to the Worker, Pages paths break, or the token reaches the uninstalled repo.
- **Dependencies:** none.
- **Blocks on failure:** L1 `github-sign-in` design; fallback is a Worker on `auth.mardoc.app` (see strategy page).
- **Time box / first evidence checkpoint:** 2 days from deploy; first evidence is runbook step 5 (one round trip).

## Method

A single disposable Cloudflare Worker (`docs/spikes/sp-1/worker.mjs`) is routed at `mardoc.app/api/auth/*`. It runs the GitHub App web flow with state and S256 PKCE cookies, exchanges the code with the client secret, calls `/user` and `/repos/{repo}` for the installed, uninstalled and org repos, and returns only JSON with the login, statuses and booleans. It never returns, logs or `console.log`s a token, code or secret. Pre-deploy, a `node:test` suite proves the Worker's logic against a stubbed GitHub, and a read-only probe records the baseline of the live site. The owner then deploys and follows the runbook; the probe and the saved JSON are the evidence.

**Actual dependency and target environment:** GitHub App web flow (github.com), Cloudflare Workers routes on the live `mardoc.app` zone, GitHub Pages origin. Wrangler version is whatever `npx wrangler` resolves at deploy time; record it.
**Simulated parts and remaining limits:** `check.mjs` fakes GitHub, so it proves only the Worker's own logic. Nothing about the real round trip, installation scoping, org approval or secret rotation is proven until the owner deploys.

## Prototype (if used)

- **Artifact:** `docs/spikes/sp-1/` (`worker.mjs`, `wrangler.toml`, `check.mjs`, `probe.sh`). **Disposable. Not product source.**
- **What it demonstrates:** that the Worker route coexists with Pages, that a GitHub App user token is installation-scoped, and that two client secrets can be live.
- **What it does not demonstrate:** session handling, refresh, CSRF beyond state, error UX, rate limits, production hardening.
- **Implementation boundary:** Disposable prototype; product code is designed and implemented separately from these findings.

## Pre-deploy evidence

### check.mjs (verified, Node v26.9.0)

```text
$ node --test docs/spikes/sp-1/check.mjs
✔ health (41.064416ms)
✔ login sets cookies and redirects with S256 (4.20625ms)
✔ state mismatch gives 400 and no exchange (1.038625ms)
✔ callback happy path: login, statuses, no token leaked (1.539417ms)
✔ secret=b uses CLIENT_SECRET_B (0.833333ms)
✔ GitHub error maps to the error code only (0.6995ms)
✔ no-store on every response; unknown path 404 (0.870208ms)
✔ nothing calls console.log (0.114ms)
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### Baseline probe, before the Worker exists (verified, 2026-10-21T03:04Z)

Expected: criteria 2 pass; criteria 3 routed and 6 fail because there is no Worker yet; criterion 3 cut passes because nothing is routed.

```text
$ docs/spikes/sp-1/probe.sh routed
== probe routed 2026-10-21T03:04:17Z ==
-- GET /  status=200 x-github-request-id=F1D6:3E2D68:79152:83E34:6AD824B7 cf-cache-status=DYNAMIC
PASS  criterion 2: / served by Pages (x-github-request-id present)
-- GET /demo.html  status=200 x-github-request-id=7856:251173:83C02:8FB22:6AD82BBD cf-cache-status=DYNAMIC
PASS  criterion 2: /demo.html served by Pages (x-github-request-id present)
-- GET /api/auth/health  status=404 cache-control= age=1800 cf-cache-status=DYNAMIC x-github-request-id=B6D2:1CA66A:7775D:8243C:6AD824B6
FAIL  criterion 3 routed: /api/auth/health is 200
FAIL  criterion 6: no x-github-request-id on routed path
FAIL  criterion 6: cache-control is no-store
PASS  criterion 6: cf-cache-status is not a cache hit
== done: 3 failure(s) ==

$ docs/spikes/sp-1/probe.sh cut
== probe cut 2026-10-21T03:04:18Z ==
-- GET /  ... PASS  criterion 2 (x-github-request-id present)
-- GET /demo.html ... PASS  criterion 2 (x-github-request-id present)
-- GET /api/auth/health  status=404 cache-control= age=1801 cf-cache-status=DYNAMIC x-github-request-id=B6D2:1CA66A:7775D:8243C:6AD824B6
PASS  criterion 3 cut: /api/auth/health is Pages 404
PASS  criterion 3 cut: x-github-request-id present
-- cache-busted GET  x-github-request-id=B6D2:1CA66A:7775D:8243C:6AD824B6
== done: 0 failure(s) ==
```

Baseline findings:

1. **The stale Pages 404 is cached, and not by Cloudflare** (**verified**). The `/api/auth/health` 404 carries `age=1800` and the same `x-github-request-id` (`B6D2:...:6AD824B6`) on a plain request and on a cache-busted URL (`?cb=...`), and `cf-cache-status` is `DYNAMIC`. A request-header `cache-control: no-cache` did not change it. Whatever caches it sits on the GitHub Pages side (inferred: its CDN). Cloudflare is not holding it, so a Cloudflare purge may not help; the Worker route answers before Pages is reached, which should sidestep it (to confirm after deploy: criterion 6).
2. **`/favicon.ico` is a Pages 404, not a static asset** (**verified**); the probe's default asset is `/demo.html` (from `public/`), which is a 200 with `x-github-request-id`.
3. `cf-cache-status` is `DYNAMIC` for `/` and `/api/auth/health`, so Cloudflare is not caching those paths today (**verified**).

## Owner runbook

Do one step at a time and stop at any failure. Never paste a client secret, token or code anywhere except the `wrangler secret put` prompt. Run from `docs/spikes/sp-1`.

**Step 1. Register the test GitHub App.** GitHub > Settings > Developer settings > GitHub Apps > New GitHub App.
- GitHub App name: your choice. Call it `<app>`.
- Homepage URL: `https://mardoc.app`
- Callback URL: `https://mardoc.app/api/auth/callback`
- Expire user authorization tokens: **on**
- Request user authorization (OAuth) during installation: **off**
- Webhook > Active: **off**
- Repository permissions: Contents **Read-only**, Metadata **Read-only**, Pull requests **Read-only**
- Where can this GitHub App be installed: **Any account**
- Create the App, copy the **Client ID** (not a secret), then under "Client secrets" click **Generate a new client secret**. This is secret A. Keep it on screen for step 3.

**Step 2. Install on one repo.** App page > Install App > your account > "Only select repositories" > pick one test repo. That is `INSTALLED_REPO` (as `owner/repo`). Pick a second repo you can read that you did not select; that is `UNINSTALLED_REPO`.

**Step 3. Configure and deploy.**
1. Edit `wrangler.toml` `[vars]`: `CLIENT_ID`, `INSTALLED_REPO`, `UNINSTALLED_REPO`. Leave `ORG_REPO = ""`. Do not commit these values if the repo is private-sensitive; they are not secrets.
2. `npx wrangler secret put CLIENT_SECRET_A` and paste secret A at the prompt.
3. `npx wrangler deploy`. Note the Wrangler version printed.

**Step 4. Probe.** From the repo root: `docs/spikes/sp-1/probe.sh routed`. Expect all PASS (criteria 2, 3 routed, 6).

**Step 5. Round trip.** Open `https://mardoc.app/api/auth/login?secret=a` in a browser, sign in and consent. Save the JSON. Expect `login` = your login, `checks` = `INSTALLED_REPO` 200 and `UNINSTALLED_REPO` 404, `secret_used` "a". Note `token_expires_in_present` and `refresh_token_present`.

**Step 6. Org check (criterion 5).**
1. Make a test org, or use one, where a second account is a member but not an owner. Account M = member, account O = owner.
2. As M, install the App on the org's repo. Expect "request sent" instead of an install. Screenshot it.
3. As O, approve the request (Org > Settings > GitHub Apps > pending requests). Screenshot it.
4. Edit `wrangler.toml` `ORG_REPO = "org/repo"` and `npx wrangler deploy`.
5. As M, repeat step 5. Expect `ORG_REPO` 200.

**Step 7. SP-2: second secret.**
1. App settings > Client secrets > **Generate a new client secret** (secret B), without deleting A.
2. `npx wrangler secret put CLIENT_SECRET_B` and paste B.
3. Open `https://mardoc.app/api/auth/login?secret=a`, complete it, save the JSON. Then `?secret=b`, save the JSON. Both should return `login` with `secret_used` "a" and "b" respectively.
4. Optional rotation proof: delete secret A in GitHub, and repeat `?secret=b` (still works) and `?secret=a` (expect `error` such as `incorrect_client_credentials`).

**Step 8. Cut test (criterion 3).** Cloudflare dashboard > Workers & Pages > `mardoc-auth-sp1` > Settings > Domains & Routes > delete the `mardoc.app/api/auth/*` route (or remove `routes` from `wrangler.toml` and `npx wrangler deploy`). Run `docs/spikes/sp-1/probe.sh cut`. Expect all PASS. Then restore the route if you still need it.

**Step 9. Cache (criterion 6).** If the probe shows a stale Pages response on `/api/auth/*` while routed (an `x-github-request-id` or an `age` header), purge that path in Cloudflare (Caching > Configuration > Purge Cache > Custom purge > `https://mardoc.app/api/auth/health`), rerun the probe and note it. The pre-deploy baseline suggests the stale copy is held on the Pages side, so a purge may not matter; report what you see.

**Step 10. Cleanup.** Delete the Worker (`npx wrangler delete` or dashboard) and its route; delete or keep the test App (state which); delete secrets A and B in GitHub and `npx wrangler secret delete CLIENT_SECRET_A` / `_B` if the Worker still exists; revert any `wrangler.toml` edits you made.

### Paste-back format

Send the lead, in this order (no tokens, codes or secrets; the Worker's JSON contains none):

1. `npx wrangler --version` and the date.
2. Step 4: full `probe.sh routed` output.
3. Step 5: the JSON.
4. Step 6: the JSON as M, plus the two screenshots (request sent; approval).
5. Step 7: both JSONs (`?secret=a`, `?secret=b`) and, if done, the post-delete results.
6. Step 8: full `probe.sh cut` output.
7. Step 9: probe output before and after any purge, or "not needed".
8. Step 10: confirmation of what was deleted or kept.
9. Anything surprising (consent screen wording, redirects, errors).

## Results

Pending the owner's deploy.

| Criterion | Setup | Result | Measurement |
|---|---|---|---|
| 1 round trip | step 5 | pending | |
| 2 Pages paths | step 4 | pending | |
| 3 routed / cut | steps 4, 8 | pending | |
| 4 installed 200 / uninstalled 404 | step 5 | pending | |
| 5 org approval | step 6 | pending | |
| 6 no stale cache | steps 4, 9 | pending | |
| 7 two secrets (SP-2) | step 7 | pending | |

## Conclusion

Pending.

## Recommendation

Pending the results.

Decision: pending (ADR 0001 is Proposed).

## Cleanup

Nothing deployed, registered or pushed by the agent. Owner cleanup is runbook step 10.
