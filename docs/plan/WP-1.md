# WP-1: Build prerequisites and frozen sign-in contracts

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** PENDING
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** sdlc:builder (Sonnet), own worktree. The lead reviews the
  dependency list before the first install.

## Goal

Create everything later sign-in work packages build on, without any sign-in
behaviour. That means three things:

- **The Worker project:** `worker/` has its own package, lockfile and
  tsconfig, so Worker code and dependencies stay out of the site build. Its
  Wrangler file has no routes, no `workers.dev` address and no storage.
- **The frozen contracts:** the sign-in contract that the app and the Worker
  share (routes, the result message and its codes, nonce and `state`
  formats) and the auth types the app's work packages share.
- **The layout check:** a check in `npm run ci` that enforces LR-10 and LR-11.

Design source: [design.md § Operations, reliability and rollout](../design/github-sign-in/design.md#operations-reliability-and-rollout)
(build prerequisites), [§ Interfaces and data](../design/github-sign-in/design.md#interfaces-and-data),
[§ Session status](../design/github-sign-in/design.md#session-status-app-auth-state-srclibauthsessionts)
and [§ Layout rules](../design/github-sign-in/design.md#layout-rules).

**Requirements proved:** LR-10, LR-11 (T-30); the contract tests below.
The design names the routes, message and codes but proves nothing at runtime
here. WP-3, WP-4 and WP-5 implement them.

## Files that change

| Path | Change | New? |
|---|---|---|
| `worker/package.json` | Private package, `"type": "module"`. Scripts: `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `dev` (`wrangler dev`). Dev dependencies pinned to exact versions: `wrangler`, `@cloudflare/workers-types`, `typescript`, `vitest` | yes |
| `worker/package-lock.json` | Lockfile from `npm install` in `worker/` | yes |
| `worker/tsconfig.json` | `lib: ["es2022"]`, `types: ["@cloudflare/workers-types"]`, no DOM library, `strict`. Includes `src`, `test` and `../src/lib/auth/contract.ts` | yes |
| `worker/wrangler.toml` | `name = "mardoc-auth"`, `main = "src/index.ts"`, a fixed `compatibility_date`, `workers_dev = false`, `preview_urls = false`, no `routes`, no KV, D1, R2 or Durable Object bindings, `[observability] enabled = false` (I-16). `[vars] APP_ORIGIN = "https://mardoc.app"`, `CLIENT_ID = ""`. Comment: secrets come only from `wrangler secret put`; routes are added by the owner in the dashboard | yes |
| `worker/src/index.ts` | A `fetch` handler that returns `404` for every request. WP-3 replaces the body | yes |
| `worker/test/skeleton.test.ts` | Proves the toolchain: the handler returns 404 for `/api/auth/refresh`, and `contract.ts` imports and type-checks under the Worker's tsconfig | yes |
| `src/lib/auth/contract.ts` | The frozen sign-in contract (below). Pure TypeScript: no DOM, no `window`, no `fetch` | yes |
| `src/lib/auth/types.ts` | The frozen auth types (below). Types only | yes |
| `src/__tests__/auth-contract.test.ts` | Contract tests (below) | yes |
| `scripts/check-layout.mjs` | The LR-10 and LR-11 checker (below) | yes |
| `scripts/check-layout.test.mjs` or `src/__tests__/check-layout.test.ts` | Runs the checker on violation fixtures | yes |
| `tsconfig.json` | Add `"worker"` to `exclude` | no |
| `vitest.config.ts` | Add `"worker"` to `exclude` | no |
| `package.json` | `check`: `node scripts/check-layout.mjs && vitest --run`. `ci`: `node scripts/check-layout.mjs && vitest --run && npm --prefix worker ci && npm --prefix worker run typecheck && npm --prefix worker test && next build && playwright test` | no |
| `.github/workflows/test.yml` | Add a job that runs the layout check and the Worker's `ci`, `typecheck` and `test` on Node 22 | no |
| `.gitignore` | Add `.dev.vars`, which holds a local development secret for `wrangler dev` | no |
| `docs/design/github-sign-in/design.md` | One line under build prerequisites recording the chosen test setup and dependency list. The LR rows now say "checked by T-30 in `ci`" | no |

Nothing outside these paths.

### The frozen contract (`src/lib/auth/contract.ts`)

These values come from design.md § Interfaces and data. Copy them exactly.

- `AUTH_BASE = "/api/auth"`, plus the route paths `health`, `login`,
  `callback` and `revoke`. `/refresh` is never named (C-16).
- `NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/`.
- `ERROR_CODE_PATTERN = /^[a-z_]{1,40}$/`.
- `type SignInResultCode`: the union of every code in the result-code
  table. That covers `access_denied`, `state_mismatch`,
  `bad_verification_code`, `exchange_failed`, `non_expiring_token`,
  `popup_blocked`, `worker_unavailable`, `timeout`, `window_closed` and
  `cancelled`, plus `string & {}` for other GitHub codes that match the
  pattern.
- `type SignInResult`, version 1:
  - success: `{ type: "mardoc-sign-in-result", v: 1, nonce: string | null, ok: true, token: string, expiresIn: number }`;
  - failure: the same with `ok: false, error: SignInResultCode` in place of
    the token and `expiresIn`.
- `parseSignInResult(data: unknown): SignInResult | null`. It returns
  `null` for:
  - any other `type` or `v`;
  - a non-null `nonce` that fails `NONCE_PATTERN`;
  - `ok: true` without a non-empty string `token` and a positive integer
    `expiresIn`;
  - `ok: false` with an `error` outside `ERROR_CODE_PATTERN`.

  It never throws.
- `nonceFromState(state: string): string | null`: the part before the first
  `.` if it matches `NONCE_PATTERN`, otherwise `null`.
- `ATTEMPT_COOKIE_PREFIX = "__Secure-mardoc_auth_"` and
  `ATTEMPT_MAX_AGE_SECONDS = 600`.

### The frozen types (`src/lib/auth/types.ts`)

- `SessionStatus`: `"signed-out" | "signing-in" | "checking-user" | "signed-in" | "expiring" | "expired" | "sign-in-again"`.
- `SessionKey`: `"pat" | "embed" | \`sign-in:${string}\` | null`.
- `SessionEvent`: a discriminated union with one member per event in the
  session table. The events are `start`, `health-failed`, `result`,
  `popup-closed`, `close-grace-passed`, `deadline`, `user`, `user-failed`,
  `tick`, `auth-error`, `continue-without`, `connect-pat`, `disconnect` and
  `disconnect-and-remove-pat`. `result` carries a `SignInResult` and the
  message's `source`, as `unknown`. `user` carries `login: string`.
- `SessionState`:
  - `status`;
  - `sessionKey`;
  - `lastLogin: string | null`;
  - `lastError: SignInResultCode | null`;
  - `statusBeforeAttempt`;
  - `expiresAt: number | null`;
  - `attempt: { nonce: string; deadline: number } | null`.

  The token is not a field: it is never in React state or this record (I-10).
- `SessionEffect`: a discriminated union naming the effects in the table's
  Effects column. Examples: `open-popup`, `focus-popup`, `close-popup`,
  `health-check`, `get-user`, `apply-same-login`, `apply-new-login`,
  `confirm-discard`, `reset-client`, `revoke`, `remove-marker`, `set-marker`,
  `remove-user-repos`, `remove-saved-pat`, `schedule-expiry`.
- `type SessionReducer = (state: SessionState, event: SessionEvent, now: number) => { state: SessionState; effects: SessionEffect[] }`.
- `type StartSignIn = () => void`, the function the Settings screen and
  banner call (WP-6 builds against this before WP-5 exists).

Changing either file after WP-1 merges needs an ADR and a re-plan of WP-3 to
WP-6.

### The layout checker (`scripts/check-layout.mjs`)

Node with no dependencies. It reads files and matches import specifiers and
identifiers with regular expressions, and prints one line per violation with
`LR-n file:line`. It exits 1 on any violation and 0 otherwise.

- **LR-10:** files under `src/lib/auth/` other than `sign-in-window.ts` and
  `credential.ts`, which are the adapters, import nothing from `react` or
  `react-dom`. They don't use the identifiers `window`, `document`,
  `localStorage`, `sessionStorage` or `fetch` outside comments.
- **LR-11:** files under `worker/src/domain/` use no `fetch` and no `env`.
  GitHub calls live only in `worker/src/adapters/github.ts`.

Missing directories are not violations, because WP-3 and WP-4 create them
later.

## Increments and proof points

**Riskiest assumption:** three things must hold together:

- Worker code with Workers types and no DOM library can type-check and test
  in its own package;
- that code can import `src/lib/auth/contract.ts` from outside its root;
- `next build` and the root Vitest run ignore `worker/`.

There is no earlier evidence. SP-1's spike Worker was a single `.mjs` file
with no TypeScript. Increment 1 proves it in isolation before anything
depends on it.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | The `worker/` project builds, type-checks and tests on its own. It shares one file with the app, and the site build ignores it | The lead approves the dependency list: names, exact versions, whether each package runs install scripts (`hasInstallScript` in the lockfile), and its publisher | `npm --prefix worker ci && npm --prefix worker run typecheck && npm --prefix worker test` passes. `npx next build` passes. `npm run check` passes with the same test count as before plus the new tests. **FAIL:** any type error from `worker/` in `next build`, or the Worker tsconfig pulling in DOM types | PENDING |
| 2 | The contract and types are written and frozen | Increment 1 | `src/__tests__/auth-contract.test.ts` passes. `parseSignInResult` accepts both sample messages from design.md. It rejects a wrong `type`, `v: 2`, a short nonce, `ok: true` without a token, `expiresIn: 0`, and `error: "<script>"`, and never throws on `null`, a number or a string. `nonceFromState("abc.def")` is `null`, and a valid 22-character nonce round-trips. Every code in design.md's result-code table appears in `SignInResultCode`. The Worker's `skeleton.test.ts` imports the contract. **FAIL:** a code or field that differs from design.md | PENDING |
| 3 | The layout check runs in `ci` | Increment 2 | The checker's tests: a fixture under a temporary `src/lib/auth/` that imports `react` gives `LR-10` and exit 1; a fixture under `worker/src/domain/` that calls `fetch` gives `LR-11` and exit 1; the real tree exits 0. Then `npm run ci` is green and its output is pasted in the PR | PENDING |

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| `src/lib/auth/contract.ts` | Frozen by this WP | New |
| `src/lib/auth/types.ts` | Frozen by this WP | New |
| `npm run check` and `npm run ci` | No | Add the layout check and the Worker steps |

## Risks

- **What could break:** `next build` type-checking `worker/` code against
  the DOM library. Also the existing Vitest run picking up `worker/test`,
  and the e2e run, which must not change.
- **The riskiest step:** increment 1's shared import across two tsconfigs.
  It's proved first, with nothing depending on it yet.
- **Supply chain:** `wrangler` is large and runs install steps. It lives
  only in `worker/package.json`, not in the site's dependencies, so the site
  build never installs it.
- **Options not taken:**
  - *Cloudflare's Workers Vitest pool, which the design mentions.* This
    plan uses plain Vitest in Node instead: the Worker code uses only
    standard `Request`, `Response`, `URL` and `crypto.subtle`, which Node 22
    provides. The real runtime is covered by T-32 under `wrangler dev` in
    WP-8. That is one dependency fewer, and it avoids pinning Vitest to the
    pool's supported range. If WP-3 meets a runtime difference, it adds the
    pool and records the change.
  - *Worker dependencies in the root `package.json`.* Rejected so the
    site's lockfile and the credential-handling code don't share a supply
    chain.

## Proof

| Test | Level | Proves |
|---|---|---|
| `auth_contract_parses_design_samples` | unit | The contract matches design.md (Interfaces and data) |
| `auth_contract_rejects_malformed_results` | unit | `parseSignInResult` boundaries (I-11 input side) |
| `auth_contract_codes_match_design_table` | unit | Result codes |
| `worker_skeleton_refresh_is_404` | Worker unit | C-16, toolchain |
| `t30_layout_check_flags_violations` | unit | LR-10, LR-11 (T-30) |

Commands, exactly as run:

```sh
npm --prefix worker ci && npm --prefix worker run typecheck && npm --prefix worker test
npm run check
npm run ci
```

The verifier also exercises the existing e2e suite, which must be unchanged,
and `npx next build` with a fresh `out/`.

## Relevant lessons

None apply. `docs/lessons.md` holds only the template's example row.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead.
- [ ] Every test above passes and carries its IDs.
- [ ] `npm run ci` is green, with its output pasted in the PR.
- [ ] Docs updated: the design.md build-prerequisites line and the LR rows.
- [ ] Independent review of the frozen contract and types (the wave 1
      checkpoint) with findings dispositioned.
- [ ] The plan.md row is set to DONE.
