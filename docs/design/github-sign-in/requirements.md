# GitHub sign-in: requirements

Level: L1

This document lists everything stage 1 of GitHub sign-in (issue
[#146](https://github.com/mardoc-app/mardoc-app.github.io/issues/146)) must do
and every constraint it must respect. Each requirement has an ID that
[design.md](design.md) cites, and the design's traceability table maps every
ID to the parts that satisfy it and the test that verifies it. The owner's
problem and outcome are in [intent.md](intent.md); the direction was decided
at L0 ([strategy.html](strategy.html), D-1,
[ADR 0001](../../adr/0001-web-sign-in-github-app-worker-route.md)) and proven
live by [SP-1](../../spikes/sp-1-github-sign-in.md).

Stage 1 adds **Sign in with GitHub** through a MarDoc GitHub App. A Worker on
`mardoc.app/api/auth/*` exchanges the code, and the app keeps the 8-hour
access token in memory only. The user signs in again after expiry or a
reload, and the PAT option keeps working beside it. There is no refresh
route and no stored token.

## How to read this document

- **Source:**
  - **S-n** is an owner statement from [intent.md](intent.md), listed below.
  - **C-n** is a constraint in this document.
  - **Derived** is a requirement that follows from analysis rather than from
    the owner's words. Every derived requirement names the IDs it comes from.
- **Priority:**
  - **Must** means the product is wrong without it.
  - **Should** means it is expected, but can wait for a later stage.
  - **Could** is welcome but optional.
- **Stage** is the first release stage that delivers the requirement. Stage 1
  is sign-in without refresh; stage 2 (silent refresh) is out of scope here
  ([note](#stage-2-note)). Milestones are scheduled in [plan.md](../../plan.md).
- **Acceptance** is a check that a reviewer can run or observe. "Mocked
  exchange" means a Playwright route that stands in for `/api/auth/*` (S-22).
  "Owner demo" means a step the owner runs on the live zone, because agents
  never touch the GitHub App or Cloudflare (C-14).
- IDs start at 10 so they never collide with the system template's
  placeholders; open questions continue the repo sequence at Q-19.

The words "shall" and "must" mark obligations, and "should" marks
expectations. Numbers marked † are engineering targets set in this document.
The owner has not stated them, so review them.

## Owner's statements

The full list, with sources, is in [intent.md](intent.md#owners-statements).

| Ref | Statement | Source |
|---|---|---|
| S-10 | "Replace (or offer an alternative to) manually pasting a personal access token with a **"Sign in with GitHub"** button." | #146, Goal |
| S-11 | "Settings shows **Sign in with GitHub** as the primary option, with "Use a personal access token" kept as an advanced fallback." | #146, Proposed flow 1 |
| S-12 | "A new user can connect GitHub on mardoc.app with no PAT, in about 2 clicks." | #146, Acceptance criteria |
| S-13 | "MarDoc can only reach the repos and permissions the user granted." | #146, Acceptance criteria |
| S-14 | "Make the UI handle "signed in but the app isn't installed on this repo" with an install link (`https://github.com/apps/<app-slug>/installations/new`)." | #146, Recommended approach |
| S-15 | "an expired or revoked token sends the user back to sign-in without losing their place." | #146, Acceptance criteria |
| S-16 | "After login, preserve the deep link and hash route the user started from" | #146, Proposed flow 6 |
| S-17 | "The PAT path still works." | #146, Acceptance criteria |
| S-18 | "Many e2e specs seed `localStorage.mardoc_github_token`. That has to keep working." | #146, Current state |
| S-19 | "Validate `state` (CSRF), use PKCE, and lock the worker's CORS to the MarDoc origin." | #146, Security notes |
| S-20 | "Disconnect should also revoke the grant (`DELETE /applications/{client_id}/grant` through the worker) and reset the module-level Octokit client" | #146, Security notes |
| S-21 | "Docs: update `README.md`, `docs/setup-github-pat.md` (keep it as the fallback) and `docs/data-and-security.md`." | #146, Tasks |
| S-22 | "add e2e for the callback using a mocked exchange endpoint." | #146, Tasks |
| S-23 | "Stage 1: … The access token is kept in memory only, never stored. The user signs in again after 8 hours or a reload, and the PAT option stays." | L0 release order (D-1) |
| S-24 | "Stage 1: after sign-in, browser tests find no GitHub token in `localStorage` or `sessionStorage`, and the Worker has no refresh route." | L0 proof 3 (D-1) |
| S-25 | "the stage 1 scope, the PAT kept as a fallback, no token in storage, the 8-hour sign-in again" | Owner's L1 brief, 2026-10-21 |
| S-26 | "Journeys: first sign-in, sign-in with an org install request, token expiry, Worker down → PAT" | Owner's L1 brief, 2026-10-21 |
| S-27 | "Stage 2 (refresh) is out of scope apart from a note." | Owner's L1 brief, 2026-10-21 |
| S-28 | "The README, data-and-security.md and capabilities.md must say so." (Cloudflare in the credential path) | L0 § The pieces (D-1) |

## Constraints

| ID | Constraint | Source | Acceptance |
|---|---|---|---|
| C-10 | The app stays a static export served by GitHub Pages on `mardoc.app`. | ADR 0001 | `next.config.js` keeps `output: "export"`; `/` returns `x-github-request-id` (SP-1 probe criterion 2). |
| C-11 | Sign-in uses a GitHub App, not a classic OAuth App. | ADR 0001 | The authorize URL's `client_id` belongs to a GitHub App (owner demo: the App's settings page). |
| C-12 | The code exchange runs in a Cloudflare Worker bound to the route `mardoc.app/api/auth/*`. | ADR 0001 | `/api/auth/health` returns the Worker's JSON with no `x-github-request-id` (probe criterion 3). |
| C-13 | The GitHub App client secret lives only in Worker secrets. | Q-7 | The repo and the built `out/` contain no `client_secret` value; the Worker reads it only from `env` (code review). |
| C-14 | The owner registers and changes the GitHub App and does every Cloudflare step (route, deploy, secrets); agents never do. | [plan.md § How work is done](../../plan.md#how-work-is-done) | No agent-run command in the WP logs calls `wrangler deploy`, `wrangler secret` or the GitHub App settings. |
| C-15 | The Worker runs on the Cloudflare Workers Free plan. | L0 operating commitment | The owner's Cloudflare dashboard shows the Free plan for the Worker. |
| C-16 | Stage 1 has no refresh route and stores no refresh token anywhere. | D-1, S-24, S-27 | F-24 and F-25 pass. |
| C-17 | The PAT option stays available on the web app. | ADR 0001, S-17 | F-50 passes. |

## Functional requirements

### Signing in

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-10 | When no credential is active, Settings shall offer **Sign in with GitHub** as the first option. | S-10, S-11 | Must | 1 | Playwright: open Settings with empty storage; the first button in GitHub Connection reads "Sign in with GitHub". |
| F-17 | Settings shall keep the personal-access-token form behind a "Use a personal access token" control. | S-11 | Must | 1 | Playwright: with empty storage the token input is hidden until "Use a personal access token" is activated. |
| F-18 | With a personal access token active, Settings shall still offer Sign in with GitHub. | S-10 | Should | 1 | Playwright: seed `mardoc_github_token`; Settings shows "Connected with a personal access token" and a "Sign in with GitHub" button. |
| F-11 | A user who has already installed MarDoc shall be signed in after clicking Sign in with GitHub and approving the GitHub consent screen, with no other step. | S-12 | Must | 1 | Owner demo: a test account with the App installed counts its clicks from Settings to "Signed in as `<login>`": at most 2 the first time, and 1 when GitHub has already recorded the authorisation. |
| F-12 | Signing in shall leave the user on the hash route and open document they started from. | S-16 | Must | 1 | Playwright with a mocked exchange: start at a deep link to a file, sign in; `location.hash` is unchanged and the same file is open. |
| F-13 | Once signed in, Settings shall show the GitHub login and that the connection is a GitHub sign-in. | Derived from S-10, F-11 | Should | 1 | Playwright with a mocked exchange: Settings shows "Signed in with GitHub as `octo`". |
| F-14 | The app shall accept a sign-in result only from the sign-in window it opened, carrying the one-time value it generated for that attempt. | Derived from S-19 | Must | 1 | Unit and Playwright: a correctly shaped result posted from another window, from a rendered-HTML iframe, or with a different one-time value is ignored, and the active credential is unchanged. |
| F-15 | Sign in with GitHub shall not be offered inside the VS Code embed (`?embed=true`). | Derived from A-20 | Must | 1 | Playwright: load `/?embed=true`; no "Sign in with GitHub" control is rendered. |
| F-19 | When MarDoc runs inside a frame on another page (`window.top !== window.self`) outside embed mode, the app shall neither offer nor start Sign in with GitHub; Settings and the banner shall offer "Open MarDoc in a new tab" (a link to the current address that opens a new tab with `noopener`) and keep the token option. | M1 security review SR-1 | Must | 1 | Playwright (T-34): a page on another origin frames MarDoc; Settings shows no Sign in button and an "Open MarDoc in a new tab" link with the frame's URL, `target="_blank"` and `rel` containing `noopener`, plus "Use a personal access token"; a script calling start in the frame opens no pop-up and leaves the session `signed-out`. Unit: the adapter's start and result listener do nothing when framed. |
| F-16 | The app shall accept an embed `init` message only in embed mode and only from its parent window. | RK-3; Q-27 | Must | 1 | Playwright: an `init` posted by a rendered-HTML iframe, by another window, or outside `?embed=true` leaves the credential unchanged (T-15). |

### The exchange

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-20 | The exchange shall refuse a callback whose `state` does not match the sign-in it started, before contacting GitHub. | S-19 | Must | 1 | Worker test with a stubbed GitHub: callback with a wrong `state` returns an error result and makes no outbound request (as SP-1 `check.mjs`). |
| F-21 | The exchange shall use PKCE with the S256 method. | S-19 | Must | 1 | Worker test: the authorize redirect has `code_challenge_method=S256`, and the challenge equals the base64url SHA-256 of the verifier sent at exchange. |
| F-22 | The sign-in endpoints shall not permit cross-origin reads. | S-19 | Must | 1 | Worker test: no response carries `Access-Control-Allow-Origin`. Playwright from a second origin: `fetch("https://mardoc.app/api/auth/health")` rejects. |
| F-23 | The exchange shall deliver the access token only to the configured app origin (`https://mardoc.app`). | Derived from S-19, F-14 | Must | 1 | Worker test: the callback result names the app origin as the only recipient, and no response puts the token in a `Location` header, URL or cookie. |
| F-24 | The exchange shall not return, store or log a refresh token. | C-16, S-27 | Must | 1 | Worker test with a stubbed GitHub that returns `refresh_token`: no response body, header or cookie contains it, and no `console` method is called. |
| F-25 | The Worker shall have no refresh route. | S-24 | Must | 1 | Worker test and live probe: `GET` and `POST /api/auth/refresh` return 404. |
| F-26 | The Worker shall keep no state between requests other than the sign-in cookies. | Derived from L0 ("The Worker stores nothing") | Must | 1 | `wrangler.toml` declares no KV, D1, R2, Queue or Durable Object binding (check script). |
| F-28 | Sign-in cookies shall last at most 10 minutes† and be cleared at the callback. | Derived from F-26 | Must | 1 | Worker test: each sign-in cookie has `Max-Age=600` and the callback response sets `Max-Age=0` on it. |
| F-29 | Returning from GitHub's install page shall show a page that tells the user the install worked and to return to MarDoc, without an exchange. | Derived from S-14 | Should | 1 | Worker test: `/callback?installation_id=1&setup_action=install` with no `state` returns that page and makes no outbound request. |
| F-27 | The Worker shall answer a health check at `/api/auth/health`. | Derived from S-26 (Worker down) | Must | 1 | Worker test: `200` with a JSON body containing `"ok": true`; live probe criterion 3. |

### The signed-in session

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-30 | The app shall keep a signed-in access token in memory only. | S-23, S-24, S-25 | Must | 1 | Playwright with a mocked exchange, after sign-in: no value in `localStorage`, `sessionStorage`, IndexedDB, Cache Storage or `document.cookie` contains the token. This is the stage 1 release gate. |
| F-31 | Reloading the tab shall end a signed-in session. | S-23 | Must | 1 | Playwright: after sign-in and reload, the app makes no GitHub request with the old token. |
| F-32 | After a reload ends a signed-in session, the app shall offer Sign in again instead of silently showing demo data. | S-15, S-25 | Must | 1 | Playwright: sign in, reload; a "Sign in again" prompt is visible, and the hash route is kept. |
| F-33 | When the access token reaches its expiry time, the app shall stop using it and prompt the user to sign in again. | S-15, S-25 | Must | 1 | Playwright with a fake clock and a mocked exchange returning `expires_in: 90`: at the computed expiry the prompt appears, and no GitHub request carries the old token. |
| F-34 | A 401 on a signed-in token shall prompt the user to sign in again, not to paste a token. | S-15 | Must | 1 | Playwright with a mocked 401: the message offers "Sign in again" and does not say "Open Settings to re-authenticate". |
| F-35 | Signing in again as the same GitHub login shall keep the hash route, open document and unsaved edits. | S-15 | Must | 1 | Playwright: make the editor dirty, expire the token, sign in again with the mocked exchange; the open file is not re-fetched, and the edit and route are unchanged. |
| F-37 | While a reload's Sign in again prompt is showing, the main pane shall say which document will open after signing in, instead of demo data. | Derived from F-32 | Should | 1 | Playwright: sign in, reload on a file route; the main pane names the file and offers Sign in again and "Continue without signing in". |
| F-38 | "Continue without signing in" shall end the reload prompt and show demo data. | Derived from F-32 | Should | 1 | Playwright: choose it; demo data shows and the next reload shows no prompt. |
| F-36 | Signing in again as a different GitHub login shall clear repository state, as connecting a new token does today. | Derived from F-35 | Should | 1 | Playwright: sign in again as `other`; the repo, file and PR state reset (as `setGithubToken` does at `2b79817`). |

### Installations and access

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-40 | The repository picker shall list only repositories the signed-in token can reach. | S-13 | Must | 1 | Owner demo: with the App installed on one of two private repos, the picker shows the installed repo and not the other. |
| F-41 | Settings shall link to installing MarDoc on more repositories. | S-14 | Must | 1 | Playwright: the link's `href` is `https://github.com/apps/<slug>/installations/new` and opens in a new tab. |
| F-42 | Opening a repository the token cannot reach shall say MarDoc may not be installed there, with the install link and the personal-access-token option. | S-14 | Must | 1 | Playwright with a mocked 404 on a deep-linked repo: the message names the repo and shows both links. |
| F-43 | A repository added to an installation, including after an org owner approves a request, shall appear after the user refreshes the repository list, without signing in again. | S-14; SP-1 criterion 5 (owner-reported) | Must | 1 | Owner demo of the org install request journey ([story](#an-org-member-asks-for-an-install)). |
| F-44 | When a signed-in user's installations cover no repository, the repository list shall say MarDoc isn't installed on any repository they can reach, with the install link, a line to ask a repository owner, and the personal-access-token option. | Derived from S-14, S-12 | Must | 1 | Playwright with a mocked empty `GET /user/installations`: the message and both options show. |

### Personal access token and fallback

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-50 | Connecting with a personal access token shall keep its current behaviour: saved in `localStorage.mardoc_github_token` and restored on reload. | S-17, S-18 | Must | 1 | Every existing e2e spec that seeds `mardoc_github_token` passes unchanged in `npm run ci`. |
| F-51 | When the Worker is unreachable or not routed, Sign in with GitHub shall fail within 5 s† with a message that offers the personal-access-token option. | S-26 | Must | 1 | Playwright with `/api/auth/health` returning a Pages 404, a 503, or a network error: the message and the token form appear within 5 s. |
| F-52 | When sign-in fails at GitHub or at the exchange (consent denied, `state` mismatch, GitHub error), the app shall show what failed and offer the personal-access-token option. | Derived from F-51 | Must | 1 | Playwright with the mocked exchange returning each error code: a distinct message and the token option. |
| F-53 | Signing in with GitHub while a personal access token is saved shall keep the saved token, unused until the sign-in session ends. | S-17; Q-21 | Must | 1 | Playwright: seed `mardoc_github_token`, sign in; requests carry the sign-in token, the key is unchanged, and after Disconnect the PAT is active again. |
| F-55 | While signed in with a saved personal access token, Settings shall say that the token will be used after Disconnect and offer to remove it. | Derived from F-53 (GSI-SEC-7) | Must | 1 | Playwright: seed a PAT, sign in; the view shows the sentence, "Remove saved token" and "Disconnect and remove saved token"; the last leaves no credential. |
| F-54 | The in-app personal-access-token instructions shall match setup-github-pat.md. | Q-15 (ADO-3) | Should | 1 | Reviewer compares the panel text with the guide; `grep -n "read:org" src/components/SettingsPanel.tsx` prints nothing unless the guide lists it. |

### Disconnect

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-60 | Disconnect shall drop the in-memory token and reset the GitHub client and its caches. | S-20 | Must | 1 | Unit test: after Disconnect, `getOctokit()` returns `null` and the caches are empty (as `resetGitHubSession` does at `2b79817`). |
| F-61 | Disconnect shall ask GitHub to revoke the signed-in token. | S-20; Q-22 | Should | 1 | Worker test: a revoke request calls GitHub's revoke endpoint with the client credentials. Owner demo: after Disconnect, `GET /user` with the old token returns 401. |

### Documentation and copy

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-70 | README.md, data-and-security.md and capabilities.md shall say that a MarDoc-run Worker on Cloudflare exchanges sign-in codes and sees GitHub tokens. | S-21, S-28; RK-2 | Must | 1 | Reviewer reads the three files; `grep -l Cloudflare` lists all three. |
| F-73 | data-and-security.md's storage table shall list `mardoc_auth_method`, and known-issues.md shall describe the sign-in 401 path. | Derived from F-32, F-34; REVIEW.md | Must | 1 | `grep -n mardoc_auth_method docs/data-and-security.md` finds the table row; reviewer reads known-issues.md. |
| F-71 | setup-github-pat.md shall remain the guide for the personal-access-token option, linked from Settings. | S-21 | Must | 1 | Playwright: the token option links to the guide; the guide's title is unchanged. |
| F-72 | Settings shall not say that MarDoc has no server. | Q-10 | Must | 1 | `grep -n "there is no server" src/components/SettingsPanel.tsx` prints nothing. |

## Non-functional requirements

| ID | Requirement | Source | Acceptance |
|---|---|---|---|
| NF-10 | **Least privilege.** The GitHub App requests only the permissions MarDoc's features use: Contents read and write, Pull requests read and write, Metadata read (Q-19). | S-13 | Owner demo: the App's permissions page matches this list. |
| NF-11 | **Token never in a URL.** A signed-in token never appears in a URL, the session history or a `Referer` header. | Derived from F-30 | Playwright after sign-in: `location.href`, `history` entries reachable by the app and `performance.getEntries()` names contain no token; Worker test: no response has the token in `Location`. |
| NF-12 | **Short-lived credential.** The app never uses a signed-in token after the expiry time GitHub returned (8 hours, [GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)). | S-23, S-25 | Covered by F-33's test. |
| NF-13 | **Fail mode.** A Worker or Cloudflare failure never affects PAT users, demo mode or document loading. | S-17, S-26 | Playwright with `/api/auth/*` returning 503: the PAT specs and demo-mode specs pass. |
| NF-14 | **No caching.** Every `/api/auth/*` response carries `Cache-Control: no-store`. | Derived from SP-1 criterion 6 | Worker test and live probe. |
| NF-15 | **No credential logging.** The Worker never logs a token, code, verifier or secret. | Derived from RK-2 | Worker test: `console` methods are never called during any route; code review of every log line. |
| NF-16 | **Sign-in latency.** From GitHub's redirect to the callback until the app shows "Signed in", each of five timed sign-ins takes at most 3 s†. | Derived from S-12 | Owner demo: 5 timed sign-ins on the live zone; record each. |
| NF-17 | **Cost.** Sign-in traffic stays under the Free plan's 100,000 requests a day ([Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/)). | C-15 | Owner check of the Worker's request count in the dashboard at each milestone close. |
| NF-18 | **Keyboard.** Sign in, Sign in again, the install link and every sign-in error are reachable by keyboard. | Derived from F-10, F-32 | Playwright keyboard-only run through first sign-in and expiry. |
| NF-22 | **Screen readers.** Every sign-in status change and error is announced. | Derived from F-10, F-32 | Playwright: prompts and errors sit in an `aria-live` region. |
| NF-19 | **Testability.** Every sign-in journey runs in `npm run ci` without GitHub or Cloudflare, through a mocked exchange. | S-22 | `npm run ci` passes with the network to `github.com` and `/api/auth/*` blocked except for mocks. |
| NF-20 | **Browsers.** Sign-in works in the current Chrome, Firefox and Safari on desktop, Safari on iOS and Chrome on Android. | Derived from S-12 | SP-3 matrix, then the owner demo on each browser. |
| NF-21 | **Secret rotation.** The client secret can be rotated by the documented procedure; rotation is yearly and on any suspected compromise. | L0 operating commitment | The runbook exists in the repo; SP-2 records whether two secrets can be live at once. |

## Assumptions

Each assumption is a decision the owner has not made yet. The work follows
the default shown. If an assumption turns out wrong, only the parts named in
"If it is wrong" change.

| ID | Assumption (default) | Link | If it is wrong |
|---|---|---|---|
| A-10 | The callback hands the token to the app window through a sign-in pop-up posting to `window.opener`, and the opener survives the trip through github.com. | Q-8, F-14, F-23, SP-3 | The candidate fallback is a same-origin `BroadcastChannel`. It has no `event.source`, so I-11 falls to the nonce alone and every same-origin context, including rendered-document iframes and other MarDoc tabs, receives the token: RK-1 grows. The fallback needs its own ADR before it is built. |
| A-11 | The production App is named "MarDoc" with the permissions in NF-10, expiring user tokens, "Request user authorization (OAuth) during installation" off and no Setup URL. | Q-19, NF-10 | The install URL slug in F-41 and the permission list in NF-10 change. With the option on, GitHub sends the install tab to the callback with a code and no MarDoc `state`; F-29 then matters more. |
| A-12 | After a reload the app may keep a non-secret marker (`mardoc_auth_method = "github-app"`) to show Sign in again. | Q-20, F-32 | Without a marker, a reload shows the signed-out Settings view; F-32 is dropped. |
| A-13 | Signing in keeps a saved PAT, unused while the sign-in session lasts; at start-up a saved PAT wins over the sign-in marker. | Q-21, F-53 | If the PAT is removed instead, a user whose org has not installed MarDoc loses their only working credential. |
| A-14 | Disconnect revokes the single token, not the whole grant. | Q-22, F-61 | Revoking the grant also ends sign-in on the user's other devices and forces consent again. |
| A-15 | e2e mocks `/api/auth/*` with Playwright routes; local Worker work uses a separate development App with a localhost callback, registered by the owner. | Q-23, NF-19 | Local end-to-end tests need the live zone; NF-19's check changes. |
| A-16 | The repository list for a signed-in token comes from GitHub's "repositories accessible to the user access token" endpoints (`/user/installations`, `/user/installations/{id}/repositories`). | Q-24, F-40 | `fetchUserRepos` keeps `GET /user/repos` if the owner demo shows it is already filtered to installations. |
| A-17 | Worker source lives in `worker/` in this repo, is tested by `npm run ci`, and the owner deploys it with `wrangler deploy` from a tagged commit; nothing deploys it automatically. | Q-25, C-14 | Deployment steps and the runbook change. |
| A-18 | The app warns 10 minutes† before the token expires, with a Sign in again button. | Q-26, F-33 | Users meet expiry without warning; F-33 is unchanged. |
| A-19 | The `init` listener's embed-mode and parent-window checks (the `init` part of ADO-1) are a stage 1 prerequisite (F-16). The rest of ADO-1 stays with SEC-01. | Q-27, F-16 | Stage 1 ships with RK-3 open, which needs the owner's explicit acceptance in risks.md; F-16 is removed. |
| A-20 | The VS Code extension keeps its current `repo`-scoped token and is unchanged by stage 1. | Q-28, F-15 | Extension work joins this milestone. |

## Use-case stories

### First sign-in

**A writer with no GitHub token** wants to review a document in a repository where MarDoc is installed, so that they never have to make a token.

1. They open a shared MarDoc link, then Settings, and click **Sign in with GitHub**.
2. A GitHub window asks them to authorise MarDoc. They approve.
3. The window closes. Settings says "Signed in with GitHub as `<login>`", and the document from the link is open.

**When it goes wrong:** they deny consent; the window closes and Settings says sign-in was cancelled, with the token option.

**Covers:** F-10, F-11, F-12, F-13, F-14, F-17, F-18, F-19, F-20, F-21, F-23, F-24, F-28, F-30, F-40, NF-11, NF-16

### An org member asks for an install

**A designer in an organisation** wants to review a repo of their org, where MarDoc is not installed and they are not an org owner.

1. They sign in. The repo is not in the picker; opening its link says MarDoc may not be installed there, with an install link.
2. On GitHub's install page they choose the org and send a request; GitHub tells the org owners.
3. An org owner approves. The designer clicks Refresh in the repository list; the repo appears, with no new sign-in.

**When it goes wrong:** the owner declines or never answers; the repo never appears, and the message offers the personal-access-token option (which may itself need org approval).

**Covers:** F-29, F-40, F-41, F-42, F-43, F-44, F-52, NF-10

### The token expires mid-review

**A product manager** is commenting on a pull request when their 8-hour token expires.

1. Ten minutes before expiry a banner offers Sign in again.
2. They ignore it. At expiry the app stops sending the token and the banner says sign-in has expired.
3. They click Sign in again. GitHub remembers the authorisation, the window closes by itself, and their unsent comment and place are unchanged.

**When it goes wrong:** they reload instead; the token is gone, the route is kept, and the main pane offers Sign in again (F-32, F-37). Unsaved editor text survives a reload only where drafts already do: Markdown files in repositories, not HTML files or unsent PR comments.

**Covers:** F-31, F-32, F-33, F-34, F-35, F-36, F-37, F-38, NF-12, NF-18, NF-22

### The Worker is down

**A reviewer** clicks Sign in with GitHub while the Worker is broken or unrouted.

1. The app's health check gets a Pages 404, a 5xx or no answer.
2. Within 5 seconds the sign-in window closes and Settings says sign-in is unavailable, and opens the token option with the link to the guide.
3. They paste a fine-grained PAT and work as today.

**When it goes wrong:** the health check passes but the exchange fails; the callback reports the error and the same message appears (F-52).

**Covers:** F-27, F-50, F-51, F-52, F-53, F-54, F-55, F-71, NF-13

### Stage 1 release gate

**The owner** wants proof that stage 1 is safe before it ships.

1. `npm run ci` passes the stage 1 gate tests: no token in storage (F-30), no `/refresh` (F-25), no CORS headers (F-22), no storage bindings (F-26), embed checks (F-15, F-16) and Disconnect (F-60).
2. The live probe and owner demo pass on the production App and Worker.
3. A reviewer reads the changed docs and Settings copy (F-70, F-72, F-73).

**When it goes wrong:** any gate test fails; stage 1 does not ship (L0 proof 3).

**Covers:** F-15, F-16, F-22, F-25, F-26, F-30, F-60, F-70, F-72, F-73

## Conflicts and how the design resolves them

The X-n numbers continue the adoption judgement's X-1 to X-19.

| ID | Conflict | Resolution in the design |
|---|---|---|
| X-20 | #146, "Tokens refresh silently", against S-23, "signs in again after 8 hours or a reload". | Stage 1 has no refresh (C-16, D-1); silent refresh is stage 2 after SEC-01 ([note](#stage-2-note)). |
| X-21 | #146 flow 4, "Store the access token, refresh token and expiry (initially the same storage as today)", against S-25, "no token in storage". | Memory only (F-30), decided at L0 (D-1). |
| X-22 | #146 flow 2, callback at a static `/auth/callback` page, against the Worker route. | The callback is `/api/auth/callback` in the Worker (ADR 0001). |
| X-23 | S-15, "without losing their place", against S-23, the token is lost on reload. | The hand-off keeps the app page loaded (A-10), so expiry recovery keeps state (F-35); a reload keeps the route and drafts but not the token (F-32). |
| X-24 | S-12, "about 2 clicks", against org installs that need an org owner's approval. | Two clicks hold where MarDoc is installed (F-11); org installs follow their own journey (F-43), as L0 proof 2 says. |
| X-25 | S-20, revoke "the grant", against keeping sign-in on the user's other devices. | Default revokes only the token (A-14, Q-22). |
| X-26 | S-18, e2e seeds `mardoc_github_token`, against F-30, no token in storage. | F-30 covers signed-in tokens only; PATs keep their storage (F-50). |
| X-27 | S-19, "lock the worker's CORS to the MarDoc origin", against F-22, no CORS headers at all. | Every caller is same-origin, so sending no CORS headers is the tightest lock; a cross-origin read is refused by the browser. |
| X-28 | Q-11 (accepted) puts the `init` checks in the SEC-01 closure criteria, against F-16, which needs the `init` part before stage 1. | Q-27: only the `init` checks move forward, because a forged `init` can swap a signed-in token; the other ADO-1 listeners stay with SEC-01. The owner decides. |

## Stage 2 note

Stage 2 adds silent refresh: a `/api/auth/refresh` route and a stored
refresh token, so users stay signed in past 8 hours and across reloads. It is
out of scope here (S-27). It waits for the SEC-01 fix, due 2026-11-17 (Q-4),
and its own release gate: L0 proof 3 says browser tests must show that no
script injected through rendered HTML, Markdown or a PR description can read
app storage or get a token from `/api/auth/refresh`, and that a cross-site
fetch to that route is refused. Stage 2 gets its own requirements rows when
it starts; nothing in stage 1 may assume it (C-16).

## Open questions

These change the design if answered differently from the default. Each one
is recorded as an assumption above. Q-8 comes from the L0 and keeps its ID.

| ID | Question | Recommended default | Status |
|---|---|---|---|
| Q-8 | How does the Worker hand the token to the app, and where are `state` and PKCE kept? | Answered by the owner (2026-10-27): accepted the default. The callback page posts the token to the pop-up's opener, with the target origin fixed to `https://mardoc.app` and the attempt's one-time value. The one-time value travels inside `state`; `state` and the PKCE verifier live in one HttpOnly cookie per attempt on `/api/auth`, for 10 minutes†. No refresh token in stage 1. SP-3 checks the opener survives github.com (A-10). | DONE |
| Q-19 | What is the production GitHub App's name, and which permissions does it request? **One-way door:** the name and slug are public, and the install URL appears in docs and the app. | Answered by the owner (2026-10-27): accepted the default. "MarDoc"; Contents read and write, Pull requests read and write, Metadata read; expiring user tokens on; "Request user authorization during installation" off; callback `https://mardoc.app/api/auth/callback`. The owner registers it (A-11). | DONE |
| Q-20 | May the app keep a non-secret marker to offer Sign in again after a reload? | Answered by the owner (2026-10-27): accepted the default. Yes: `mardoc_auth_method = "github-app"`, holding no token (A-12). | DONE |
| Q-21 | What happens to a saved PAT when the user signs in with GitHub? | Answered by the owner (2026-10-27): accepted the default. Keep it, unused while signed in; it becomes active again on Disconnect or after a reload (A-13). | DONE |
| Q-22 | Does Disconnect revoke the token or the whole grant? | Answered by the owner (2026-10-27): accepted the default. The token, through a Worker revoke route (A-14). | DONE |
| Q-23 | How do developers and e2e exercise sign-in without the live zone? | Answered by the owner (2026-10-27): accepted the default. Playwright mocks `/api/auth/*`; a separate development App with a localhost callback for `wrangler dev`, registered by the owner (A-15). | DONE |
| Q-24 | Which GitHub endpoint lists the repositories a signed-in token can reach? | Answered by the owner (2026-10-27): accepted the default. The user-installation endpoints; confirmed in the owner demo (A-16). | DONE |
| Q-25 | Where does the Worker source live, and who deploys it? | Answered by the owner (2026-10-27): accepted the default. `worker/` in this repo, tested in `npm run ci`; the owner deploys from a tagged commit (A-17). | DONE |
| Q-26 | Should the app warn before the token expires? | Answered by the owner (2026-10-27): accepted the default. Yes, 10 minutes† before, with Sign in again (A-18). | DONE |
| Q-27 | Must the `init` listener checks (part of ADO-1, RK-3) ship before stage 1? | Answered by the owner (2026-10-27): accepted the default. Yes, the `init` part only (F-16); otherwise the owner accepts RK-3 for stage 1 in risks.md. This moves part of Q-11's SEC-01 scope forward (X-28, A-19). | DONE |
| Q-28 | Q-17 deferred the VS Code extension's scopes to this L1. Do they change? | Answered by the owner (2026-10-27): accepted the default. No: unchanged in stage 1 and decided with VS Code sign-in, which is out of scope (A-20). | DONE |
| Q-36 | What is the production GitHub App's URL slug, used in the install link (F-41)? | Answered at registration (2026-10-28): the owner registered the App under the `mardoc-app` organisation as "MarDoc.app", so its slug is `mardoc-app` (App ID 5520121, permissions as Q-19). `GITHUB_APP_SLUG` defaults to `mardoc-app`; `NEXT_PUBLIC_GITHUB_APP_SLUG` overrides it for the development App. | DONE |
