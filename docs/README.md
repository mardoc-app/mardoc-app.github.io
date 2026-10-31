# MarDoc documentation

Current reference documentation was checked against application source at `4abb8f5` on 2026-09-23 and corrected against `2b94d90` on 2026-10-21 (adoption: see [adoption judgement](adoption/judgement.md)). This describes implementation, not a certification of the live deployment or current CI results.

| Need | Read |
| --- | --- |
| Understand what the product does | [Capabilities and workflows](capabilities.md) |
| Follow repository links during review | [Review links and reference previews](review-links.md) |
| Connect a GitHub repository | [PAT setup](setup-github-pat.md) |
| Understand components and request flows | [Architecture](architecture.md) |
| Read one subsystem in depth (L2 pages under the [L1 system page](design/mardoc/architecture.html)) | [Links and routing](design/links-routing/architecture.html), [repository browsing](design/repo-browsing/architecture.html), [PR review](design/pr-review/architecture.html), [editing](design/editing/architecture.html), [rendering](design/rendering/architecture.html), [HTML comments](design/html-comments/architecture.html), [embed in VS Code](design/embed-vscode/architecture.html), [resilience](design/resilience/architecture.html), [phone, local files and AI](design/mobile-local-ai/architecture.html) |
| Follow branch, file and PR deep links, and how PR loading is cached | [Sharing and refreshing repository documents](branch-links.md) |
| Measure or improve load and render performance | [Performance](performance.md) |
| Understand credentials, drafts, and document isolation | [Data storage and security](data-and-security.md) |
| Run, test, or deploy the static site | [Development](development.md), [browser tests](../e2e/README.md) |
| Track comment navigation priorities | [Comment navigation checklist](comment-navigation-plan.md) |
| Find shipped and unfinished work | [Feature status](features/README.md), [known issues](known-issues.md) |
| Understand why these docs were refreshed | [Initial audit](archive/application-audit.md) — historical snapshot |
| Manually inspect Markdown/HTML conversion | [Round-trip fixture](test-html-roundtrip.md) |

## Documentation ownership

The README is the product introduction. The reference pages above describe current behavior. Feature stories preserve design intent, acceptance criteria, and implementation history; their status notes distinguish that history from current behavior. The known-issues register tracks confirmed source gaps and work still needing runtime verification.

When changing behavior, update its reference page, relevant story status, and known-issue entry together. Link to implementation symbols and tests rather than relying on line numbers that quickly drift. A test file's presence is evidence of coverage intent, not evidence that the current run passed.

Keep proposals visibly marked as planned. Do not claim full browser/extension parity from an app-side implementation alone. Record test commands and outcomes when work is validated; avoid fixed test counts and universal claims such as lossless conversion or guaranteed notification counts.

## Fixtures and prototypes

`docs/design/mobile-prototype.html` and `public/mobile-prototype.html` are design prototypes, not specifications for the shipped interface. `public/demo.html`, the in-app data in `src/lib/mock-data.ts`, and E2E fixtures are sample content. Text embedded in sample content can lag the reference documentation and should not be used as setup guidance.

The [rendered HTML inline diff delivery plan](archive/html-inline-diff-delivery-plan.md) (archived) records the implementation streams, worktrees, acceptance criteria and validation evidence for the HTML review upgrade.
