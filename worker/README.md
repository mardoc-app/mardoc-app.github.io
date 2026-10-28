# MarDoc Auth Worker

The only server-side step of Sign in with GitHub. It runs on Cloudflare for
`mardoc.app/api/auth/*` and nothing else, keeps no state beyond a
10-minute attempt cookie, and logs nothing. The design is
[design.md § Auth Worker](../docs/design/github-sign-in/design.md#auth-worker)
and [§ Worker routes](../docs/design/github-sign-in/design.md#worker-routes);
the plan is [WP-3](../docs/plan/WP-3.md).

| Route | Does |
|---|---|
| `GET /api/auth/health` | `200 {"ok": true, "version": "<VERSION or dev>"}` |
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

Local runtime check, no Cloudflare login needed: put a dummy line
`CLIENT_SECRET=dummy` in `worker/.dev.vars` (git ignores it), then run
`npx wrangler dev --var CLIENT_ID:test` in `worker/` and probe
`http://localhost:8787/api/auth/health`. Delete `.dev.vars` afterwards.
A real sign-in locally needs the development App with a localhost callback
(A-15) and `--var APP_ORIGIN:http://localhost:<port>`.

## Owner deploy steps (before SP-3)

Agents never run these (C-14). Each step names what you should see.

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
   no `*.workers.dev` address.
4. **Add the route in the dashboard.** Cloudflare dashboard → the
   `mardoc.app` zone → Workers Routes → Add route: `mardoc.app/api/auth/*`
   → Worker `mardoc-auth`. No other route.
5. **Check observability is off.** Workers & Pages → `mardoc-auth` →
   Settings → Observability: Workers Logs and traces are off (I-16). The
   deploy keeps `[observability] enabled = false`; if the dashboard shows them
   on, turn them off.
6. **Add the usage notification.** Notifications → Add → Workers usage
   (or the closest Workers request alert offered on the Free plan) at 50% of
   the daily 100,000-request limit (NF-17), sent to your email.
7. **Probe it.**
   - `curl -i https://mardoc.app/api/auth/health` → `200`, `"ok":true`, the
     tagged SHA as `version`, `cache-control: no-store`, no
     `access-control-*` header.
   - `curl -i https://mardoc.app/api/auth/refresh` → `404`.
   - `curl -i https://mardoc.app/` → the Pages site, unchanged.

**Rollback:** delete the route from step 4. Health then fails and Settings
falls back to the token option (F-51). **Secret rotation:** follow the
[SP-2 runbook](../docs/spikes/sp-2-client-secret-rotation.md).
