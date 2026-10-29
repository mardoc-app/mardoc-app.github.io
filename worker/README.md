# MarDoc Auth Worker

The only server-side step of Sign in with GitHub. It runs on Cloudflare for
`mardoc.app/api/auth/*` and nothing else, keeps no state beyond a
10-minute attempt cookie, and logs nothing. The design is
[design.md § Auth Worker](../docs/design/github-sign-in/design.md#auth-worker)
and [§ Worker routes](../docs/design/github-sign-in/design.md#worker-routes);
the plan is [WP-3](../docs/plan/WP-3.md).

| Route | Does |
|---|---|
| `GET /api/auth/health` | `200 {"ok": true, "version": "<VERSION or dev>"}`; or `503 {"ok":false}` when `CLIENT_ID` or `CLIENT_SECRET` is unset (the tab then shows sign-in as unavailable and offers the token) |
| `GET /api/auth/login?n=<nonce>` | Starts an attempt: sets the attempt cookie, `302` to GitHub's consent screen |
| `GET /api/auth/callback` | Checks `state`, exchanges the code, returns the page that posts the result to `APP_ORIGIN` and closes; or the install-return page |
| `POST /api/auth/revoke` | Revokes a token at GitHub (`Origin` must be `APP_ORIGIN`) |
| anything else, `/refresh` included | `404` |

## Layout

- `src/domain/`: pure rules (state and PKCE, attempt cookies, the callback
  decision order, the callback page). No network, no `env` (LR-11, checked by
  `scripts/check-layout.mjs`).
- `src/adapters/github.ts`: the code exchange and token revoke, the only
  calls to GitHub.
- `src/index.ts`: routing, request checks and the headers on every response.

## Config

| Name | Kind | Value |
|---|---|---|
| `APP_ORIGIN` | var (`wrangler.toml`) | `https://mardoc.app`. The only `postMessage` target and allowed revoke `Origin`; the callback URL is `APP_ORIGIN` + `/api/auth/callback` |
| `CLIENT_ID` | var | The GitHub App's client ID (not secret) |
| `CLIENT_SECRET` | secret | The GitHub App's client secret. Only ever set with `wrangler secret put`; never in a file in this repo |
| `VERSION` | var, optional | The deployed commit SHA, reported by health; `dev` when unset |

## Develop and test

```sh
npm --prefix worker ci
npm --prefix worker test        # Vitest in Node, GitHub stubbed
npm --prefix worker run typecheck
```

Local runtime, no Cloudflare login needed: the development harness in
[`dev/local-auth/`](../dev/local-auth/README.md) wraps this module unchanged
and serves it with the built app on one origin, `http://localhost:8787`, as
they share `mardoc.app`. `STUB_GITHUB=1 npm run dev:auth` runs it with
GitHub stubbed (T-32 runs against it). With the development App (A-15),
`npm run dev:auth -- --var CLIENT_ID:<client id>` is a real sign-in at
localhost ([demos/m1.md Part B](../demos/m1.md#part-b-a-real-sign-in-at-localhost)).

## Production runbook (owner)

Agents never run these (C-14). Each step names what you should see. Sign-in
ships only after SP-3 passes
([sp-3-callback-opener.md](../docs/spikes/sp-3-callback-opener.md)): run
SP-3's own runbook, with its disposable Worker, before step 1 here.

0. **Register the production GitHub App** (once; Q-19, A-11). GitHub →
   Settings → Developer settings → GitHub Apps → **New GitHub App**:
   - GitHub App name: `MarDoc`; Homepage URL: `https://mardoc.app`.
   - Callback URL: `https://mardoc.app/api/auth/callback`.
   - **Expire user authorization tokens**: on.
   - **Request user authorization (OAuth) during installation**: off. No
     Setup URL.
   - Webhook **Active**: off.
   - Repository permissions: Contents **Read and write**, Pull requests
     **Read and write**, Metadata **Read-only**. No account permissions.
   - Where can this GitHub App be installed: **Any account**.

   After **Create GitHub App**, copy the Client ID (it starts with `Iv`)
   for step 3. Click **Generate a new client secret** and keep the value
   only for step 2. The production App is registered as "MarDoc.app" (owner `mardoc-app`, App ID 5520121); its public page is `https://github.com/apps/mardoc-app`.
1. **Tag the commit.** On the reviewed, merged commit:
   `git tag auth-worker-<yyyy-mm-dd> && git push origin auth-worker-<yyyy-mm-dd>`,
   then `git checkout auth-worker-<yyyy-mm-dd>`. Deploy only from a tag (A-17).
2. **Set the secret.** In `worker/`: `npx wrangler secret put CLIENT_SECRET`
   and paste the GitHub App's client secret at the prompt. Wrangler answers
   that the secret was uploaded. Never put the value in a file or a shell
   argument.
3. **Deploy.** In `worker/`:
   `npx wrangler deploy --var CLIENT_ID:<client id> --var VERSION:$(git rev-parse HEAD)`.
   `wrangler.toml` keeps `workers_dev` and preview URLs off, so the Worker has
   no `*.workers.dev` address. Deploy from `worker/` only: never
   `dev/local-auth/wrangler.toml` (the local harness) or a spike's config.
4. **Add the route in the dashboard.** Cloudflare dashboard → the
   `mardoc.app` zone → Workers Routes → Add route: `mardoc.app/api/auth/*`
   → Worker `mardoc-auth`. No other route.
5. **Check logs are off.** Workers & Pages → `mardoc-auth` →
   Settings → Observability: Workers Logs and traces are off (I-16). The
   deploy keeps `[observability] enabled = false`; if the dashboard shows them
   on, turn them off.
6. **Add the usage notification.** Notifications → Add → Workers usage
   (or the closest Workers request alert offered on the Free plan) at 50% of
   the daily 100,000-request limit, that is 50,000 requests a day (NF-17),
   sent to your email. On the Free plan (checked 2026-10-29) Alerts → Account &
   billing offers only billing alerts, so there is no request alert: skip this
   step and rely on the step 9 check. Over the limit, sign-in fails until
   00:00 UTC and users keep the token option (F-51).
7. **Probe it (T-25).**
   - `curl -i https://mardoc.app/api/auth/health` → `200`, `"ok":true`, the
     tagged SHA as `version`, `cache-control: no-store`, no
     `access-control-*` header.
   - `503` with `{"ok":false}` means `CLIENT_ID` or `CLIENT_SECRET` is not
     set on the deployed Worker. Set the secret (step 2) or redeploy with
     `--var CLIENT_ID:<client id>` (step 3), then probe again. The body
     names neither variable.
   - `curl -i https://mardoc.app/api/auth/refresh` → `404`.
   - `curl -i https://mardoc.app/` → the Pages site, unchanged (it carries
     an `x-github-request-id` header).
8. **Sign in once (T-26).** In a private window open `https://mardoc.app`,
   Settings → GitHub Connection → **Sign in with GitHub**, approve. Settings
   says "Signed in with GitHub as `<your login>`". Click **Disconnect**;
   Settings shows **Sign in with GitHub** again. The rest of T-26 (click
   count, installed-only picker, org request, latency, browsers) is the M1
   owner demo in [demos/m1.md](../demos/m1.md).
9. **At each milestone close (T-29, C-15, NF-17).** Workers & Pages →
   `mardoc-auth` → Metrics: requests per day well under 100,000 and errors
   near zero. The account's Workers plan reads **Free**. Record both in the
   milestone's demo report.

**Rollback:** delete the route from step 4. Health then fails and Settings
falls back to the token option (F-51). Tokens already issued keep working
until they expire (8 hours).

**Secret rotation (NF-21).** Yearly, and at once on any suspected leak.

1. GitHub App settings → Client secrets → **Generate a new client secret**.
   Keep the old secret for now.
2. In `worker/`, on the deployed tag: `npx wrangler secret put CLIENT_SECRET`
   and paste the new secret at the prompt. The Worker uses it from its next
   request.
3. Sign in once at `https://mardoc.app` (step 8). It must succeed.
4. GitHub App settings → delete the old client secret.
5. Sign in once more. If it fails, generate another secret and repeat steps
   2 to 4.

Whether GitHub accepts two secrets at once, so step 2 fails no sign-in in
flight, is SP-2's question
([sp-2-client-secret-rotation.md](../docs/spikes/sp-2-client-secret-rotation.md)).
Until SP-2 passes, rotate at a quiet time: an attempt that began before
step 2 can end with `exchange_failed`, and that user signs in again.
