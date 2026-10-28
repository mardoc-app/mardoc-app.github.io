# MarDoc Delivery Plan

This plan turns [requirements.md](design/mardoc/requirements.md) and
[design.md](design/mardoc/design.md), plus `ux.html` and `devx.md` when
relevant, into milestones. Each milestone is one capability stage. It ends
with a demo you can run, a requirements report generated from test results,
and an acceptance test by the owner.

**How to read this document.** Status values are `DONE`, `⭐` (active),
`PARTIAL` and `PENDING`. IDs link to the docs that define them: F-n and NF-n
in requirements.md, T-n in design.md, SP-n in `spikes/`, R-n in `reviews/`,
ADRs in `adr/`. Backlog rows keep the ID of the finding or issue that raised
them. This file carries history: rows are updated, never silently deleted.

- **Status:** No milestone is active. SP-1 passed and is accepted (2026-10-21),
  so [ADR 0001](adr/0001-web-sign-in-github-app-worker-route.md) is Accepted.
  The L1 design for sign-in (stage 1) is ACCEPTED (GSI-L1, 2026-10-27), with
  Q-8 and Q-19 to Q-28 answered at their defaults. M1 (sign-in stage 1) is
  active: ⭐ WP-1 and WP-2 (slice plans accepted by the owner 2026-10-27). ⭐ The Cloudflare hosting L0 (D-2) waits for the owner's
  decision. Open owner questions: Q-1, Q-2, Q-3 and Q-5 in
  [requirements.md](design/mardoc/requirements.md#open-questions), and Q-29 to Q-35.
- **Last updated:** 2026-10-27

## How work is done

### Development environment

- **Where it runs:** the owner's macOS machine. MarDoc is a static export
  (`out/`), and GitHub Actions runs `test.yml` and `deploy.yml`.
- **Safety:** agents never register or change the GitHub App, never touch
  Cloudflare (zone, routes, Workers or secrets) and never push; the owner does
  all three. Agents use only demo data or test repos named in a WP.
- **Toolchain:** Node 22 in CI (`.github/workflows/test.yml`); locally, Node 22
  or 26 both pass `npm run check` (Q-1). npm lockfile, Next 14.2.21,
  Vitest 4.1.2, Playwright 1.59.1.

### Orchestration and model choice

The lead agent owns the plan, the interfaces between work packages,
integration, and acceptance against requirements. The lead/orchestrator always
uses the strongest supported tier: Claude Opus 5.5 or later, or Codex Astra.
Work packages go to
subagents (`sdlc:orchestrate`), matched to the task:

| Kind of task | Starting tier (Claude / Codex) | Why |
|---|---|---|
| Core logic where a subtle bug is a security or correctness bug: GitHub credential handling (`src/lib/app-context.tsx`, `src/lib/github-api.ts`, the Auth Worker) and HTML isolation (SEC-01) | Frontier: Opus 5.5+ / Astra | Start high where mistakes are costly; adjust to project evidence and task complexity |
| Independent design and code review | Balanced: Sonnet / Sol 6.1, a fresh agent with no authoring context | Strong default; raise to Opus / Astra for unusually high-risk or complex changes |
| Well-specified implementation against frozen interfaces | Balanced: Sonnet / Sol 6.1 | Efficient when interfaces and proof are clear |
| Spikes and evidence gathering | Balanced: Sonnet / Sol 6.1 | Hands-on investigation and measured results |
| Routine verification and mechanical checks: link and ID audits, formatting | Fast: Haiku / Luna 6.0, or scripts | Cheap and deterministic; raise to Sonnet / Sol 6.1 when behavior needs interpretation |

These are starting tiers, not fixed assignments. Choose the current supported
model in the tier. Before each delegation, consider task risk, ambiguity,
domain familiarity, the quality of its proof and project eval results. Raise or
lower the delegated tier when that evidence supports it; the lead always stays
on the frontier tier. Record model choices and eval evidence here, and revisit
them when a newer model becomes available or recurring misses show the current
choice is inadequate. Use repo-specific evals to validate changes; vendor
claims and general benchmarks only motivate a trial.

Record model trials here so later plans can reuse the evidence:

| Date | Runtime and model ID | Representative tasks and baseline | Quality, misses/false alarms, repeatability, latency and cost | Decision |
|---|---|---|---|---|
| — | — | — | — | Current defaults |

Rules for every work package:

- **Interfaces first:** the contracts each L1 design names (for sign-in: the `/api/auth/*` routes and the token hand-off, Q-8) are written and frozen before
  dependent packages start, so parallel work can't drift.
- **Separate directories:** parallel agents work in separate paths, in
  worktrees, so their edits never collide.
- **Slice plan first:** no code before `docs/plan/WP-n.md` is accepted.
- **Proof before advancement:** each WP lists increments with pass/fail proof
  points in its slice plan. Prove an important unknown through an isolated
  SP-n before dependent product code; cite existing evidence for proven work.
  The lead inspects each result before releasing the next dependent increment.
- **Owner sessions and execution:** owner decisions may cover several
  increments; execution and evidence inspection remain incremental.
- **Done means tested and documented:** tests pass, `npm run ci` is green
  with its output pasted, docs are updated, review findings are dispositioned.
- **Decisions are recorded:** every design change is an ADR in `docs/adr/`,
  and design.md is updated to match.

### Testing and evidence

- **Tests carry requirement IDs.** A test is named or annotated with the IDs
  it proves, for example `f1_signin_keeps_token_out_of_storage` (F-1 is a placeholder ID until the L1 requirements exist). `sdlc-trace` builds the
  requirements report from the test results.
- **Levels:** Vitest unit and component tests (`src/__tests__/`), Playwright e2e on desktop and mobile (`e2e/`), and the static build.
- **Each milestone delivers** `demos/mN.md` (the owner guide) and
  `npm run demo -- {milestone}`, which sets everything up, runs the checks and writes
  `demos/mN-demo-report.md`.

## Gate 0: review and spikes

Gate 0 runs before or alongside the first milestone it blocks. Each item is
time-boxed and ends in a yes or no, plus an ADR where a decision follows.

| ID | Item | Proves | Blocks | Model | Owner review | Status |
|---|---|---|---|---|---|---|
| GSI | L0 strategy review, GitHub web sign-in ([report](reviews/2026-10-20-github-sign-in-l0.md)) | L0 `github-sign-in` is safe for an owner decision | D-1 | Sonnet (fresh agent) | ACCEPTED 2026-10-20 (direction plus spike only) | DONE: 13 findings fixed or closed, re-reviewed |
| R-1 | Baseline: system as-is at `2b94d90` ([page](design/mardoc/architecture.html), [review](reviews/2026-10-20-as-is-baselines.md)) | Type `baseline`: accurate description of the code at the SHA, not an endorsed design | L2 pages and the designed system L1 | Sonnet (fresh agent) fact-check | ACCEPTED 2026-10-21 (accurate as-is, not an endorsed design) | DONE: re-review 2026-10-21 accepted it as a baseline; the residues were closed by the lead afterwards |
| R-2 | Baseline: GitHub connection and credentials as-is at `2b94d90` ([page](design/github-connection/architecture.html), [review](reviews/2026-10-20-as-is-baselines.md)) | Type `baseline`: accurate description of the code at the SHA, not an endorsed design | L1 `github-sign-in` (parent for its L2 pages) | Sonnet (fresh agent) fact-check | ACCEPTED 2026-10-21 (accurate as-is, not an endorsed design) | DONE: re-review 2026-10-21 accepted it as a baseline; the residues were closed by the lead afterwards |
| SP-1 | Reversing proof for L0 proofs 1 and 2: does a sign-in round trip through `mardoc.app/api/auth/callback` work on the live zone with Pages serving every other path, and does a user token reach only repos where the test app is installed (including a non-owner org install)? Time-boxed to 2 days. Report: [sp-1-github-sign-in.md](spikes/sp-1-github-sign-in.md) | ADR 0001; L0 proofs 1 and 2 | L1 `github-sign-in` | Sonnet + **owner** (owner registers the test GitHub App and sets up the Cloudflare route) | ACCEPTED 2026-10-21 (owner reports PASS) | DONE: the owner ran the runbook on the live zone and reports PASS. ⭐ Owner: paste the probe output and callback JSON into the report's Results |
| SP-2 | Can two GitHub App client secrets be live at once, so the secret can be rotated without downtime? Same Worker, runbook step 7. Report: [sp-2-client-secret-rotation.md](spikes/sp-2-client-secret-rotation.md) | L0 operating commitment (secret rotation) | Nothing; informs the rotation procedure | Sonnet + **owner** (owner generates secret B) | — | ⭐ Built with SP-1; waiting for the owner to deploy |
| GSI-L1 | L1 design review, GitHub sign-in stage 1: [intent](design/github-sign-in/intent.md), [requirements](design/github-sign-in/requirements.md), [architecture](design/github-sign-in/architecture.html), [design.md](design/github-sign-in/design.md) | The Gate 0 package is accurate, buildable and safe for owner acceptance | M1 (sign-in) work packages | Opus (fresh reviewer + security reviewer) | — | DONE: reviewed and re-reviewed ([design](reviews/2026-10-21-github-sign-in-l1.md), [security](reviews/2026-10-21-github-sign-in-l1-security.md)); 0 High; every finding fixed, including the re-reviews' new ones. ACCEPTED 2026-10-27 by the owner, with intent.md and Q-8, Q-19 to Q-28 at their defaults |
| SP-3 | Shaping proof for Q-8: does the real callback page, served by the product Worker module through the live zone, post the result to the tab that opened the pop-up, in current Chrome, Firefox and Safari on desktop, Safari on iOS and Chrome on Android? Run with a signed-in GitHub account and the production App settings (A-11), and record the zone's HTML-rewriting settings. Also records whether a returning user skips the consent screen, and whether `GET /user/repos` is already limited to installations for a user token (A-16). Time-boxed to 1 day; runs before the hand-off work package | A-10, A-16, NF-20 | The sign-in hand-off WP | Sonnet + **owner** (owner deploys the spike Worker) | — | ⭐ Built ([report and runbook](spikes/sp-3-callback-opener.md)); waiting for the owner to register the production App and deploy the spike Worker. Earlier evidence: github.com sent no `Cross-Origin-Opener-Policy` header (2026-10-21); zone settings read 2026-10-27 |
| SP-4 | Reversing proof 1 for D-2: does a staging Site Worker on a route at `next.mardoc.app` serve the same site as GitHub Pages (files, URL behaviour table, e2e), with `/api/auth/*` reaching the test-App Auth Worker and a Site Worker request count of 0 after 500 unknown-path requests? Half a day | D-2 proof 1 | D-2 GO | Sonnet + **owner** (DNS record, Workers, routes) | — | PENDING: waits for the owner to approve running it |
| SP-5 | Reversing proof 2 for D-2: does a dashboard-only route move `mardoc.app/demo*`, then `mardoc.app/*`, to the Site Worker and back, with the deleted route surviving a later `wrangler deploy`? Half a day; after SP-4 | D-2 proof 2 | D-2 GO | Sonnet + **owner** (routes, a redeploy) | — | PENDING: after SP-4 |

Add one row per design review (R-n, via `sdlc:review`) and spike (SP-n, via
`sdlc:spike`). For a design review, the Owner review cell starts `PENDING`;
after reading the design and review report, the owner records
`ACCEPTED YYYY-MM-DD`. The Status cell links the review report and gives its
gate result. Product-code commits on a WP branch are blocked until both the
report says `**Design gate:** PASS` and the owner acceptance is recorded.

## Milestones

| Milestone | Delivers | Demo | Requirements | Owner action |
|---|---|---|---|---|
| M1 | Sign in with GitHub, stage 1: a pop-up sign-in with a memory-only token, sign in again after 8 hours or a reload, the PAT kept as a fallback, and the embed `init` checks | `npm run demo -- m1`: every sign-in journey with GitHub mocked, and one run of the real Worker under `wrangler dev` (T-32). Then Part B on mardoc.app with the production App (T-25, T-26) | Stage 1 rows of [github-sign-in requirements](design/github-sign-in/requirements.md): F-10 to F-73, NF-10 to NF-22, C-10 to C-17 (T-10 to T-33) | Register the development App (A-15) and the production App (Q-19); deploy the Auth Worker from a tag, set its secret and route; run SP-3; accept the demo |

The value order is the L1's: stage 1 is the smallest release that removes the
PAT step for new reviewers (S-12, S-25). Stage 2 (silent refresh) is not a
milestone yet; it waits for the SEC-01 fix (ADR 0001). The Cloudflare hosting
move (D-2) is independent of M1 and not part of it.

## M1 work packages

The stage 1 release gate from L0 proof 3 is a WP-8 gate: after sign-in no
GitHub token is in `localStorage`, `sessionStorage` or a readable cookie
(T-10), and the Worker has no refresh route (T-21).

| WP | Scope | Paths | Model | Depends on | Proves | Status |
|---|---|---|---|---|---|---|
| WP-1 | Build prerequisites and frozen contracts: the `worker/` project with its own package and tsconfig, the layout check in `npm run ci`, and the shared sign-in contract and auth types ([slice plan](plan/WP-1.md)) | `worker/` (scaffold), `src/lib/auth/contract.ts`, `src/lib/auth/types.ts`, `scripts/check-layout.mjs`, `tsconfig.json`, `vitest.config.ts`, `package.json`, `.github/workflows/test.yml`, `.gitignore` | Sonnet; the lead reviews the dependency list | — | LR-10, LR-11 (T-30); contract tests | DONE: merged 6036a2a; contracts frozen at the wave 1 checkpoint (57bf8fa) |
| WP-2 | Embed `init` accepted only in embed mode and only from the parent window ([slice plan](plan/WP-2.md)) | `src/lib/embed-init.ts`, the `init` listener in `src/lib/app-context.tsx`, `e2e/embed-init.spec.ts` | Opus (credential handling) | — | F-16 (T-15); closes RK-3 for stage 1 | PARTIAL: merged; increments 1–2 PASS; the owner\'s VS Code check (increment 3) is open |
| WP-3 | Auth Worker: health, login, callback, revoke and install-return routes; the callback check order; the callback page ([slice plan](plan/WP-3.md)) | `worker/src/**`, `worker/test/**` | Opus (credential handling) | WP-1 | F-20 to F-29, F-61, I-12, I-13, I-16, I-17, NF-14, NF-15, C-13, C-16 (T-20 to T-23, T-27) | DONE: merged; 80 Worker tests; ran under local workerd. Interpretations Q-1..Q-5 in the builder report accepted at their defaults (callback URL from `APP_ORIGIN`) |
| WP-4 | App auth state: the session machine, the sign-in credential beside the PAT, session key gating, expiry and 401 handling in the GitHub client ([slice plan](plan/WP-4.md)) | `src/lib/auth/session.ts`, `src/lib/auth/credential.ts`, `src/lib/github-api.ts`, `src/lib/rate-limit.ts`, auth parts of `src/lib/app-context.tsx` and `src/components/SettingsPanel.tsx` | Opus (credential handling) | WP-1; WP-2 (same file) | F-30 to F-36, F-50, F-53, F-60, I-14, I-15, NF-12 (T-13 state, T-14, T-19, T-24) | DONE: merged; 64 new unit and component tests; full e2e passes apart from M1-1 and M1-2. DEBT-1 (a missing pending token is skipped silently) moves to WP-5 |
| WP-5 | Pop-up hand-off: start, nonce, result listener with origin, source and nonce checks, timeouts and failure codes ([slice plan](plan/WP-5.md)); merge waits for SP-3 | `src/lib/auth/sign-in-window.ts` | Opus (credential handling) | WP-3, WP-4, SP-3 | F-11, F-12, F-14, F-51, F-52, I-11 (T-12, T-17, T-18 codes) | ⭐ building with mocks; merge waits for SP-3 |
| WP-6 | Settings screen and sign-in banner ([slice plan](plan/WP-6.md)) | `src/components/SettingsPanel.tsx`, `src/components/SignInBanner.tsx`, `e2e/sign-in-ui.spec.ts` | Sonnet | WP-4; the `startSignIn` signature frozen in WP-1 | F-10, F-13, F-15, F-17, F-18, F-32, F-33, F-37, F-38, F-41 to F-44, F-54, F-55, F-71, F-72, NF-13, NF-18, NF-22 (T-16, T-18 UI) | DONE: merged; e2e for reachable states plus component tests for live-session states. DEBT: F-42 detected from the error text (M1-3); live-session Playwright cases follow in WP-8 (M1-4) |
| WP-7 | Docs: README, data-and-security, capabilities, the PAT guide, known issues | `README.md`, `docs/data-and-security.md`, `docs/capabilities.md`, `docs/setup-github-pat.md`, `docs/known-issues.md` | Sonnet | WP-6 (final copy) | F-70 to F-73 (T-28, T-33) | DONE: merged. Open for WP-9: confirm TOOL-01 in known-issues.md is closed by WP-6, and move the docs\' "reviewed against" headers at M1 close |
| WP-8 | Integration and demo: sign-in e2e with mocks, the real Worker under `wrangler dev`, the stage 1 gate, local real sign-in with the development App, `demos/m1.md` and the owner's production runbook ([slice plan](plan/WP-8.md)) | `dev/local-auth/`, `e2e/sign-in-*.spec.ts`, `scripts/demo.sh`, `demos/m1.md`, `worker/README.md`, `package.json` | Lead: Opus | WP-1 to WP-7 | T-10, T-11, T-31, T-32; runbook for T-25, T-26, T-29 | PENDING |
| WP-9 | Independent code review and security review, then fixes | per findings | Opus for both reviews (high risk), fresh agents | WP-8 | Review reports in `docs/reviews/` | PENDING |

Owner steps inside M1: register the development App with a localhost
callback before WP-8 (A-15); register the production App (Q-19) and deploy
WP-3's Worker from a tag before SP-3; deploy the release after WP-9.

### Waves

| Wave | WPs | Waits for | Checkpoint |
|---|---|---|---|
| 1 | WP-1, WP-2 (disjoint paths) | Owner acceptance of both slice plans | Fresh-agent review of WP-1's frozen contract and types before wave 2 |
| 2 | WP-3, WP-4 (`worker/`; `src/lib/auth/` with `github-api.ts`) | WP-1 merged; WP-4 also waits for WP-2 | The lead checks both against the contract tests |
| Gate | SP-3 on the live zone | WP-3 merged; the owner deploys it with the production App | SP-3 report inspected; a `BroadcastChannel` fallback needs an ADR (A-10) |
| 3 | WP-5, WP-6 (separate files); WP-7 after WP-6's copy | SP-3 PASS for WP-5; WP-4 for WP-6 | — |
| 4 | WP-8, then WP-9 | Waves 1 to 3 | Owner demo and acceptance after WP-9 |

## Acceptance protocol

A milestone is accepted when:

1. `npm run ci` is green and `sdlc-trace` shows every requirement in the
   milestone as passing.
2. `npm run demo -- {milestone}` passes, and `demos/mN-demo-report.md` shows PASS for
   every check.
3. The owner follows `demos/mN.md` by hand, and records "accepted", or the
   issues found, in that file.

The lead agent stops after step 2 and hands over to the owner for step 3. The
next milestone does not start without the owner's go-ahead.

## Risks being tracked

| Risk | Mitigation |
|---|---|
| Document scripts can read or mint GitHub tokens while rendered HTML is same-origin (SEC-01) | Sign-in ships without refresh; refresh waits for the SEC-01 fix, owned by Joe Barnett and due 2026-11-17 (RK-1 in [risks.md](risks.md)) |
| Tokens pass through a Worker on Cloudflare | Stateless Worker, single deployer with 2FA, secret only in Worker secrets (RK-2 in [risks.md](risks.md)) |

Add a row per risk that affects the plan; the full register is `docs/risks.md`.

## Metrics

| Milestone | First-pass ci green (slices) | Review rounds / High findings | AT items | Slices reopened | Runtime/model and usage source | Tokens or quota/credits (observed) | Cost (actual / estimated / unavailable) | Full CI/verifier runs and reruns |
|---|---|---|---|---|---|---|---|---|

No milestone is accepted yet. Add a row after milestone acceptance and `sdlc:efficiency`. Keep observed
spend separate from estimates and quota/credit usage. `sdlc:loop` records it.

## Backlog from M1

| ID | Item | Evidence | Status |
|---|---|---|---|
| M1-1 | `e2e/image-flows.spec.ts` fails on `main`, a different test each run. Its tests insert `https://example.com/*.png`, which answers 404, and the suite runs serially, so one failure skips the rest. Serving the images through `page.route` fixed the original pair but other tests in the file still failed intermittently | Fails on baseline `829e628` (WP-1 builder, 2026-10-28); three local runs with a routed image, 2026-10-28 | PENDING |
| M1-2 | Mobile e2e `branch-links.spec.ts:229` (and once `html-comment-jumps.spec.ts:243`) fails intermittently | `branch-links:229` failed 1 of 12 and 4 of 24 runs on `5a4857f`, before WP-4 (WP-4 builder, 2026-10-28) | PENDING |
| M1-3 | F-42's notice is detected from the error text ("not found") with a sign-in session key. The app context should expose a structured not-found state | WP-6 builder, 2026-10-28 | PENDING |
| M1-4 | Settings states that need a live session are covered by component tests with a faked context; add Playwright cases with WP-5's `e2e/fixtures/auth-mocks.ts` in WP-8 | WP-6 builder, 2026-10-28 | PENDING |

## Backlog from the GSI review

Every finding in [2026-10-20-github-sign-in-l0.md](reviews/2026-10-20-github-sign-in-l0.md)
was fixed in the L0 page. None is deferred.

Add one section per review (design review R-n, code review WPn). Intentional
shortcuts are DEBT-n rows with reason, follow-up and impact.

## Backlog from adoption

Code and story changes that follow owner decisions on the [adoption map](adoption/map.md#decisions-raised) (answered 2026-10-21).

| ID | Stage | Item |
|---|---|---|
| ADO-1 | SEC-01 | Q-11: add origin and source checks plus an embed-mode gate to the `init`, `file:content`, `theme:change` and image-bridge listeners; add them to the SEC-01 closure criteria with a browser test (RK-3). |
| ADO-2 | Sign-in L1 | Q-10: replace the Settings copy "Your token never leaves your browser… there is no server" (SettingsPanel.tsx:252) with the data-and-security.md wording. |
| ADO-3 | Sign-in L1 | Q-15: align the in-app PAT scope guidance (SettingsPanel.tsx:209-222) with setup-github-pat.md. |
| ADO-4 | Sign-in L1 | Q-17: decide the VS Code extension's requested scopes. |
| ADO-5 | When 037 is picked up | Q-18: change story 037 to memory-only AI keys, following feedback-ai.ts. |

## Decisions

Owner decisions on L0 strategies and other direction-level choices. The design
pages link here; gate status lives only in this file.

| ID | Decision | Date | Owner | Status | Scope of approval | Links |
|---|---|---|---|---|---|---|
| D-1 | GitHub web sign-in uses a GitHub App with a Worker route on `mardoc.app/api/auth/*`. Sign-in ships first without refresh; silent refresh follows the SEC-01 fix. | 2026-10-20 | Joe Barnett | GO | Direction plus SP-1 only, not build. Defaults taken: Q-4 (SEC-01 → Joe Barnett, due 2026-11-17), Q-6 (decide by 2026-10-27), Q-7 (Joe Barnett operates the Worker and holds the secret), Q-9 (backup-operator gap accepted). The owner registers the GitHub App and configures Cloudflare. | [L0](design/github-sign-in/strategy.html), [ADR 0001](adr/0001-web-sign-in-github-app-worker-route.md), [review](reviews/2026-10-20-github-sign-in-l0.md), SP-1 |
| D-2 | Serve mardoc.app's files from a code-free Cloudflare Site Worker; sign-in stays in the Auth Worker; the owner deploys both; dashboard-only routes cut over and roll back; GitHub Pages keeps deploying until the clean-up gate. Amends ADR 0001 if approved. | 2026-10-23 | Joe Barnett | IN REVIEW | Direction plus SP-4 and SP-5 only, not build. Defaults proposed: Q-29 to Q-35, RK-4. The owner does every Cloudflare and GitHub step. | [L0](design/cloudflare-hosting/strategy.html), [review](reviews/2026-10-23-cloudflare-hosting-l0.md) |
