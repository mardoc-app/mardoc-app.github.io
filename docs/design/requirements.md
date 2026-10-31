# MarDoc Requirements

System-level requirements for MarDoc. Each requirement has an ID that tests and the plan cite. Sign-in requirements are in [github-sign-in/requirements.md](github-sign-in/requirements.md); the delivery plan is [plan.md](../plan.md).

**Priority:** Must means the product is wrong without it; Should can wait for a later stage. **Acceptance** is a check a reviewer can run or observe.

## Functional requirements

### Repository browsing and links (M2)

Sources are GitHub issues; the owner's words are quoted on the L2 pages ([repository browsing](l2-repo-browsing.html), [links and routing](l2-links-routing.html)).

| ID | Requirement | Source | Priority | Stage | Acceptance |
|---|---|---|---|---|---|
| F-80 | Opening a repository with no file selected shall show only top-level tree entries. | #151 | Must | M2 | e2e: open `#/o/r`; no folder row is expanded. |
| F-81 | Opening a file, by click or link, shall expand only its ancestor folders, highlight it and scroll it into view. | #151 | Must | M2 | e2e: open `#/o/r/blob/b/a/b/c.md`; only `a` and `a/b` are expanded and `c.md` is highlighted and visible. |
| F-82 | Folder open and closed state shall persist per repository and branch across file opens and reloads. | #151 | Must | M2 | e2e: expand a folder, open another file, reload; the folder is still expanded. |
| F-83 | The Files header shall offer "Collapse all". | #151, Q-RB-2 | Should | M2 | e2e: click it; no folder row is expanded. |
| F-84 | A PR file link shall name the file by path (`#/o/r/pull/N/file/<path>`), and the app shall write that form. | #142 | Must | M2 | Unit: `parseHash`/`buildRoute` round-trip paths with spaces and `%`. e2e: a cold load of a path link opens that file after the PR files load. |
| F-85 | A legacy index link (`/pull/N/files/<idx>`) shall still open the file at that index. | #142 | Must | M2 | e2e: a cold load of `/files/1` opens the second file; the address bar then shows the path form. |
| F-86 | A link's `mode` shall open the file in that view when the file and screen can show it. | #143, Q-RT-1, Q-RT-2 | Must | M2 | e2e: `?mode=preview` (Markdown) and `?mode=base` (HTML) open in those views. |
| F-87 | Copy link shall include the current view mode. | #143 | Must | M2 | e2e: switch to split, Copy link; the copied URL ends in `?mode=split`. |
| F-88 | The view mode a user picks shall be remembered per file kind and used for the next file: link mode first, then remembered, then the default. Opening a link shall not change the remembered mode. | #144, Q-RT-3, Q-RT-4 | Must | M2 | Unit: `pickMode` precedence table. e2e: pick preview, open another Markdown file; it opens in preview. |
| F-89 | An unknown or unavailable mode shall fall back to the next rule without an error. | #143 | Must | M2 | Unit: `pickMode` with `split` unavailable returns the fallback. e2e: `?mode=split` on a 390 px screen opens inline. |
| NF-80 | Routing, view-mode and tree-expansion rules shall be pure modules, checked in CI (LR-12). | Derived from F-80 to F-89 | Must | M2 | `npm run ci` fails if a listed module imports a banned global. |

## Open questions

These change the design if answered differently from the default.

| ID | Question | Recommended default | Status |
|---|---|---|---|
| Q-1 | Which Node version does local `ci` use? Under Node 26, 65 Vitest tests fail because Node's built-in `localStorage` overrides jsdom's. | Support both versions. `vitest.config.ts` passes `--no-experimental-webstorage`, so `npm run check` is green on Node 22.17 and 26.9 (verified 2026-10-20). GitHub Actions stays on Node 22. | PENDING |
| Q-2 | Should `.github/workflows/test.yml` call `npm run check` / `npm run ci` so there is a single definition? | Yes, in its own small PR. Keep the separate unit and e2e jobs, each calling an npm script. | PENDING |
| Q-3 | How does a user sign in to GitHub without a PAT (#146)? | Spike first. Leading option: a GitHub App with a stateless token-exchange worker. The VS Code extension uses `vscode.authentication` and needs no backend. | PENDING |
| Q-5 | Where does the OAuth exchange run? Checked 2026-10-20: Cloudflare already proxies mardoc.app (NS is Cloudflare, and responses carry both `cf-ray` and `x-github-request-id`). | A Worker route on `mardoc.app/api/auth/*` with GitHub Pages kept as the origin. It serves the app's own origin and needs no DNS or hosting move. Token storage is Q-8. Fully moving to Workers static assets stays optional. | PENDING |
| Q-6 | When must the sign-in direction be decided (L0 `github-sign-in`)? | Answered by the owner (2026-10-20): Decide by 2026-10-27; decided 2026-10-20 as D-1 in plan.md. | DONE |
| Q-7 | Who operates the Auth Worker and holds the GitHub App client secret? | Answered by the owner (2026-10-20): Joe Barnett operates the Worker and holds the client secret in Worker secrets. | DONE |
| Q-8 | How does the Worker hand tokens to the app, and where are `state`, PKCE and the refresh token kept (L1 `github-sign-in`)? | Answered by the owner (2026-10-27): accepted the default. Default proposed in [github-sign-in requirements](github-sign-in/requirements.md#open-questions): a pop-up posts the result to its opener, checked by SP-3. Decide in the L1 design after the spike. Stage 1 keeps the access token in memory only and has no refresh token. The Worker validates `state` and PKCE. Stage 2 adds refresh-token storage. | DONE |
| Q-9 | Who can deploy the Auth Worker or rotate its secret when Joe Barnett is unavailable? | Answered by the owner (2026-10-20): Gap accepted until MarDoc has a second maintainer; the PAT option is the fallback. | DONE |
| Q-10 | Settings says "Your token never leaves your browser… there is no server" (SettingsPanel.tsx:252); data-and-security.md:9 says that is inaccurate. Which wording ships? | Answered by the owner (2026-10-21): accepted the default. Use the data-and-security.md wording in the next change to SettingsPanel. (X-4) | DONE |
| Q-12 | Which doc is the architecture authority: AGENTS.md:37 points to the unfilled design.md, while docs/architecture.md holds the content. | Answered by the owner (2026-10-21): accepted the default. The as-is system baseline is the L1 entry point; docs/architecture.md stays the technical record until a designed L1 supersedes it. | DONE |
| Q-13 | Where do documentation rules live: docs/README.md:18-24 or AGENTS.md? | Answered by the owner (2026-10-21): accepted the default. docs/README.md stays the doc index; process rules live in AGENTS.md, which links the index. | DONE |
| Q-14 | Which register owns product gaps? | Answered by the owner (2026-10-21): accepted the default. known-issues.md for product gaps (user-facing). Closed entries are marked, not deleted. | DONE |
| Q-15 | In-app PAT scopes (`repo` + `read:org`) differ from setup-github-pat.md. Which is right? | Answered by the owner (2026-10-21): accepted the default. The guide. Align the UI when Settings changes for sign-in. (X-5) | DONE |
| Q-16 | Two stories use ID 039. Which keeps it? | Answered by the owner (2026-10-21): accepted the default. 039-per-file-comment-filtering keeps it; the web-folder story becomes 042, Planned, with acceptance criteria 3 and 8 matched to draft-store.ts. | DONE |
| Q-17 | The VS Code extension requests the GitHub `repo` scope (mardoc-vscode extension.ts:111 at `41088d5`). Is that the intended scope? | Answered by the owner (2026-10-21): accepted the default. Record it in features/done/017 now; decide extension scopes in the sign-in L1. | DONE |
| Q-18 | Story 037 proposes AI keys in localStorage; the shipped feedback-AI keeps keys in memory only. Which rule applies? | Answered by the owner (2026-10-21): accepted the default. Memory-only keys, following feedback-ai.ts. Update 037 when it is picked up. | DONE |
| Q-29 | Which Cloudflare product hosts mardoc.app if hosting moves ([L0 cloudflare-hosting](l0-cloudflare-hosting.html))? | Workers with static assets, not Cloudflare Pages: Workers-only routes, logs and gradual deployments carry the rollback and proof designs. | PENDING |
| Q-30 | How do the Workers deploy? | The owner deploys both the Site Worker and the Auth Worker with `wrangler deploy` from a tagged release; no Workers Builds or other pipeline holds a Cloudflare token. Releases then wait for the owner. The alternative is Workers Builds from `main`. | PENDING |
| Q-31 | How does traffic move from GitHub Pages, and how are the Workers configured? | Routes `mardoc.app/*` (Site Worker) and `mardoc.app/api/auth/*` (Auth Worker) on the existing proxied record, held only in the dashboard; Wrangler files have no `routes`, `workers_dev = false` and `preview_urls = false`. Rollback deletes `/*`. Both routes fail closed over the daily limit; during the bake period `deploy.yml` runs on release tags so GitHub Pages serves the same release, and production Auth Worker invocation logs are off. A Custom Domain only if proof 2 fails. | PENDING |
| Q-32 | Does the hosting move ship before sign-in stage 1? | Yes, as release step 0 with no sign-in code, so each change can be rolled back alone. | PENDING |
| Q-33 | How are releases tested before mardoc.app? | `next.mardoc.app`: a proxied record of the apex's type, a staging Site Worker on a route, and the SP-1 test-App Auth Worker with `APP_ORIGIN` and a callback for that hostname; wildcard matching off on both Apps. | PENDING |
| Q-34 | When must the hosting direction be decided, and when does GitHub Pages stop? | Decide by 2026-10-30. Clean-up after 14 days with no rollback and the owner's confirmation; verify the domain on GitHub before cut-over. | PENDING |
| Q-35 | Is the Cloudflare account personal or an organisation's, and who else can roll back the site? | Keep the current account; accept the single-operator gap until a second maintainer exists, who then becomes an account admin. | PENDING |

When the owner answers, set Status to DONE and write "Answered by the owner (date): …" in the default column.
