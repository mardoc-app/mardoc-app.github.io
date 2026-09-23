# Development, testing, and deployment

## Local setup

Use Node.js 22, matching the GitHub Actions workflows, and the committed npm lockfile:

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Demo mode needs no credentials or environment variables. GitHub PATs are entered in Settings; `.env.example` documents that no auth environment setup is needed. The repository has no Auth0 integration.

## Production preview

```bash
npm run build
npx --yes serve out -l 3000 --no-clipboard
```

The deployment artifact is `out/`. The current `npm start` script invokes `next start`, which does not serve this `output: "export"` application; use the static server above. The preview command can download `serve` through npx.

`public/CNAME` configures the project's custom domain. For a fork hosted beneath a repository subpath, review `basePath` in `next.config.js` and the custom-domain configuration before building. Do not assume the commented sample path matches your fork.

## Tests and checks

| Command | Purpose |
| --- | --- |
| `npm test` | Vitest; normally interactive/watch mode locally. |
| `npm test -- --run` | One-shot unit/component suite, suitable for local verification. |
| `npm run build` | Verify the static export builds. |
| `npx playwright install chromium webkit` | Install both configured browser engines. |
| `npm run e2e` | Browser tests; starts a dev server locally. |
| `npm run e2e:ui` | Playwright interactive runner. |

[Browser test documentation](../e2e/README.md) covers desktop/mobile projects and production-export execution. Tests in `src/__tests__` cover pure helpers and selected components; E2E specs cover integrated editor/review flows using sample fixtures. Converter-only tests do not establish full TipTap fidelity. Tests marked `it.fails` represent known conversion failures, not repaired behavior.

The `lint` script currently invokes `next lint`, but ESLint configuration/dependencies are not present in this checkout. It is not a configured CI gate. Do not report lint as passed without establishing and running an appropriate setup.

For application changes, run the relevant focused tests, the complete unit suite, and the static build; run affected browser scenarios for UI/integration changes. For documentation-only changes, check source accuracy, links, and diff whitespace. Record actual results rather than asserting that a test count or a historical green run proves the current state.

## CI and publication

[Tests](../.github/workflows/test.yml) run on PRs targeting main, pushes to main, and manual dispatch. The unit job installs dependencies, runs Vitest, and builds. The E2E job depends on the unit job, installs Chromium/WebKit, rebuilds, and runs Playwright. In CI, Playwright serves `out/` using `serve`.

[Deployment](../.github/workflows/deploy.yml) is a separate workflow on pushes to main or manual dispatch. It builds and uploads `out/`, then deploys to GitHub Pages. It does not depend on the Test workflow. Branch protection and required checks are repository settings and cannot be inferred from these files.

## Updating documentation with code

Use the [documentation index](README.md) to find the maintained reference. Update affected capabilities, persistence/network behavior, feature status, and known issues with each behavior change. Feature stories are design records, not a substitute for current references. Do not mark extension integration complete based solely on app-side tests.
