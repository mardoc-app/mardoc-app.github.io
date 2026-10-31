# MarDoc documentation

Current reference documentation was checked against application source at `4abb8f5` on 2026-09-23 and corrected against `2b94d90` on 2026-10-21. This describes implementation, not a certification of the live deployment or current CI results.

| Need | Read |
| --- | --- |
| Connect a GitHub repository | [PAT setup](setup-github-pat.md) |
| Understand components and request flows | [L1 system page](design/architecture.html) |
| Read one subsystem in depth (L2 pages under the [L1 system page](design/architecture.html)) | [Links and routing](design/l2-links-routing.html), [repository browsing](design/l2-repo-browsing.html), [PR review](design/l2-pr-review.html), [editing](design/l2-editing.html), [rendering](design/l2-rendering.html), [HTML comments](design/l2-html-comments.html), [embed in VS Code](design/l2-embed-vscode.html), [resilience](design/l2-resilience.html), [phone, local files and AI](design/l2-mobile-local-ai.html) |
| Understand credentials, drafts, and document isolation | [Data storage and security](data-and-security.md) |
| Run, test, or deploy the static site | [Development](development.md), [browser tests](../e2e/README.md) |
| Find unfinished work and known gaps | [Known issues](plan.md#known-issues), [plan](plan.md) |
| Understand why these docs were refreshed | [Initial audit](archive/application-audit.md) — historical snapshot |

## Documentation ownership

The README is the product introduction. The reference pages above describe current behavior. The design pages under `design/` hold design intent per subsystem. The Known issues section of [plan.md](plan.md) tracks confirmed source gaps and work still needing runtime verification.

When changing behavior, update its reference page, design page and known-issue entry together. Link to implementation symbols and tests rather than relying on line numbers that quickly drift. A test file's presence is evidence of coverage intent, not evidence that the current run passed.

Keep proposals visibly marked as planned. Do not claim full browser/extension parity from an app-side implementation alone. Record test commands and outcomes when work is validated; avoid fixed test counts and universal claims such as lossless conversion or guaranteed notification counts.

## Fixtures and prototypes

`docs/design/mobile-prototype.html` and `public/mobile-prototype.html` are design prototypes, not specifications for the shipped interface. `public/demo.html`, the in-app data in `src/lib/mock-data.ts`, and E2E fixtures are sample content. Text embedded in sample content can lag the reference documentation and should not be used as setup guidance.

The [rendered HTML inline diff delivery plan](archive/html-inline-diff-delivery-plan.md) (archived) records the implementation streams, worktrees, acceptance criteria and validation evidence for the HTML review upgrade.
