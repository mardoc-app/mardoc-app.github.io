# Local sign-in harness (development only)

Runs the real Auth Worker module (`worker/src/index.ts`, unchanged) and the
built app on one local origin, `http://localhost:8787`, as they share
`mardoc.app` in production. Plan: [WP-8](../../docs/plan/WP-8.md).
Nothing here is deployed: `next build` does not read `dev/`, the Auth
Worker's own `worker/wrangler.toml` bundles `worker/src/index.ts` only, and
the root `tsconfig.json` excludes `dev/`.

| File | Does |
|---|---|
| `worker.ts` | The wrapper Worker. `/api/auth/*` comes here first and goes to the product module. With `STUB_GITHUB=1` it also simulates GitHub (below) |
| `wrangler.toml` | Serves `../../out` as static assets, `run_worker_first = ["/api/auth/*"]`, port 8787, `APP_ORIGIN = "http://localhost:8787"`. No routes, no bindings, no `workers.dev`, observability off |
| `tsconfig.json` | Type-checks the wrapper with the Worker package's types: `worker/node_modules/.bin/tsc -p dev/local-auth/tsconfig.json` |
| `.dev.vars` | Yours to create for a real sign-in; git ignores it (here and at the repo root) |

Needs `npm ci` and `npm --prefix worker ci` first. `npm run dev:auth` runs
`next build`, then `wrangler dev` from the Worker package.

## With GitHub stubbed (no account, no network)

```sh
STUB_GITHUB=1 npm run dev:auth
```

- The Worker's outbound calls to `github.com` (code exchange) and
  `api.github.com` (revoke) go to an in-process stub. Any other outbound
  call gets a 502; nothing leaves the machine.
- `/api/auth/login` still runs as shipped; its redirect to GitHub's consent
  screen is pointed at `/api/auth/__stub-github/authorize`, which checks the
  client ID, redirect URI and S256 challenge, then redirects straight back to
  the real `/api/auth/callback` with a code. The exchange checks the PKCE
  verifier against that challenge and answers as GitHub does, refresh token
  included (the product module must drop it).
- `/api/auth/__stub-github/install` imitates GitHub's install return.
- The browser's own calls to `api.github.com` (`/user`, repositories) are not
  stubbed here: the app makes them directly. T-32 answers them with
  Playwright routes.

T-32 runs against this mode:

```sh
npx next build
REAL_WORKER=1 npx playwright test   # starts the harness on 8787 itself
```

`REAL_WORKER_PORT=8790` moves it if 8787 is busy. Outside CI an already
running harness is reused; the spec refuses one that is not in stub mode.

## With the development GitHub App (a real sign-in)

The owner's steps, one screen at a time, are in
[demos/m1.md Part B](../../demos/m1.md#part-b-a-real-sign-in-at-localhost).
In short:

1. Register the development App with the callback
   `http://localhost:8787/api/auth/callback` (A-15).
2. Put its client secret in `dev/local-auth/.dev.vars` as
   `CLIENT_SECRET=<secret>`.
3. `npm run dev:auth -- --var CLIENT_ID:<client id>`.

Without `CLIENT_ID` (and without `STUB_GITHUB=1`) `/api/auth/login` answers
500 with a hint instead of sending you to GitHub. A different port needs
`--port <p> --var APP_ORIGIN:http://localhost:<p>` and the same callback URL
on the App.
