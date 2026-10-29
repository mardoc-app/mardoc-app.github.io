# Documentation survey: judgement

Level: L1 (adoption judgement at `2b94d90`; the mechanical half is [survey.md](survey.md), the decisions are in [map.md](map.md))

Pinned at `2b94d9067011bf7e81dcda2791b9aa7d27ec00ac` (2026-10-20). Most reference docs say "reviewed against `4abb8f5`". There are 42 commits since, #111 to #138, and those commits cause most of the drift. The mardoc-vscode claims come from its local checkout at `41088d5`. This file is kept separate because `doc_survey.py --map` regenerates `survey.md`.

## Overlaps

| Topic | Docs | Owner |
|---|---|---|
| Credentials, storage, network boundary | README.md:9, data-and-security.md, setup-github-pat.md, architecture.md:20, known-issues.md DATA-02, application-audit.md §2 | data-and-security.md (docs/README.md:11) |
| SEC-01 HTML isolation | known-issues.md:5-9, data-and-security.md:29-35, features/done/031, features/done/033, features/README.md:50-52, application-audit.md:29-35 | known-issues.md tracks it; data-and-security.md describes the behaviour |
| PR loading, caching, performance | architecture.md:37-45, known-issues.md REVIEW-01/02 and PERF-01, branch-links.md, performance.md | None declared; branch-links.md and performance.md are accurate |
| Deep links and routing | architecture.md:53-64, branch-links.md:12-24, known-issues.md NAV-01, features/done/007, features/done/021 | None declared; branch-links.md is accurate |
| Dev, test, deploy | README.md:43-61, development.md, e2e/README.md, AGENTS.md (scaffold) | development.md (docs/README.md:12) |
| Feature status | features/README.md, story status lines, known-issues.md, capabilities.md, plan.md (scaffold) | features/README.md (docs/README.md:14) |
| Doc governance | docs/README.md:18-24, development.md:48-50, AGENTS.md, REVIEW.md (scaffold) | docs/README.md until Q-13 |
| Architecture authority | docs/architecture.md vs design/mardoc/design.md (unfilled template that AGENTS.md:37 points to) | docs/architecture.md holds the content (Q-12) |
| AI feedback boundary | capabilities.md:105 is identical to data-and-security.md:45 | Split by purpose |
| Mobile prototype | docs/design/mobile-prototype.html is byte-identical to public/mobile-prototype.html | Neither |

## Contradictions

The security and credential items (X-1 to X-8) come first, because that area is under active change (#146). Owner decisions are in [map.md](map.md#decisions-raised), and doc fixes are in [map.md](map.md#proposed-in-place-edits-applied-only-with-the-owners-ok).

- **X-1:** Disconnect does reset Octokit and the session caches (app-context.tsx:300-304; github-api.ts:33-41). data-and-security.md:15, known-issues.md:19 and setup-github-pat.md:42 say it doesn't.
- **X-2:** Three viewers use `allow-scripts allow-same-origin` (HtmlViewer.tsx:358, DiffViewer.tsx:1120, RepositoryReference.tsx:53). data-and-security.md:31 and known-issues.md:7 name only two.
- **X-3:** features/done/033:39-45 plans `allow-scripts` only, but the code has `allow-same-origin`. The story's status line already flags this.
- **X-4:** The Settings copy says "Your token never leaves your browser… there is no server" (SettingsPanel.tsx:252). data-and-security.md:9 says that claim is inaccurate (Q-10).
- **X-5:** The in-app PAT scopes (`repo` + `read:org`, SettingsPanel.tsx:209-222) differ from setup-github-pat.md:24,36 (Q-15).
- **X-6:** The embed `init` listener has no origin or source check and no embed-mode gate, and it accepts `data.token` (app-context.tsx:327-331, 353-376). data-and-security.md:35 and known-issues.md:9 describe message validation only as future work (Q-11).
- **X-7:** The VS Code extension requests the GitHub `repo` scope (mardoc-vscode src/extension.ts:111 at `41088d5`), and no doc mentions it (Q-17).
- **X-8:** risks.md RK-2 (scaffold) said data-and-security.md names Cloudflare. It doesn't. Fixed in risks.md by this adoption change.
- **X-9:** PR file manifests and comments paginate, and per-file failures show an error state (github-api.ts:402-458; app-context.tsx:700-715). architecture.md:41, known-issues.md REVIEW-01/PERF-01, features/done/024 and features/README.md:43 say otherwise. Not documented anywhere: the PR list itself is one page of 100 (github-api.ts:296-304).
- **X-10:** PR-list loading is guarded and abortable (app-context.tsx:451-465). architecture.md:45, known-issues.md REVIEW-02, features/README.md:46 and features/done/027 say it isn't.
- **X-11:** Route builders encode the branch and path segments, and parsing is strict (hash-router.ts:24-58). architecture.md:64, known-issues.md NAV-01 and features/README.md:27,40 say otherwise.
- **X-12:** Repository activation loads only the revision and tree; branch and PR lists load on demand (app-context.tsx:508-536). architecture.md:39 says otherwise.
- **X-13:** HTML comment markers shipped (#131, html-comment-markers.ts). comment-navigation-plan.md:211-216 and features/done/033:3-5 say they didn't.
- **X-14:** e2e/README.md:35-44 maps 15 specs; e2e/ has 25.
- **X-15:** html-inline-diff-delivery-plan.md:46 requires `NODE_OPTIONS=--no-experimental-webstorage`, but vitest.config.ts sets it (274d452). development.md omits `npm run ci`.
- **X-16:** known-issues.md:41 names `Editor.handleEditSubmitAsPR`; the handler is `handleSubmitEditsAsPR` (Editor.tsx:1236).
- **X-17:** Two stories use ID 039. The untracked web-folder story's acceptance criteria 3 and 8 expect `__local__/` drafts, which draft-store.ts:118,147 excludes (Q-16).
- **X-18:** "Reviewed against `4abb8f5`" headers sit on docs edited later (docs/README.md, architecture.md, capabilities.md, data-and-security.md, known-issues.md, features/README.md).
- **X-19:** branch-links.md:23 says file indices cover only supported documents. The manifest now appends the other files after the documents (github-api.ts:405).

## Newest doc per topic

| Topic | Newest accurate doc |
|---|---|
| Product introduction | README.md (changes with sign-in, D-1) |
| Capabilities | capabilities.md (2026-10-19) |
| Credentials and storage | data-and-security.md, except X-1 and X-2; it also omits the `mardoc_user_repos` and feedback-AI keys |
| PR loading and caching; routing | branch-links.md, performance.md |
| Review links | review-links.md |
| HTML inline diff | features/041 and capabilities.md:25-29 |
| Dev, test, deploy | development.md (omits `npm run ci`) |
| Open gaps | known-issues.md for SEC-01, DATA-01, EDIT-01, EDIT-02, REVIEW-03 and TOOL-01 only |

## Authoritative but stale

- **known-issues.md:** 4 of 11 entries are closed or narrowed in code (REVIEW-01, REVIEW-02, NAV-01, DATA-02), and PERF-01 is partly addressed.
- **architecture.md:** the loading-flow (:39-45) and navigation (:64) sections describe the code before #111. The code map is valid but incomplete.
- **data-and-security.md:** the declared security owner, but wrong on X-1 and X-2, and its state table misses four keys.
- **features/README.md:** rows 007, 021, 024, 027 and 033 are stale; the 041 row is detached from the table; 039-web-folder is unlisted.
- **e2e/README.md:** its coverage map is incomplete.
- **Open stories:** 039-per-file-comment-filtering and 041 are implemented. 040 is implemented on the app side, with the extension side unverified. 037 and 039-web-folder are not implemented.

## Boilerplate

- **Story preamble:** about 33 stories open with the same "historical design record" preamble, which adds nothing beyond the status line.
- **Duplicate paragraph:** data-and-security.md:45 duplicates capabilities.md:105.
- **Agent session notes:** html-inline-diff-delivery-plan.md:3,9-11,22,48-52 describes the agent's environment.
- **Unfilled templates:** design/mardoc/design.md, requirements.md and intent.md are scaffold templates with `{{…}}` placeholders.
- **Placeholders:** test-html-roundtrip.md's two broken links (`demo.mp4`, `podcast.mp3`) are intentional fixture placeholders.
- **No inherited third-party template text** was found.
