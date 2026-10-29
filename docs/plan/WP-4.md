# WP-4: App auth state and GitHub client

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** PENDING
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** sdlc:core-builder (Opus), own worktree. This is
  credential handling.

## Goal

Make the app able to hold a sign-in credential beside the PAT and the embed
token, without any UI or pop-up yet. Four parts:

1. **The session model.** The pure session reducer implements every row of
   [Session status](../design/github-sign-in/design.md#session-status-app-auth-state-srclibauthsessionts).
2. **The credential module.** It holds the token in a closure, never in
   React state.
3. **The GitHub client.** It learns expiry and 401 handling.
4. **`AppProvider`.** It gates on `sessionKey` and `hasCredential` instead
   of the token string, as the table
   [App state by session status](../design/github-sign-in/design.md#app-state-by-session-status)
   describes.

The PAT and embed paths behave exactly as today.

**Requirements proved:** F-30 to F-36, F-50, F-53, F-60, I-14, I-15, NF-12
(T-13's state part, T-14, T-19, T-24).

## Files that change

| Path | Change | New? |
|---|---|---|
| `src/lib/auth/session.ts` | `next(state, event, now)` implementing the frozen `SessionReducer` type (WP-1). Total: an unlisted pair returns the same state and no effects. Expiry uses `expiresAt = receivedAt + expiresIn·1000 − min(60 000, expiresIn·100)` | yes |
| `src/lib/auth/credential.ts` | Module closure: `{kind: "pat" \| "embed" \| "sign-in", token, login?, expiresAt?} \| null`. `getToken()`, `setCredential()`, `clearCredential()`. `applySignInCredential(token, login, expiresAt)` never writes `mardoc_github_token` (I-10, F-53). Marker helpers for `mardoc_auth_method` | yes |
| `src/lib/github-api.ts` | `initOctokit(token, opts?: {kind, expiresAt})`. In `hook.wrap("request")`: for a sign-in credential with `now ≥ expiresAt`, throw an error with `status: 401` before sending. `setOnAuthError(fn)` is called once per credential on a 401 for a sign-in token. `fetchUserRepos`: for a sign-in token, `GET /user/installations`, then each installation's repositories (A-16, F-40) | no |
| `src/lib/rate-limit.ts` | `formatApiError` gets the sign-in wording for a sign-in credential (F-34); PAT text unchanged | no |
| `src/lib/app-context.tsx` | Replace `githubToken` React state with `sessionKey`, `hasCredential` and `session` (status, `lastError`, `expiresAt`), from a `useReducer` over `session.ts` with an effect runner. `isAuthenticated` becomes `hasCredential`. Every effect gated on `githubToken` (about lines 452 to 784) is gated on `hasCredential`, and the hash-route effect depends on `sessionKey`. Start-up decision order: embed, then saved PAT, then marker (`sign-in-again`), then none. Expose `session`, `dispatchSession` and the frozen `StartSignIn` type as a no-op placeholder, which WP-5 fills | no |
| `src/components/SettingsPanel.tsx` | Only the minimum to compile against the renamed values; no visible change (WP-6 owns the UI) | no |
| `src/__tests__/auth-session.test.ts`, `auth-credential.test.ts`, `github-api-expiry.test.ts` | Tests below | yes |

The `init` listener region belongs to WP-2, which merges first; rebase on it.
`src/lib/auth/sign-in-window.ts` is WP-5's.

## Increments and proof points

**Riskiest assumption:** replacing `githubToken` in about 15 gating effects
changes no PAT or embed behaviour. There is no earlier evidence. The
existing e2e suite seeds `localStorage.mardoc_github_token` (S-18) and is
the regression proof (T-19). It runs at the end of increment 3. The pure
reducer comes first because it has no such risk.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | The session reducer is total and matches the design table | WP-1 merged | `npx vitest run src/__tests__/auth-session.test.ts`. One test per table row, plus the worked examples: 28800 gives expiring at 19:49:00 and expired at 19:59:00 from 12:00:00; 90 s gives a 9 s margin. Same login keeps the UI; another login resets; a dirty editor asks; a failure returns to `statusBeforeAttempt` with `lastError`. A fuzz test over random status and event pairs never throws and never changes state for unlisted pairs. Layout check exits 0 (LR-10) | PENDING |
| 2 | The GitHub client refuses expired sign-in tokens and reports 401s | Increment 1 | `npx vitest run src/__tests__/github-api-expiry.test.ts`. With a fake clock, a request at `expiresAt` throws `status: 401` and sends nothing (a `fetch` spy records 0 calls). A mocked 401 calls `onAuthError` once. A PAT credential never expires and keeps today's error text. `fetchUserRepos` with a sign-in token calls the installation endpoints | PENDING |
| 3 | `AppProvider` runs on the session model; PAT and embed are unchanged | Increment 2 | `npm run check`, then `npx playwright test`: the whole existing e2e suite passes unchanged (T-19). Component tests: after `applySignInCredential` no web storage holds the token (T-10's unit part); with a saved PAT, a sign-in credential leaves `mardoc_github_token` untouched, and `disconnect` makes the PAT active again (T-13 state, F-53); Disconnect resets the client and caches and removes the marker (T-24). Then `npm run ci` | PENDING |

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| `src/lib/auth/types.ts` | yes (WP-1) | None: implements `SessionReducer` |
| `useApp()` context values | No; WP-6 consumes them | `githubToken` and `isAuthenticated` are replaced by `hasCredential`, `sessionKey` and `session`. Every consumer (`SettingsPanel.tsx`) is updated in this WP |
| `initOctokit(token, opts?)` | No | The new optional argument; existing callers are unchanged |

## Risks

- **What could break:** PAT connect and disconnect, repo restore on reload,
  deep links, embed mode, and the "no token" demo mode. All are covered by
  the existing e2e suite.
- **The riskiest step:** increment 3's gating swap. Do it mechanically:
  one effect at a time, with `hasCredential` meaning exactly
  `!!githubToken` for PAT and embed.
- **Options not taken:** keeping the token in React state for simplicity.
  Rejected by I-10 and the design.

## Proof

| Test | Level | Proves |
|---|---|---|
| `t14_session_*` | unit (fake clock) | F-31 to F-36, I-15, NF-12 |
| `t14_client_expired_token_not_sent`, `f34_auth_error_*` | unit | I-15, F-34 |
| `f40_sign_in_lists_installation_repos` | unit | F-40 (A-16) |
| `t10_sign_in_credential_not_in_storage` | component | F-30, I-10 |
| `t13_saved_pat_kept_unused` | component | F-53, I-14 |
| `t24_disconnect_resets_client_and_marker` | unit | F-60, F-32 |
| existing e2e suite | Playwright | F-50, C-17 (T-19) |

Commands, exactly as run:

```sh
npm run check
npx playwright test
npm run ci
```

## Relevant lessons

None apply.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead.
- [ ] Every test above passes and carries its IDs.
- [ ] `npm run ci` is green, with its output pasted in the PR.
- [ ] Docs updated: none beyond code comments; WP-7 updates user docs.
- [ ] Independent review findings dispositioned.
- [ ] The plan.md row is set to DONE.
