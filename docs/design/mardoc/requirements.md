# MarDoc Requirements

This document lists everything MarDoc must do and every constraint
it must respect. Each requirement has an ID that [design.md](design.md)
cites, and the design's traceability matrix maps every ID to the parts of
the design that satisfy it and the test that verifies it. The owner's
problem and outcome are in [intent.md](intent.md).

{{ONE_PARAGRAPH_SUMMARY}}

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
- **Stage** is the first stage (or milestone) that delivers the requirement.
  Stages are defined in [design.md](design.md) and scheduled in
  [plan.md](../../plan.md).
- **Acceptance** is a check that a reviewer can run or observe. A
  requirement without a check is not finished.

The words "shall" and "must" mark obligations, and "should" marks
expectations. Numbers marked † are engineering targets set in this document.
The owner has not stated them, so review them.

## Owner's statements

These are the inputs the requirements come from, kept in the owner's words.
The full list, with sources, is in [intent.md](intent.md#owners-statements).

| Ref | Statement | Source |
|---|---|---|
| S-1 | "{{OWNER_QUOTE}}" | {{SOURCE}} |

Copy each S-n row from intent.md unchanged. Add new statements to intent.md first.

## Constraints

| ID | Constraint | Source | Acceptance |
|---|---|---|---|
| C-1 | MarDoc shall store its data only in {{STORE}}. | S-1 | {{CHECK}}, for example "The schema exists in {{STORE}}. No other store holds application data." |

Add one row per fixed choice: platform, cost, data location, licence, architecture style, tooling.

## Functional requirements

### {{AREA_NAME}}

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-1 | A user shall be able to {{ACTION}}. | S-1 | Must | 1 | `{{COMMAND}}` then `{{QUERY}}` shows {{RESULT}}. |

Add one table per area (for example accounts, billing, reporting), and one
row per obligation. Leave gaps in the numbering between areas (F-1 to F-9,
F-10 to F-19) so each area can grow.

## Non-functional requirements

| ID | Requirement | Source | Acceptance |
|---|---|---|---|
| NF-1 | **{{QUALITY}}.** {{MEASURABLE_STATEMENT}}, for example "A request adds at most 50 ms at p99†." | Derived from F-1 | {{HOW_MEASURED}}, for example "A benchmark with {{LOAD}} on {{ENVIRONMENT}}." |

Add one row per quality: latency, throughput, fail mode, availability,
recovery, footprint, security, privacy, audit, accessibility, testability,
supported platforms. Bold the quality name at the start of each requirement.

## Assumptions

Each assumption is a decision the owner has not made yet. The work follows
the default shown. If an assumption turns out wrong, only the parts named in
"If it is wrong" change.

| ID | Assumption (default) | Link | If it is wrong |
|---|---|---|---|
| A-1 | {{ASSUMPTION}} | Q-1, F-1 | {{WHAT_CHANGES}} |

Add one row per default the work relies on. Each open question Q-n has a matching A-n.

## Use-case stories

Short end-to-end stories that show how the requirements fit together. Each
story names the requirements it exercises, and becomes an acceptance or demo
scenario.

### {{STORY_TITLE}}

**{{ACTOR}}** wants to {{GOAL}}, so that {{BENEFIT}}.

1. {{STEP}}
2. {{STEP}}
3. {{OUTCOME_THE_ACTOR_SEES}}

**When it goes wrong:** {{FAILURE_AND_WHAT_THE_ACTOR_SEES}}

**Covers:** F-1, NF-1

Add one story per main way the product is used. Three to six is usual.

## Conflicts and how the design resolves them

| ID | Conflict | Resolution in the design |
|---|---|---|
| X-1 | S-1, "{{SHORT_QUOTE}}", against S-2, "{{SHORT_QUOTE}}". | {{RESOLUTION}}, citing the C-n, A-n or stage that settles it. |

Add one row per pair of statements or requirements that pull against each other.

## Open questions

These change the design if answered differently from the default. Each one
is recorded as an assumption above.

| ID | Question | Recommended default | Status |
|---|---|---|---|
| Q-1 | Which Node version does local `ci` use? Under Node 26, 65 Vitest tests fail because Node's built-in `localStorage` overrides jsdom's. | Support both versions. `vitest.config.ts` passes `--no-experimental-webstorage`, so `npm run check` is green on Node 22.17 and 26.9 (verified 2026-10-20). GitHub Actions stays on Node 22. | PENDING |
| Q-2 | Should `.github/workflows/test.yml` call `npm run check` / `npm run ci` so there is a single definition? | Yes, in its own small PR. Keep the separate unit and e2e jobs, each calling an npm script. | PENDING |
| Q-3 | How does a user sign in to GitHub without a PAT (#146)? | Spike first. Leading option: a GitHub App with a stateless token-exchange worker. The VS Code extension uses `vscode.authentication` and needs no backend. | PENDING |
| Q-4 | Who fixes the iframe isolation (SEC-01), and by when? Sign-in waits for an owner and a date. | Answered by the owner (2026-10-20): Joe Barnett, due 2026-11-17. | DONE |
| Q-5 | Where does the OAuth exchange run? Checked 2026-10-20: Cloudflare already proxies mardoc.app (NS is Cloudflare, and responses carry both `cf-ray` and `x-github-request-id`). | A Worker route on `mardoc.app/api/auth/*` with GitHub Pages kept as the origin. It is same-origin and needs no DNS or hosting move. Token storage is Q-8. Fully moving to Workers static assets stays optional. | PENDING |
| Q-6 | When must the sign-in direction be decided (L0 `github-sign-in`)? | Answered by the owner (2026-10-20): Decide by 2026-10-27; decided 2026-10-20 as D-1 in plan.md. | DONE |
| Q-7 | Who operates the Auth Worker and holds the GitHub App client secret? | Answered by the owner (2026-10-20): Joe Barnett operates the Worker and holds the client secret in Worker secrets. | DONE |
| Q-8 | How does the Worker hand tokens to the app, and where are `state`, PKCE and the refresh token kept (L1 `github-sign-in`)? | Decide in the L1 design after the spike. Stage 1 keeps the access token in memory only and has no refresh token. The Worker validates `state` and PKCE. Stage 2 adds refresh-token storage only after SEC-01 is fixed (RK-1). | PENDING |
| Q-9 | Who can deploy the Auth Worker or rotate its secret when Joe Barnett is unavailable? | Answered by the owner (2026-10-20): Gap accepted until MarDoc has a second maintainer; the PAT option is the fallback. | DONE |

Add one row per open decision. When the owner answers, set Status to DONE
and write "Answered by the owner (2026-10-20): …" in the default column, then
update the matching A-n and requirements.
