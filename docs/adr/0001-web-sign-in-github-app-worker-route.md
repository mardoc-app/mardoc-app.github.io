# ADR 0001: Web sign-in via GitHub App and a Worker route on mardoc.app

- **Status:** Accepted (2026-10-21: the owner ran SP-1 on the live zone, reported PASS and accepted it)
- **Date:** 2026-10-20
- **Deciders:** Joe Barnett (owner); lead agent
- **Evidence:** [L0 strategy](../design/l0-github-sign-in.html);
  L0 review GSI-1..13 and re-review;
  SP-1 ([plan.md Gate 0](../plan.md#gate-0-review-and-spikes));
  L1 design: [architecture](../design/l1-github-sign-in.html), [design.md](../design/github-sign-in-design.md);
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

## Decision

Web sign-in uses a GitHub App. Its code-for-token exchange runs in a
Cloudflare Worker bound to the route `mardoc.app/api/auth/*`, and GitHub Pages
stays the origin for every other path. Sign-in ships first with the access
token kept in memory and no refresh route. Silent refresh is a later stage. The PAT option remains.

## Rationale

- **Least privilege:** a GitHub App limits a user token to installed repos and
  the app's permissions, and the token expires after 8 hours ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)). A classic OAuth
  App's `repo` scope covers every private repo the user can reach.
- **One origin, no new hosting:** a Worker route on the existing Cloudflare
  zone serves the callback from the app's own origin, with no DNS change, no
  hosting move and no new domain.
- **Device flow doesn't help:** it needs no client secret, but GitHub tells
  browser apps to use the web flow, its endpoint reportedly lacks CORS too,
  and users would have to copy a code by hand.

## Consequences

- **Easier:** connecting without making a token; access matches the
  installation; a token expires in 8 hours ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)); the PAT path is unchanged.
- **Harder:**
  - MarDoc operates a credential-handling Worker. Joe Barnett runs it and
    holds the client secret in Worker secrets (Q-7). Nobody else can deploy
    it or rotate the secret (Q-9).
  - Stage 1 users sign in again after 8 hours or a page reload ([GitHub docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)).
  - On org repos, installing the app may need an org owner's approval.
  - The README's "no MarDoc server" statement changes when sign-in ships.
- **Reverses if:** SP-1 fails the route test, which moves the Worker to
  `auth.mardoc.app`, or the installation test, which reopens the classic OAuth
  App choice. Either outcome supersedes this ADR.
