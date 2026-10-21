# Project guidance

MarDoc: a browser-only, statically exported Next.js app (GitHub Pages, mardoc.app) for reading, reviewing and editing Markdown and HTML documents in GitHub repositories and pull requests. No MarDoc backend; the browser talks to GitHub directly.

## Project map

- `docs/design/mardoc/`: intent, requirements (F/NF/C IDs), design (T-n, traceability), UX and DevX where relevant
- `docs/plan.md`: status, milestones, work packages, backlogs; § How work is done
- `docs/adr/`, `docs/spikes/`, `docs/reviews/`, `docs/risks.md`, `docs/lessons.md`
- `demos/`: owner guides (`mN.md`) and demo evidence
- `REVIEW.md`: the review rubric
- `src/lib/`: domain helpers and GitHub adapters (`github-api.ts`, `rate-limit.ts`, `app-context.tsx`)
- `src/components/`: React UI; `src/app/`: Next.js entry
- `src/__tests__/`: Vitest unit and component tests; `e2e/`: Playwright (desktop and mobile)
- `docs/` reference docs (index: `docs/README.md`); `docs/features/`: feature stories

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
`docs/design/mardoc/design.md`. Keep domain rules independent of technology
where that separation benefits the system. Add layer or dependency rules only
when the design calls for them, and enforce those rules in CI. Do not assume a
specific architecture pattern by default.

## Lessons

Record a repeated mistake here as one concise rule with its correction.
