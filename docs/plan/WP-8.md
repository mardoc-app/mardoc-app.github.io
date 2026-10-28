# WP-8: Integration, local sign-in and the M1 demo

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** PENDING
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** the lead (Opus) owns integration. A builder may write
  the dev harness and specs under the lead's review.

## Goal

Prove stage 1 end to end in three ways:

- **Mocked, in `ci`.** Every sign-in journey runs with GitHub and
  `/api/auth/*` mocked (T-31, NF-19), including the stage 1 gate: no token
  in storage or in any URL (T-10, T-11).
- **Real Worker, stubbed GitHub.** One run of the real Worker under
  `wrangler dev` (T-32).
- **Real GitHub, on the owner's machine.** The owner signs in for real at
  `localhost` with the development App (A-15).

Then write `demos/m1.md`, extend `npm run demo -- m1`, and write the
owner's production runbook (T-25, T-26, T-29).

**Requirements proved:** T-10, T-11, T-31, T-32; the runbook for T-25,
T-26 and T-29; backlog M1-4.

## Files that change

| Path | Change | New? |
|---|---|---|
| `dev/local-auth/worker.ts` | Development-only wrapper Worker. It serves the built `out/` as static assets and sends `/api/auth/*` to the product module (`worker/src/index.ts`, unchanged), with `APP_ORIGIN=http://localhost:8787`. When `STUB_GITHUB=1`, it routes the wrapper's outbound `fetch` calls to `github.com` and `api.github.com` to an in-process stub, so the product module still runs as shipped. App and Worker share one origin, which matches production | yes |
| `dev/local-auth/wrangler.toml` | `assets = { directory = "../../out" }`, `run_worker_first = ["/api/auth/*"]`, `workers_dev = false`, no routes, no bindings, observability off | yes |
| `dev/local-auth/README.md` | How to run it with the stub and with the development App | yes |
| `package.json` | `dev:auth`: `next build && wrangler dev -c dev/local-auth/wrangler.toml`, using the Worker package's wrangler | no |
| `e2e/sign-in-stage1-gate.spec.ts` | T-10 and T-11 with the mocked flow | yes |
| `e2e/sign-in-journeys.spec.ts` | T-31: first sign-in, the org install request message, expiry with a fake clock (F-33), Worker down to PAT, reload to Sign in again, Disconnect with revoke, and M1-4's live-session Settings cases | yes |
| `e2e/sign-in-real-worker.spec.ts` plus a Playwright project `real-worker` | T-32 against `npm run dev:auth` with `STUB_GITHUB=1`. Runs in `npm run ci` if the start-up time allows, otherwise in `npm run demo -- m1` and recorded | yes |
| `scripts/demo.sh` | `m1`: run the mocked journeys, then T-32, then write `demos/m1-demo-report.md` | no |
| `demos/m1.md` | The owner guide. Part A is automated. Part B covers local real sign-in with the development App, one screen at a time, and the production steps | yes |
| `worker/README.md` | The production runbook: tag, deploy, secret, dashboard route, logs off, usage alert at 50%, probe (T-25), rotation (NF-21, SP-2) | no |

## Increments and proof points

**Riskiest assumption:** the `__Secure-` attempt cookie and the pop-up
hand-off work on `http://localhost` in Chrome and Firefox. Browsers treat
localhost as a secure context, so `Secure` cookies are allowed there. That
is inferred, not proved. Increment 1 checks it with the real Worker before
anything depends on it. If it fails, the dev harness serves HTTPS with a
local certificate, and the change is recorded.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | The real Worker and the app work together on one local origin (T-32) | WP-5 merged | `STUB_GITHUB=1 npm run dev:auth`, then `npx playwright test e2e/sign-in-real-worker.spec.ts`. Clicking Sign in opens the real `/api/auth/login`. The stub redirects to the real callback with a code. The callback page's CSP allows only its nonce script. The tab reaches signed-in, and the pop-up closes. Runs in Chromium and Firefox | PENDING |
| 2 | The stage 1 gate and every journey pass with mocks (T-10, T-11, T-31) | Increment 1 | `npx playwright test e2e/sign-in-stage1-gate.spec.ts e2e/sign-in-journeys.spec.ts`. After sign-in, no `localStorage`, `sessionStorage` or readable cookie holds the token, and neither does any URL, history entry or `performance` entry name. `/api/auth/refresh` gives 404. Each journey reaches its designed end state. Then `npm run ci` | PENDING |
| 3 | The owner can demo and sign in for real | Increment 2; **owner:** registers the development App | `npm run demo -- m1` writes `demos/m1-demo-report.md`, all PASS. The owner follows `demos/m1.md` Part B and signs in at `http://localhost:8787` with the development App | PENDING |

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| `worker/src/index.ts` | Product module | None: wrapped, never edited |

## Risks

- **What could break:** nothing shipped. `dev/` isn't part of `out/` or
  the Worker bundle. A review check confirms that `next build` and the
  Worker's deploy files exclude it.
- **Options not taken:** stubbing GitHub inside the product module with an
  environment switch. Rejected, because the shipped credential code would
  gain a test path.

## Proof

| Test | Level | Proves |
|---|---|---|
| `t32_real_worker_callback_posts_to_tab` | Playwright, real Worker | T-32, F-14, F-23, NF-19 |
| `t10_no_token_in_web_storage_after_sign_in` | Playwright | F-30, I-10 (stage 1 gate) |
| `t11_no_token_in_urls_history_or_entries` | Playwright | NF-11 |
| `t31_*` (one per journey) | Playwright | NF-19 and the journeys |

```sh
STUB_GITHUB=1 npm run dev:auth
npx playwright test e2e/sign-in-real-worker.spec.ts
npm run ci
npm run demo -- m1
```

## Relevant lessons

None apply.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead.
- [ ] `npm run ci` is green, apart from M1-1 and M1-2, with its output pasted.
- [ ] `demos/m1.md` and `demos/m1-demo-report.md` exist.
- [ ] The plan.md row is set to DONE.
