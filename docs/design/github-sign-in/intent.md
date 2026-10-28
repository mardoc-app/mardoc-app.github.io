# GitHub sign-in: intent

Level: L1

- **Author:** Joe Barnett
- **Written with:** lead agent (Opus 5.5)
- **Date:** 2026-10-21
- **Status:** Accepted by the owner (2026-10-27), including the six lead-derived decisions below at their defaults. Seeded from issue
  [#146](https://github.com/mardoc-app/mardoc-app.github.io/issues/146), the
  accepted [L0 strategy](strategy.html) (D-1 in
  [plan.md](../../plan.md#decisions)) and the owner's L1 brief of 2026-10-21.

This document says what the owner wants and why, in the owner's words. It
comes before [requirements.md](requirements.md), which turns it into
testable requirements. If this document and the requirements disagree, this
document is corrected first, by the owner.

IDs in this topic start at 10 (S-10, C-10, F-10 and so on), so they never
collide with the placeholder rows of the system template in
`docs/design/mardoc/`. Open questions continue the repo-wide sequence at Q-19.

## Problem

Before a new reviewer can read anything in MarDoc, they have to create a
GitHub personal access token and paste it into Settings
([setup-github-pat.md](../../setup-github-pat.md)). Many of MarDoc's readers
are product managers, designers and writers who have never made one. The
token the app then keeps is often broad and long-lived, and it sits in
`localStorage`, where a script in a rendered HTML document can read it
(SEC-01, [RK-1](../../risks.md)).

## Proposed outcome

A reviewer clicks **Sign in with GitHub**, consents on GitHub, and is back in
MarDoc with access to only the repositories where MarDoc is installed. The
access lasts until GitHub's 8-hour token expires or the tab reloads; then the
reviewer signs in again, without losing the document they were on. The
personal-access-token option still works for anyone who prefers it or whose
sign-in fails.

## Affected users and systems

| Who or what | How it is affected |
|---|---|
| New reviewers on mardoc.app | Connect with a sign-in button instead of making a token. |
| Reviewers in organisations | May need an org owner to approve installing MarDoc on org repositories. |
| Existing PAT users | Keep their saved token and current behaviour. |
| VS Code extension users | Unchanged: the extension keeps passing its own token (out of scope). |
| The MarDoc web app (GitHub Pages) | Gains a sign-in path and an in-memory token; stays a static export. |
| A Cloudflare Worker on `mardoc.app/api/auth/*` | New: exchanges the sign-in code for a token. The owner deploys and operates it. |
| A MarDoc GitHub App | New: registered and owned by the owner; users install it on repositories. |
| GitHub | Unchanged API; issues tokens limited to the App's installations. |

## Constraints

- GitHub Pages stays the origin for the app; the code exchange runs in a
  Cloudflare Worker route on `mardoc.app/api/auth/*`
  ([ADR 0001](../../adr/0001-web-sign-in-github-app-worker-route.md)).
- A GitHub App, not a classic OAuth App (ADR 0001).
- The client secret lives only in Worker secrets (Q-7).
- The owner registers the GitHub App and does every Cloudflare step; agents
  never do ([plan.md § How work is done](../../plan.md#how-work-is-done)).
- Running cost stays on the Workers Free plan (L0 operating commitment).

## Out of scope

- Silent refresh and any stored refresh token (stage 2). It waits for the
  SEC-01 fix and its own release gate; see the note in
  [requirements.md](requirements.md#stage-2-note).
- VS Code extension sign-in (`vscode.authentication`, mardoc-vscode).
- The design of the SEC-01 fix itself.
- Moving hosting off GitHub Pages.
- Removing the PAT option.

## Owner's statements

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
| S-23 | "Stage 1: … The access token is kept in memory only, never stored. The user signs in again after 8 hours or a reload, and the PAT option stays." | L0 release order, approved as D-1 (2026-10-20) |
| S-24 | "Stage 1: after sign-in, browser tests find no GitHub token in `localStorage` or `sessionStorage`, and the Worker has no refresh route." | L0 proof 3, approved as D-1 (2026-10-20) |
| S-25 | "the stage 1 scope, the PAT kept as a fallback, no token in storage, the 8-hour sign-in again" | Owner's L1 brief, 2026-10-21 |
| S-26 | "Journeys: first sign-in, sign-in with an org install request, token expiry, Worker down → PAT" | Owner's L1 brief, 2026-10-21 |
| S-27 | "Stage 2 (refresh) is out of scope apart from a note." | Owner's L1 brief, 2026-10-21 |
| S-28 | "The README, data-and-security.md and capabilities.md must say so." (Cloudflare in the credential path) | L0 § The pieces, approved as D-1 |

## Decisions derived by the lead, accepted by the owner

These came from analysis, not from the owner's words. Each is a default in
[requirements.md](requirements.md) and changes if the owner says no.

| Decision | Where | Default |
|---|---|---|
| A saved PAT stays saved, unused while signed in | F-53, Q-21 | Keep it |
| Disconnect revokes the token, not the whole grant (S-20 says grant) | F-61, Q-22, X-25 | Token |
| A non-secret marker offers Sign in again after a reload | F-32, Q-20 | Yes |
| The `init` listener checks ship before stage 1 | F-16, Q-27, X-28 | Yes, `init` only |
| No sign-in inside the VS Code embed | F-15, A-20 | Not offered |
| Signing in again as another login resets repository state | F-36 | Reset |

## Open questions

The questions this work raises are in
[requirements.md § Open questions](requirements.md#open-questions) (Q-8 and
Q-19 onwards), each with a recommended default.
