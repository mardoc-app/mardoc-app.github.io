# Project guidance

MarDoc: a browser-only, statically exported Next.js app (GitHub Pages, mardoc.app) for reading, reviewing and editing Markdown and HTML documents in GitHub repositories and pull requests. No MarDoc backend; the browser talks to GitHub directly.

## Project map

- `docs/design/mardoc/`: intent, requirements (F/NF/C IDs), design (T-n, traceability), UX and DevX where relevant
- Architecture: start at the as-is system baseline `docs/design/architecture.html` (L1)
- `docs/README.md` is the doc index; process rules live here in AGENTS.md (Q-13)
- `docs/plan.md`: status, milestones, work packages, backlogs; § How work is done
- `docs/adr/`, `docs/spikes/`, `docs/lessons.md`
- `docs/design/`: `architecture.html` (L1), `l2-*.html` (subsystems); diagrams in `docs/assets/diagrams/`, images in `docs/assets/images/`
- `demos/`: owner guides (`mN.md`) and demo evidence
- `REVIEW.md`: the review rubric
- `src/lib/`: domain helpers and GitHub adapters (`github-api.ts`, `rate-limit.ts`, `app-context.tsx`)
- `src/components/`: React UI; `src/app/`: Next.js entry
- `worker/`: the Auth Worker (`mardoc.app/api/auth/*`); `dev/local-auth/`: local harness serving the app and the Worker on one origin (`npm run dev:auth`)
- `src/__tests__/`: Vitest unit and component tests; `e2e/`: Playwright (desktop and mobile)
- `docs/` reference docs (index: `docs/README.md`)
- Slice plans and review reports are working files: keep them on the branch while the work is open and delete them before merge. Durable results go to `docs/plan.md`, ADRs or the design pages

Work follows the SDLC skills and `docs/plan.md` § How work is done. Tests are
named after the requirement IDs they prove (for example,
`f2_domain_rule_matches_subdomains`).

## Commands

| Command | Purpose |
|---|---|
| `npm run ci` | Build, lint, tests, layout check and `sdlc-trace` |
| `npm run check` | Fast check before commits |
| `npm run demo -- {milestone}` | Scripted demo and evidence report for milestone N |

## Verification

- Run the CI command before reporting work complete and include its result.
- If a test fails, fix the implementation rather than weakening the test.
- Keep failing tests in place until the underlying problem is fixed.

## Architecture

Follow the architecture described in
`docs/design/design.md`. Keep domain rules independent of technology
where that separation benefits the system. Add layer or dependency rules only
when the design calls for them, and enforce those rules in CI. Do not assume a
specific architecture pattern by default.

## Lessons

Record a repeated mistake here as one concise rule with its correction.
