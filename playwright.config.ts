import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for MarDoc e2e tests.
 *
 * Tests run against a locally-booted Next.js dev server (or the static export
 * in CI). MarDoc is a fully client-side static export, so there's no
 * backend to mock — demo mode provides fixture data for every flow.
 *
 * Two projects are defined so the same test file can run on desktop
 * and mobile viewports without duplication.
 */
const port = process.env.PLAYWRIGHT_PORT || "3000";

/**
 * REAL_WORKER=1 runs only T-32 (e2e/sign-in-real-worker.spec.ts): the real
 * Auth Worker under `wrangler dev` behind dev/local-auth/, GitHub stubbed,
 * serving the built `out/` on one origin. It needs `next build` first and
 * `npm --prefix worker ci`. Projects: real-worker (Chromium) and
 * real-worker-firefox. A harness already running on the port is reused
 * outside CI; the spec refuses one that is not in stub mode.
 */
const realWorker = process.env.REAL_WORKER === "1";
const realWorkerPort = process.env.REAL_WORKER_PORT || "8787";
const realWorkerSpec = /sign-in-real-worker\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  use: {
    baseURL: `http://localhost:${realWorker ? realWorkerPort : port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: realWorker
    ? [
        { name: "real-worker", testMatch: realWorkerSpec, use: { ...devices["Desktop Chrome"] } },
        { name: "real-worker-firefox", testMatch: realWorkerSpec, use: { ...devices["Desktop Firefox"] } },
      ]
    : [
        {
          name: "desktop",
          testIgnore: realWorkerSpec,
          use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
        },
        {
          name: "mobile",
          testIgnore: realWorkerSpec,
          use: { ...devices["iPhone 14"] },
        },
      ],

  webServer: realWorker
    ? {
        command:
          `worker/node_modules/.bin/wrangler dev -c dev/local-auth/wrangler.toml --port ${realWorkerPort}` +
          ` --var STUB_GITHUB:1 --var APP_ORIGIN:http://localhost:${realWorkerPort}`,
        url: `http://localhost:${realWorkerPort}/api/auth/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      }
    : {
        // Locally: `npm run dev` is the fastest path and picks up HMR.
        //
        // In CI: the workflow runs `npx next build` before playwright,
        // producing a fully static export in `out/`. MarDoc uses
        // `output: "export"` in next.config.js, so `next start` is not
        // supported. Serve the static bundle with `serve` instead — it
        // handles client-side hash routing correctly because the shell
        // lives at `out/index.html` and everything else is a hash route.
        command: process.env.CI
          ? `npx --yes serve out -l ${port} --no-clipboard`
          : `npm run dev -- --port ${port}`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
