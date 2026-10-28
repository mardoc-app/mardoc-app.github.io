# WP-5: Pop-up hand-off

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** PENDING
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** sdlc:core-builder (Opus), own worktree. This is
  credential handling.

## Goal

Make **Sign in with GitHub** work end to end in the tab:
- open the pop-up inside the click;
- run the attempt's health check, timers and close detection;
- accept a result only from that pop-up, from the app's own origin, carrying
  the attempt's nonce (I-11);
- put the token in the credential module's pending slot and dispatch a
  token-free `result`;
- run the session effects through to `signed-in`.

Design: [App auth state](../design/github-sign-in/design.md#app-auth-state),
[Session status](../design/github-sign-in/design.md#session-status-app-auth-state-srclibauthsessionts),
[the first-sign-in journey](../design/github-sign-in/design.md#i-sign-in-for-the-first-time-f-10-to-f-14-f-20-to-f-24-f-30),
and the frozen `src/lib/auth/types.ts` and `contract.ts`.

**Requirements proved:** F-11 (mocked), F-12, F-14, F-51, F-52, I-11
(T-12, T-17, T-18's session part).

**Gate:** the build can start once WP-4 merges, with GitHub and the Worker
mocked. **Merging waits for SP-3 PASS.** If SP-3 finds that a browser loses
`window.opener`, the fallback needs an ADR (A-10) and a re-plan of this WP.

## Files that change

| Path | Change | New? |
|---|---|---|
| `src/lib/auth/sign-in-window.ts` | The adapter: `createSignInWindow(deps)`. `start()` makes a 16-byte base64url nonce with `crypto.getRandomValues` and calls `window.open(AUTH_ROUTES.login + "?n=" + nonce, SIGN_IN_POPUP_NAME, SIGN_IN_POPUP_FEATURES)` synchronously. A `message` listener checks, in order: `event.origin === window.location.origin`, `event.source === popup`, `parseSignInResult(event.data)`, and the nonce equal to the attempt's. Then it calls `credential.setPending(token, expiresIn)` and dispatches the token-free `result`. Close detection polls `popup.closed` every 500 ms. The health check calls `fetch(AUTH_ROUTES.health)` with `HEALTH_TIMEOUT_MS`. Timers come from `arm-timer` and `clear-timer` | yes |
| `src/lib/app-context.tsx` | The effect runner handles `open-popup`, `focus-popup`, `close-popup`, `health-check`, `arm-timer`, `clear-timer`, `get-user` (`GET /user` with the pending token, not yet applied, and a `USER_CHECK_DEADLINE_MS` deadline), `discard-pending-token` and `confirm-discard` (through `guardNavigation`). It replaces WP-4's placeholder `startSignIn` with the real one. Only the runner and the provider value change | no |
| `src/__tests__/sign-in-window.test.ts` | Unit tests with a fake window, fake pop-up and fake clock | yes |
| `e2e/sign-in-flow.spec.ts` | Playwright with `/api/auth/*` and `api.github.com` mocked. The mocked `/api/auth/login` returns a small page that posts a result to `window.opener` and closes, as the real callback page does | yes |
| `e2e/fixtures/auth-mocks.ts` | Shared route helpers for the mocked Worker and GitHub. WP-6 and WP-8 reuse them | yes |

## Increments and proof points

**Riskiest assumption:** the pop-up keeps `window.opener` across GitHub's
pages in real browsers (A-10). That belongs to SP-3 and can't be proved
here with mocks. Increment 2 proves the in-tab logic against a same-origin
mock, and SP-3 must PASS before merge.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | The adapter accepts only the right result (I-11) | WP-4 merged | `npx vitest run src/__tests__/sign-in-window.test.ts`. A result is ignored when it comes from another window, an iframe, the wrong origin, a wrong nonce, a malformed message or after the attempt ended. The pending token is set only for an accepted result. `window.open` is called synchronously in `start()`. A null pop-up dispatches `popup-blocked`. A closed pop-up with no result for 1 s gives `close-grace-passed`. **FAIL:** any ignored case reaches `setPending` | **PASS** (2026-10-28, `302d30e`): 27 of 27. Mutation check: removing the origin check fails `t12_wrong_origin_ignored`; removing the source check fails `t12_result_from_other_window_ignored` and `t12_result_from_iframe_with_copied_nonce_ignored`; removing the nonce check fails `t12_wrong_nonce_ignored` and `t12_result_from_an_earlier_attempts_popup_ignored` |
| 2 | A mocked sign-in completes in the browser, and the route and document survive (F-11 mocked, F-12, T-12, T-17) | Increment 1 | `PLAYWRIGHT_PORT=3105 npx playwright test e2e/sign-in-flow.spec.ts`. Start at a deep link to a file and call `startSignIn` through a test hook or the WP-6 button if present. The pop-up posts; the status reaches `signed-in`; `location.hash` is unchanged; the same file is open; GitHub requests carry the mocked token; no web storage holds it. A result posted by an iframe with a copied nonce is ignored | **PASS** (2026-10-28, `458e75d`, `217d50b`): desktop Chromium and mobile WebKit, 4 tests each, including `f10_settings_button_starts_mocked_sign_in` through WP-6's Settings button and `f61_disconnect_posts_revoke_with_origin_and_restores_the_pat`. Worker and GitHub mocked |
| 3 | Every failure ends the attempt within its time and keeps the old credential (F-51, F-52, the T-18 session part) | Increment 2 | The same spec, failure cases: health 404, 503 or a network error gives `worker_unavailable` within 5 s; blocked pop-up; window closed; `timeout` with a fake clock; each error code from the mocked page; `GET /user` 401 gives `exchange_failed`. A seeded PAT is still active after each one. Then `npm run ci` | **PASS** (2026-10-28): 14 failure tests per project; `npm run ci` green apart from M1-1 (`image-flows.spec.ts`, 2 failed) |

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| `src/lib/auth/types.ts`, `contract.ts` | yes | None: implements them |
| `StartSignIn` in the context | Type frozen | The real implementation |

## Risks

- **What could break:** PAT and embed flows, if the runner mishandles a
  late event. The reducer ignores late events by nonce, and the full e2e
  suite runs in increment 3.
- **The riskiest step:** the source and origin checks. Unit tests cover
  every rejection case, and a mutation check (remove each check and see a
  test fail) is recorded as evidence.
- **Options not taken:** `BroadcastChannel`. It has no `event.source`, so
  only SP-3's failure would justify it, through an ADR.

## Proof

| Test | Level | Proves |
|---|---|---|
| `t12_result_from_other_window_ignored`, `t12_wrong_nonce_ignored`, `t12_wrong_origin_ignored` | unit plus Playwright | F-14, I-11 |
| `f12_deep_link_survives_sign_in` | Playwright | F-12 (T-17) |
| `f11_mocked_sign_in_completes` | Playwright | F-11 (mocked), F-30 |
| `f51_worker_unavailable_within_5s_*` | Playwright | F-51 |
| `f52_failure_codes_keep_credential_*` | Playwright | F-52 |

```sh
npx vitest run src/__tests__/sign-in-window.test.ts
PLAYWRIGHT_PORT=3105 npx playwright test e2e/sign-in-flow.spec.ts
npm run ci
```

## Relevant lessons

None apply.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead.
- [ ] SP-3 has passed before the merge.
- [ ] `npm run ci` is green, apart from the backlog items M1-1 and M1-2, with output pasted.
- [ ] The plan.md row is set to DONE.
