# Browser tests (Playwright)

These specs exercise the React application in real browsers and complement unit/component tests in `src/__tests__`. Most flows use built-in demo data or controlled fixtures; they do not prove live GitHub permissions, notifications, or the separate VS Code extension.

## Setup and local execution

Use Node.js 22 and install dependencies and both browser engines:

```bash
npm ci
npx playwright install chromium webkit
npm run e2e
```

The [configuration](../playwright.config.ts) starts `npm run dev` on port 3000 locally and can reuse an existing server there. Ensure that server is serving this checkout. `npm run e2e:ui` opens the interactive runner.

Two projects are configured: `desktop` uses Desktop Chrome at 1280×800; `mobile` uses the iPhone 14 profile with WebKit. Some specs scope or skip scenarios by project. Run one project or spec when iterating:

```bash
npm run e2e -- --project=desktop
npm run e2e -- e2e/critical-flows.spec.ts
```

## Production static export

CI builds first, then the Playwright webServer serves `out/` with `npx --yes serve out -l 3000 --no-clipboard`. It does not use `next start`. To reproduce that server path locally:

```bash
npm run build
CI=1 npm run e2e
```

Keep port 3000 free for this mode. `CI=1` also selects one worker, retries, and CI reporters. On Linux, Playwright's `--with-deps` installation option installs needed system packages, as used by the [test workflow](../.github/workflows/test.yml).

## Coverage map

| Area | Specs / fixtures |
| --- | --- |
| Main workflows | `critical-flows.spec.ts`, `editor-editing.spec.ts`, `pr-review-submission.spec.ts` |
| Navigation and controls | `navigation-routing.spec.ts`, `keyboard-shortcuts.spec.ts`, `toolbar-parity.spec.ts` |
| Rendering and mappings | `rendering-features.spec.ts`, `pr-realistic-markdown.spec.ts`, `line-numbers.spec.ts` |
| Stability | `pr-image-stability.spec.ts`, `pr-mermaid-stability.spec.ts`, `split-view-sync.spec.ts` |
| Images, embedding, filtering | `image-flows.spec.ts`, `embed-mode-clipboard.spec.ts`, `per-file-comments.spec.ts` |
| Shared setup | `fixtures/helpers.ts`, `fixtures/pr-realistic/` |

Prefer shared helpers for hydration, visible sidebar selection, and document/PR navigation. Use observable UI conditions and Playwright assertions for waits. Existing helpers/specs still contain fixed `waitForTimeout` delays; replacing those is follow-up maintenance, not a guarantee already met by the suite.

Keep pure logic tests in Vitest. Use browser fixtures or controlled responses when needed to exercise integration boundaries; distinguish simulated GitHub behavior from actual network verification. Failure screenshots and retry traces are configured. Inspect runner output for their artifact paths.
