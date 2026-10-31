# ADR 0001: Web sign-in via GitHub App and a Worker route on mardoc.app

- **Status:** Accepted (2026-10-21: the owner ran SP-1 on the live zone, reported PASS and accepted it)
- **Date:** 2026-10-20
- **Deciders:** Joe Barnett (owner); lead agent
- **Evidence:** [L0 strategy](../design/github-sign-in/strategy.html);
  L0 review GSI-1..13 and re-review;
  [SP-1](../spikes/sp-1-github-sign-in.md) ([plan.md Gate 0](../plan.md#gate-0-review-and-spikes));
  L1 design: [architecture](../design/github-sign-in/architecture.html), [design.md](../design/github-sign-in/design.md);
  issue [#146](https://github.com/mardoc-app/mardoc-app.github.io/issues/146)

## Context

MarDoc is a static Next.js export on GitHub Pages. Users connect GitHub by
pasting a personal access token, which the app keeps in
`localStorage.mardoc_github_token` (`src/lib/app-context.tsx`). Its readers
include product managers, designers and writers who have never made a token.

GitHub's web flow sends the sign-in code only to the app's registered
callback URL. Exchanging that code for a user token requires the client
secret ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token)).
Users report that the token endpoint sends no CORS headers, and GitHub staff
said in 2025 that CORS support was still to come
([community #15752](https://github.com/orgs/community/discussions/15752)).
So a browser page can't complete the exchange, and a server-side step is
needed.

Cloudflare already proxies `mardoc.app` in front of GitHub Pages (Q-5).

Rendered-content isolation (SEC-01, RK-1) is open and bears on any token the
app holds. Details are kept privately.

## Decision

Web sign-in uses a GitHub App. Its code-for-token exchange runs in a
Cloudflare Worker bound to the route `mardoc.app/api/auth/*`, and GitHub Pages
stays the origin for every other path. Sign-in ships first with the access
token kept in memory and no refresh route. Silent refresh is added only after
SEC-01 is fixed. The PAT option remains.

## Rationale

- **Least privilege:** a GitHub App limits a user token to installed repos and
  the app's permissions, and the token expires after 8 hours ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)). A classic OAuth
  App's `repo` scope covers every private repo the user can reach.
- **Same origin, no new hosting:** a Worker route on the existing Cloudflare
  zone gives the callback the same origin as the app, with no DNS change, no
  hosting move and no new domain.
- **Device flow doesn't help:** it needs no client secret, but GitHub tells
  browser apps to use the web flow, its endpoint reportedly lacks CORS too,
  and users would have to copy a code by hand.
- **Refresh waits for SEC-01:** until SEC-01 is fixed, MarDoc has no refresh
  route. An in-memory 8-hour token with no refresh bounds what any one token
  can reach ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)).

## Consequences

- **Easier:** connecting without making a token; access matches the
  installation; a leaked token expires in 8 hours ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)); the PAT path is unchanged.
- **Harder:**
  - MarDoc operates a credential-handling Worker. Joe Barnett runs it and
    holds the client secret in Worker secrets (Q-7). Nobody else can deploy
    it or rotate the secret (Q-9), and Cloudflare becomes a party in the
    credential path (RK-2).
  - Stage 1 users sign in again after 8 hours or a page reload ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)).
  - On org repos, installing the app may need an org owner's approval.
  - The README's "no MarDoc server" statement changes when sign-in ships.
- **Reverses if:** SP-1 fails the route test, which moves the Worker to
  `auth.mardoc.app`, or the installation test, which reopens the classic OAuth
  App choice. Either outcome supersedes this ADR.
