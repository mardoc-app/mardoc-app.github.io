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
  ⭐ The L1 design for sign-in (stage 1) is drafted and in independent review
  (GSI-L1); SP-3 is the shaping spike it adds. Open owner questions: Q-1,
  Q-2, Q-3, Q-5 and Q-8 in [requirements.md](design/mardoc/requirements.md#open-questions),
  and Q-19 to Q-28 in [github-sign-in requirements](design/github-sign-in/requirements.md#open-questions)
  (Q-19 is a one-way door).
- **Last updated:** 2026-10-21

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
| GSI-L1 | L1 design review, GitHub sign-in stage 1: [intent](design/github-sign-in/intent.md), [requirements](design/github-sign-in/requirements.md), [architecture](design/github-sign-in/architecture.html), [design.md](design/github-sign-in/design.md) | The Gate 0 package is accurate, buildable and safe for owner acceptance | M1 (sign-in) work packages | Opus (fresh reviewer + security reviewer) | — | ⭐ In review |
| SP-3 | Shaping proof for Q-8: does `window.opener` survive the pop-up's trip through github.com, so the callback page can post the result to the tab, in current Chrome, Firefox and Safari on desktop, Safari on iOS and Chrome on Android? Also records whether a returning user skips the consent screen. Time-boxed to 1 day | A-10, NF-20 | The sign-in hand-off WP | Sonnet + **owner** (owner deploys the spike route) | — | PENDING: github.com sent no `Cross-Origin-Opener-Policy` header on `/login` or `/login/oauth/authorize` (curl, 2026-10-21) |

Add one row per design review (R-n, via `sdlc:review`) and spike (SP-n, via
`sdlc:spike`). For a design review, the Owner review cell starts `PENDING`;
after reading the design and review report, the owner records
`ACCEPTED YYYY-MM-DD`. The Status cell links the review report and gives its
gate result. Product-code commits on a WP branch are blocked until both the
report says `**Design gate:** PASS` and the owner acceptance is recorded.

## Milestones

| Milestone | Delivers | Demo | Requirements | Owner action |
|---|---|---|---|---|

No milestone is defined yet. The L1 design for sign-in defines M1 after SP-1.
Add one row per milestone, in value order (`craft:value-cadence`). Unscheduled
ideas go in a "Future stages" table under this one.

## M1 work packages

No WPs yet. When the L1 plan defines them, the release gates in L0 proof 3 become WP gates: stage 1 (no GitHub token in browser storage after sign-in, and no refresh route) and stage 2 (after the SEC-01 fix, no injected script can get a token from `/api/auth/refresh`).

| WP | Scope | Paths | Model | Depends on | Proves | Status |
|---|---|---|---|---|---|---|

Add one row per WP. The last two WPs of a milestone are always "Integration
and demo" (Lead: Opus 5.5+ / Astra) and "Independent review, then fixes"
(Sonnet / Sol 6.1 by default, fresh agent). Use Opus / Astra for a high-risk
review.
Mark WPs that need the owner present with **owner** in the Model cell.

### Waves

No waves yet.

Add a wave per set of WPs that can run together, with what it waits for.

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
