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

- **Status:** {{STATUS_LINE}}
  <!-- One paragraph: what is DONE or accepted (with dates), what is ⭐, the
  decisions that govern the active milestone (ADR links), which WPs are ready
  to start, and which owner questions are open. -->
- **Last updated:** 2026-10-20

## How work is done

### Development environment

- **Where it runs:** {{DEV_ENVIRONMENT}}
- **Safety:** {{SAFETY_RULES}}
  <!-- e.g. tooling names the target context or account explicitly, and
  touches only this project's resources. -->
- **Toolchain:** {{TOOLCHAIN_AND_PINS}}

### Orchestration and model choice

The lead agent owns the plan, the interfaces between work packages,
integration, and acceptance against requirements. The lead/orchestrator always
uses the strongest supported tier: Claude Opus 5.5 or later, or Codex Astra.
Work packages go to
subagents (`sdlc:orchestrate`), matched to the task:

| Kind of task | Starting tier (Claude / Codex) | Why |
|---|---|---|
| Core logic where a subtle bug is a security or correctness bug: {{CORE_AREAS}} | Frontier: Opus 5.5+ / Astra | Start high where mistakes are costly; adjust to project evidence and task complexity |
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

- **Interfaces first:** {{FROZEN_INTERFACES}} are written and frozen before
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
  it proves, for example `{{TEST_NAME_EXAMPLE}}`. `sdlc-trace` builds the
  requirements report from the test results.
- **Levels:** {{TEST_LEVELS}}
- **Each milestone delivers** `demos/mN.md` (the owner guide) and
  `npm run demo -- {milestone}`, which sets everything up, runs the checks and writes
  `demos/mN-demo-report.md`.

## Gate 0: review and spikes

Gate 0 runs before or alongside the first milestone it blocks. Each item is
time-boxed and ends in a yes or no, plus an ADR where a decision follows.

| ID | Item | Proves | Blocks | Model | Owner review | Status |
|---|---|---|---|---|---|---|
| SP-1 | {{SPIKE_QUESTION}} ([report](spikes/sp-1-{{SLUG}}.md)) | A-1, NF-1 | M1 | Sonnet | — | PENDING |

Add one row per design review (R-n, via `sdlc:review`) and spike (SP-n, via
`sdlc:spike`). For a design review, the Owner review cell starts `PENDING`;
after reading the design and review report, the owner records
`ACCEPTED YYYY-MM-DD`. The Status cell links the review report and gives its
gate result. Product-code commits on a WP branch are blocked until both the
report says `**Design gate:** PASS` and the owner acceptance is recorded.

## Milestones

| Milestone | Delivers | Demo | Requirements | Owner action |
|---|---|---|---|---|
| **M1: {{MILESTONE_NAME}}** | {{WHAT_IT_DELIVERS}} | `npm run demo -- {milestone}`: {{WHAT_THE_DEMO_PROVES}}. Then the owner's acceptance test. | F-1, NF-1 (T-1) | **Acceptance test** (`demos/m1.md`) |

Add one row per milestone, in value order (`craft:value-cadence`). Unscheduled
ideas go in a "Future stages" table under this one.

## M1 work packages

{{FREEZE_NOTE}}
<!-- Which WP freezes the interfaces, and which WPs then run in parallel. -->

| WP | Scope | Paths | Model | Depends on | Proves | Status |
|---|---|---|---|---|---|---|
| WP-1 | {{SCOPE}} | `{{PATHS}}` | Frontier (Opus 5.5+ / Astra) | SP-1 | F-1 (T-1) | PENDING |

Add one row per WP. The last two WPs of a milestone are always "Integration
and demo" (Lead: Opus 5.5+ / Astra) and "Independent review, then fixes"
(Sonnet / Sol 6.1 by default, fresh agent). Use Opus / Astra for a high-risk
review.
Mark WPs that need the owner present with **owner** in the Model cell.

### Waves

- **Wave 1:** WP-1 (interfaces freeze).
- **Wave 2, after WP-1:** {{PARALLEL_WPS}}, each in its own paths.
  Checkpoint **CP-1** reviews WP-1 with a fresh agent.

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
| {{RISK}} | {{MITIGATION}} (RK-1 in [risks.md](risks.md)) |

Add a row per risk that affects the plan; the full register is `docs/risks.md`.

## Metrics

| Milestone | First-pass ci green (slices) | Review rounds / High findings | AT items | Slices reopened | Runtime/model and usage source | Tokens or quota/credits (observed) | Cost (actual / estimated / unavailable) | Full CI/verifier runs and reruns |
|---|---|---|---|---|---|---|---|---|
| M1 | {{N_OF_M}} | {{ROUNDS}} / {{HIGHS}} | {{AT_COUNT}} | {{REOPENED}} | {{RUNTIME_MODEL_SOURCE}} | {{USAGE}} | {{COST_BASIS_AND_AMOUNT}} | {{VERIFIER_RUNS}} |

Add a row after milestone acceptance and `sdlc:efficiency`. Keep observed
spend separate from estimates and quota/credit usage. `sdlc:loop` records it.

## Backlog from the {{REVIEW_ID}} review

Findings from [{{REVIEW_FILE}}](reviews/{{REVIEW_FILE}}) that are deferred.
[ADR {{ADR_NUMBER}}](adr/{{ADR_FILE}}) gives the disposition for each.

| ID | Stage | Item |
|---|---|---|
| R1-1 | 2 | {{DEFERRED_FINDING}} |
| DEBT-1 | 1 | {{SHORTCUT}}. **Reason:** {{WHY_NOW}}. **Follow-up:** {{WHEN_AND_HOW}}. **Impact:** {{COST_IF_LEFT}}. |

Add one section per review (design review R-n, code review WPn). Intentional
shortcuts are DEBT-n rows with reason, follow-up and impact.

## Backlog from M1 acceptance

| ID | Stage | Item |
|---|---|---|
| AT-1 | 1 | {{ISSUE_FROM_OWNER_TEST}} |

Add one section per accepted milestone (`sdlc:acceptance`). When an item is
fixed, start its cell with "Done:" and say how.
