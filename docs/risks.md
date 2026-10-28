# MarDoc Risks

This is the register of everything that may go wrong and would cost the
project if it did. Each risk stays open until evidence closes it (a spike, a
passing test or an ADR) or the owner accepts it. The design's accepted risks
are in [design.md](design/mardoc/design.md#accepted-risks); the delivery
plan is in [plan.md](plan.md).

## How to read this document

- **Category:**
  - **STRUCT:** architecture or structure; a design choice that may not hold.
  - **PROC:** process and delivery; schedule, people, tooling, approvals.
  - **INTEG:** integration; an external system, library, platform or vendor.
  - **DATA:** data loss, corruption, migration or privacy.
  - **SEC:** security; a threat that crosses a trust boundary.
- **Likelihood:** **High** is expected without action; **Medium** is
  plausible; **Low** needs an unusual event.
- **Impact:** **High** breaks a Must requirement, loses data or opens a
  security hole; **Medium** costs rework or a slipped milestone; **Low** is a
  nuisance with a workaround.
- **Owner** is who acts on the mitigation: a person, an agent role or a WP-n.
- **Status:** `PENDING` is open; `⭐` is mitigation in progress; `PARTIAL`
  is mitigated with a residual risk named in the row; `DONE` is closed, and
  the Mitigation cell links the evidence.

## Register

| ID | Risk | Category | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| RK-1 | Rendered HTML iframes run as the mardoc.app origin (SEC-01). A script in a shared document can read the stored PAT today. After sign-in it could capture the in-memory access token, which is limited to installed repos and expires in 8 hours, or call `/api/auth/refresh` to keep minting tokens (issue #146, Q-4). | SEC | Medium | High | Stage 1 ships sign-in with no refresh route and no stored token. Stage 2 (refresh) ships only after SEC-01 is fixed and the stage 2 gate in proof 3 of `docs/design/github-sign-in/strategy.html` passes. | Joe Barnett | OPEN |
| RK-2 | GitHub access and refresh tokens pass through the Auth Worker, which runs on Cloudflare, a third party. A compromised Worker deploy or Cloudflare account could capture tokens (issue #146, Q-7). | SEC | Low | High | The Worker stores and logs no tokens. Only Joe Barnett can deploy it; the Cloudflare account uses a hardware security key (owner confirmed, 2026-10-27). The client secret lives only in Worker secrets. When the Worker ships, `data-and-security.md` must name Cloudflare as a party in the credential path; it does not at `2b94d90`. | Joe Barnett | OPEN |
| RK-3 | The `init` message listener accepts messages from any sender, including a rendered document's script through `window.parent`, and can replace the GitHub token or the displayed content (app-context.tsx:327-331, 353-376; Q-11). | SEC | Medium | High | Stage 1 (F-16, [WP-2](plan/WP-2.md)): `init` is applied only with `?embed=true` and only when `event.source` is the page's own `window.parent` (`isTrustedInit` in `src/lib/embed-init.ts`), proved by `e2e/embed-init.spec.ts` (`f16_init_from_sibling_iframe_is_ignored`, `f16_init_from_rendered_document_is_ignored`, `f16_init_outside_embed_mode_is_ignored`). Closes for stage 1 once WP-2 merges and the owner's VS Code check passes. `file:content` and the other embed messages stay with SEC-01 (ADO-1). | Joe Barnett | ⭐ |
| RK-4 | If hosting moves to Cloudflare (D-2), only Joe Barnett can roll back or repair the site, because routes and Workers live in their Cloudflare account; Q-9 accepted that gap for sign-in only, where the PAT is the fallback. | PROC | Low | High | Until clean-up, deleting one route restores GitHub Pages. Default (Q-35): accept until a second maintainer exists, who then becomes an account admin. | Joe Barnett | OPEN |

Add one row per risk, ordered by exposure (High/High first). Never delete a
row: a closed risk stays with status DONE and its evidence.

## Accepted risks

Risks the owner has chosen to carry. Each needs the owner's acceptance and a
trigger that reopens it.

| ID | Risk | Rationale | Accepted by | Revisit when |
|---|---|---|---|---|

Add a row only when the owner has accepted the risk. Until then it stays in
the register with a recommended acceptance in its Mitigation cell.
