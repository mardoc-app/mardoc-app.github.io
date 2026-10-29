# Review CFH: L0 strategy, serve mardoc.app from a Cloudflare Worker

- **Reviewer:** independent design reviewer (opus-class, light L0 review per `sdlc:review`)
- **Date:** 2026-10-23
- **Scope:** `docs/design/cloudflare-hosting/strategy.html` (L0 strategy) and its diagram `diagrams/landscape.drawio` / `landscape.svg`, at branch `design/cloudflare-hosting-l0`, commit `91becc9`. Also the commit's edits to `docs/plan.md` (D-2 row) and `docs/design/mardoc/requirements.md` (Q-29..Q-34).
- **Checked against:** `REVIEW.md`; the "By level" L0 block and the shared boxes of `checklists/design.md`; ADR 0001; the sign-in L0 and L1 (`requirements.md`, `design.md`, `architecture.html`); SP-1; `docs/risks.md`; `docs/plan.md`; `.github/workflows/deploy.yml`; the three iframe sites in `src/components/`; and the Cloudflare, GitHub, RFC and W3C pages the brief links (fetched 2026-10-23; the Cloudflare pages as the `index.md` markdown versions).
- **Baseline:** `sdlc-doclint` on the page: 0 errors, 0 warnings. No `ci` output was supplied; the change is docs only, so I did not run `npm run ci`. No `out/` exists in the worktree, so the "80 files, 5.0 MB" figure is not re-measured.
- **How:** read the page alone first (section "Owner comprehension" below), then followed every citation. Cloudflare/GitHub claims were checked by fetching the cited pages. Read-only `dig` and `curl -I` against `mardoc.app`, `www.mardoc.app` and `/api/auth/health` only. Nothing was changed on Cloudflare or GitHub, and nothing was deployed. The report is written to the worktree and **not committed** (as instructed by the caller).

## Verdict

**Direction sound; not yet safe to put to the owner as written.** One High and eight Medium findings. The decision itself is clear and decidable by the owner alone (one direction, owner, date, defaults Q-29..Q-34), and the page answers all five of the owner's mid-task questions. But the page's central safety claim ("going back is one deleted route") is false as written when the route is declared in Wrangler config and Workers Builds deploys from `main` (CFH-1), "the L1 moves in unchanged" is false against L1 constraint C-14 and assumption A-17 (CFH-2), and two cost/exposure claims hold only under a configuration the page does not set (CFH-5, CFH-6). All are fixable in the brief without changing the direction.

| Severity | Count |
|---|---|
| High | 1 |
| Medium | 8 |
| Low | 7 |
| Nit | 4 |

## Why and problem, in my words (before reading parts)

**Why.** The owner wants three things from moving hosting to Cloudflare: (1) control of response headers on mardoc.app, which GitHub Pages doesn't allow, so a Content-Security-Policy and similar headers become possible; (2) one deploy for the site and the sign-in code; (3) a staging hostname to try changes before users see them. Evidence is the owner's note of 2026-10-22 plus SEC-01/RK-1. The page itself marks the SEC-01 benefit as a hypothesis, which is honest.

**Problem, without naming a solution.** MarDoc is a browser-only app on one origin that must obtain a short-lived GitHub credential for a user without the user pasting one. GitHub's code-for-token exchange needs a client secret, which can't live in the browser, so some code must run server-side on that origin. The same origin also renders untrusted documents whose scripts run with the app's privileges, so whatever credential the tab holds is exposed. The current host can set no headers and forces a second place to deploy server code. Any change of who serves the production domain must be reversible, because real users hold stored PATs and bookmarks on that origin. What is hard: proving the new serving path on the real zone without exposing users, and keeping the secret-holding code as tightly controlled as ADR 0001 intended while it shares a deploy with the site.

The parts in the page's layer 3 (site Worker, assets, auth code, secret, Pages as rollback) each answer something in that problem. No orphan parts.

## Owner comprehension: questions answered from the page alone

| Owner question | Answered? | Where |
|---|---|---|
| What exactly do I decide, by when? | Yes | Header block; section 04 "Recommended action" (direction, route cut-over, SP-4, defaults Q-29..Q-34, by 2026-10-30) |
| How do we test the hypothesis with minimal user risk? | Mostly | "Test ladder" (local, staging, cut-over, sign-in) and the three proofs. Gaps: how staging gets different code than production, and the route mechanism is first exercised on the production hostname (CFH-4) |
| Can the 8-hour token be 12 hours? | Yes | Section 03 "How long a sign-in lasts": no; GitHub fixes `expires_in` at 28800; only stage 2 silent refresh with a MarDoc-side cap gets there. Verified (below) |
| How do I switch back? | Partly | "Switching back" table, "When to switch back". Incomplete: the rollback is undone by the next deploy (CFH-1); `www` and the later clean-up state are missing (CFH-10, CFH-11) |
| Where do the app, the key and the browser hold credentials relative to GitHub, and what does Cloudflare keep? | Yes, with gaps | Credential table and "What Cloudflare keeps". Gaps: Workers Logs on by default records the callback URL (CFH-6); the diagram omits the Worker-to-tab token hand-off (CFH-16) |
| How do users perceive the security and why is it better than a PAT? | Yes | "What the user sees" and comparison table. Honest about Worker/Cloudflare in the path and SEC-01 |
| What does it cost and who runs it? | Partly | "Operating commitment". Cost claim fails under default config (CFH-5); single-operator risk not named (CFH-9) |
| What if it fails? | Partly | Each proof has an "If it fails" line; fallbacks are named. Proofs are not marked reversing/shaping (CFH-8) |
| Is anything irreversible? | Mostly | Domain verification and README change are flagged; Pages stop after 14 days† is gated on time only (CFH-11) |

## Findings

| ID | Sev | Pass | Location | Finding |
|---|---|---|---|---|
| CFH-1 | High | Bugs | Switching back table; proof 3; Q-31 | Deleting the route in the dashboard is undone by the next Workers Builds deploy |
| CFH-2 | Medium | Compliance | §03 "How the OAuth 2.0 sign-in works", Recommended action | "The L1 moves in unchanged" is false: deploy model contradicts L1 C-14, A-17, Q-25 |
| CFH-3 | Medium | Security | Operating commitment; RK-2 line | "RK-2 unchanged" is wrong: the secret now deploys on every merge to `main` |
| CFH-4 | Medium | Bugs | Test ladder, proofs 2 and 3 | Staging is undefined; the route mechanism is first exercised on production |
| CFH-5 | Medium | Bugs | §03 pieces para 2; Cost; proof 2 | "Only sign-in requests count towards 100,000 a day" is false under default asset config; over-limit behaviour is unspecified |
| CFH-6 | Medium | Security | "What Cloudflare keeps"; proof 2 | Workers Logs is on by default and records the callback URL; "if enabled" and "checked in proof 2" are both wrong |
| CFH-7 | Medium | Compliance | §02 Sign-in paragraph; Key idea; SP-1 | Cited SP-1 evidence is not in the repo, and SP-1 did not test what the rollback relies on |
| CFH-8 | Medium | Compliance | §04 proofs; Recommended action | Proofs not marked reversing/shaping; proof 1 has no pass threshold for CSP; SP-4 bundles three assumptions |
| CFH-9 | Medium | Compliance | Operating commitment "Operator" | Whole-site availability and rollback now depend on one person's Cloudflare account; no RK row |
| CFH-10 | Low | Bugs | §02 Situation; Switching back | `www.mardoc.app` is served by GitHub Pages today and is not mentioned; DNS record type unverified |
| CFH-11 | Low | Bugs | Release order "Clean-up"; Switching back | Clean-up is gated on elapsed time only; domain verification is deferred when it is a no-regret early step |
| CFH-12 | Low | Bugs | §01 Why; §02 risk paragraph | CSP is described as the tool for containing document scripts; two limits are not stated |
| CFH-13 | Low | Bugs | Proof 1 | "Every file matches byte for byte" doesn't prove URL behaviour parity |
| CFH-14 | Low | Compliance | §03 callback URL; Q-33 | Staging needs a second callback URL and a different `APP_ORIGIN`; the L1 hard-codes `mardoc.app` |
| CFH-15 | Low | Compliance | `docs/plan.md:104` | The D-2 row sits in the Gate 0 table with mismatched columns, not in Decisions |
| CFH-16 | Low | Compliance | `diagrams/landscape.*` | Diagram omits the token's path from the Worker to the tab |
| CFH-17 | Nit | Compliance | Proofs, release order, action | The dagger (†) is never defined on the page |
| CFH-18 | Nit | Compliance | Header "Reading time" | Stated 9 minutes; the text is about 3,000 words (about 12 minutes) |
| CFH-19 | Nit | Compliance | §03 "How the OAuth 2.0 sign-in works" | “strongly recommends” is quoted as GitHub's words; GitHub's wording is "Strongly recommended" |
| CFH-20 | Nit | Compliance | Proof 3 vs release step 0 | Step 0 ships "no sign-in code" but proof 3 needs `/api/auth/health` to answer |

### CFH-1 (High, Bugs): the one-step rollback is undone by the next deploy

- **Location:** "Switching back" row 1 ("Delete the route `mardoc.app/*` in the Cloudflare dashboard"); proof 3; the Key-idea box ("one deleted route"); Q-31; Operating commitment ("Workers Builds deploys from `main`"; "Agents write the configuration").
- **Finding:** Cloudflare's Wrangler configuration page says: "If you change your routes in the dashboard, Wrangler will override them in the next deploy with the routes you have set in your Wrangler configuration file." The brief has agents write the configuration (routes are the only way the Worker is attached to the zone) and Workers Builds redeploy on every push to `main`. Neither the rollback steps nor proof 3 say that the route must also be removed from the config, in `main`, or that Workers Builds must be paused first.
- **Failure scenario:** Production is on the Worker. At 10:00 the owner sees a broken page and deletes `mardoc.app/*` in the dashboard; traffic returns to GitHub Pages (proof 3 measures this). At 10:20 an unrelated PR merges to `main`; Workers Builds runs `wrangler deploy`, re-creates the route from config, and every user is back on the broken Worker with no one having acted. Proof 3 measures the switch time but not whether the rollback survives a deploy, so it passes. The same applies to "delete both routes" in the "Cloudflare hosting is abandoned" row.
- **Fix:** Rewrite the rollback as a pair of steps in order: (1) disconnect or pause Workers Builds for the Worker (so no deploy can re-add the route); (2) delete the route in the dashboard (or ship a config change removing it). Add to proof 3: "merge a trivial commit after rollback and confirm the route is not recreated". Or keep routes out of the config and manage them only in the dashboard (Cloudflare documents removing the `routes` keys for that), and say which. Record the choice in Q-31.

### CFH-2 (Medium, Compliance): "the L1 moves in unchanged" contradicts reviewed L1 constraints

- **Location:** §03 "It is the L1 design unchanged"; Header ("The OAuth 2.0 sign-in from the reviewed L1 moves in unchanged"); Recommended action ("the sign-in L1 updates C-10 and C-12"). Compare `docs/design/github-sign-in/requirements.md` C-14 (line 80), A-17 (line 200), Q-25 (line 308), `design.md` "Operations, reliability and rollout" (lines 760-770) and the "Deployment assumption" (line 128).
- **Finding:** The L1 says the owner "does every Cloudflare step (route, deploy, secrets); agents never do" (C-14) and "the owner deploys it with `wrangler deploy` from a tagged commit; nothing deploys it automatically" (A-17, Q-25, still PENDING). Q-30 here (Workers Builds from `main`) is automatic deploy. The L1's rollout says the app ships through "the existing Pages deploy, in either order" and rollback is "remove the Worker route"; with one Worker those no longer describe the system. The brief lists only C-10 and C-12 for L1 updates and never mentions Q-25, A-17 or C-14.
- **Failure scenario:** The owner approves D-2 and Q-30. The L1 Gate 0 package they already accepted (or are about to) says deploy is manual from a tag. Implementation follows Q-30; the L1 reviewer's security assumptions (nothing deploys the secret-holding code automatically) silently no longer hold, and the L1 design.md, T-32 and the runbook conflict with the build.
- **Fix:** Name every L1 item that changes: C-10, C-12, C-14 (reword: owner configures the pipeline; agents never deploy by hand), A-17/Q-25 (superseded by Q-30), design.md deploy/rollback/observability and deployment assumption, and the "Pages deploy" wording. State the decision as an amendment, not "unchanged". Also list who closes Q-25.

### CFH-3 (Medium, Security): RK-2 is not "unchanged"; the secret's deploy path widens

- **Location:** "What Cloudflare keeps" ("That is RK-2, unchanged by this move"); Operating commitment ("Client secret ... Any deploy of site code can read it"). `docs/risks.md` RK-2 mitigation: "Only Joe Barnett can deploy it, with 2FA".
- **Finding:** RK-2's mitigation is that only the owner deploys the Worker. Under Q-30 any change merged to `main` (a dependency bump, a PR from any contributor or agent) is deployed by Workers Builds into the Worker that holds the client secret and sees every token in transit. The page's own mitigation ("changes to Worker code get the security review the sign-in L1 requires") is process, not a control: the Worker bundle is built in the same pipeline as the site, so a compromised npm dependency in the site build can alter the Worker code without touching `worker/`.
- **Failure scenario:** A routine dependency update is merged with a malicious postinstall that patches the built Worker bundle. Workers Builds deploys it. The new code logs the `code`/token to an attacker host. Before D-2, the same compromise reached only the Pages site (no secret); under the old plan the Worker was deployed by the owner from a tag.
- **Fix:** Update the RK-2 row: likelihood and mitigation change. Pick and record one control: keep sign-in in a separate Worker (the brief's own fallback) deployed from a tag by the owner; or require CODEOWNERS plus required review on `worker/` and the lockfile, build the Worker bundle from a pinned, lockfile-verified step, and have Workers Builds watch only the intended paths. Say in the Alternatives table that the separate-Worker option also preserves the RK-2 mitigation, not only "a second deploy".

### CFH-4 (Medium, Bugs): staging is undefined, and the route mechanism is first used on production

- **Location:** Test ladder rungs 2 and 3; proofs 2 and 3; Q-33.
- **Finding:** Two unanswered questions an owner needs before approving SP-4:
  1. *How does `next.mardoc.app` run different code from `mardoc.app`?* Q-30 deploys one Worker from `main`. If `next.` and `mardoc.app` are two hostnames on the same Worker, every merge is live on production at once and "test each change before it reaches mardoc.app" is not true. Staging also uses the SP-1 test App while production uses the production App, so the same Worker would need two client secrets keyed by hostname. The page never says there are two Workers (or two Wrangler environments).
  2. *How is the route-on-proxied-record mechanism proven before it carries users?* The page admits "Whether a route on the proxied record serves static assets is inferred from the docs, not yet checked", and yet proof 3 is the first time it is exercised and runs on `mardoc.app`. Staging has no DNS record today (`dig next.mardoc.app` is empty), so it will probably be a Custom Domain, which is a different mechanism from the production route. Rung 2 then proves the wrong thing.
- **Failure scenario:** Rung 2 passes on a Custom Domain. At rung 3, on the production hostname during a "quiet hour", the route turns out not to serve assets (or fails differently on the apex), and the Custom-Domain fallback needs the CNAME deleted first (documented: a Custom Domain can't be created on a hostname with an existing CNAME), which means DNS downtime on the production domain while the owner works out what happened.
- **Fix:** State the deployment topology (separate staging Worker or Wrangler environment, its own secret, own App). Add a rung between 2 and 3 that exercises the production mechanism with no users: a proxied record for a staging hostname that mimics production (same record type, a route, not a Custom Domain), and, on production, a single-path canary route (for example `mardoc.app/demo.html`, which exists in `public/`) to prove route-plus-assets and removal on the real zone before `/*`. Then rollback and cut-over are rehearsed twice before they matter.

### CFH-5 (Medium, Bugs): the "only sign-in requests count" cost claim fails under default config; over-limit behaviour is unspecified

- **Location:** §03 para 2 ("Requests for a file ... Those requests are free and unlimited. Setting `run_worker_first` to `/api/auth/*` sends only sign-in requests to the code"); "Why this matters for safety" ("those paths get a 429 and ... the site keeps loading"); Cost row ("Only sign-in requests count towards 100,000 a day"); proof 2 ("the dashboard counts only `/api/auth/*` requests").
- **Finding (a):** Cloudflare's Worker-script routing page says: "If an appropriate static asset is not found, Cloudflare will invoke your Worker script", and the Wrangler docs give `not_found_handling` a default of `"none"`. The site Worker has a script (it must, to serve `/api/auth/*`). So every non-file request (404s, scanners probing `/wp-login.php`, and `/favicon.ico`, which SP-1 recorded as a Pages 404 and which browsers request on each visit) invokes the Worker and counts to the 100,000/day limit and the 10 ms CPU limit. `run_worker_first` only adds the sign-in paths to that set. The page never mentions `not_found_handling = "404-page"` (Next's export emits `404.html`), which is what keeps unmatched requests out of the Worker.
- **Finding (b):** The page says that on exceeding the limit, sign-in paths "get a 429 and ... the site keeps loading". That matches the static-assets billing page for `run_worker_first` patterns. The Platform Limits page describes a separate route-level behaviour: over the Free daily limit Cloudflare returns error 1027, and each route is "fail open" (bypass the Worker and go to the origin) or "fail closed" (1027 page). The page never says which mode the `/*` and `/api/auth/*` routes use. Fail open sends everything to GitHub Pages, which is fine while Pages is deployed and wrong after clean-up (a stale or unclaimed origin). Fail closed shows 1027. Which behaviour the 5 s fallback in L1 F-51 sees (it lists a Pages 404, a 503 or a network error, not a 429 or 1027 page) is also unstated.
- **Failure scenario:** Staging is quiet, so proof 2's "dashboard counts only `/api/auth/*`" passes on a test hostname. On production a scanner sends 120,000 requests of unknown paths in a day. The Worker is invoked for each, the Free limit is reached, and the route either bypasses the Worker (fail open: all traffic, including sign-in, hits GitHub Pages; sign-in returns a Pages 404 until midnight UTC) or shows error 1027 on every miss. Cost "expected $0" is no longer a safe estimate and the user-visible outcome is not the one the page promises.
- **Fix:** Add `not_found_handling = "404-page"` to the proofs' observable list and test it (an unknown path must not appear in Worker request counts). State the route failure mode (recommend fail open while Pages is the rollback, with a note that it ends at clean-up), and add a proof 2 check by sending a few hundred unknown-path requests to staging and reading the counts. Add the 429/1027 pages to the F-51 test list, or note the PAT message path covers them.

### CFH-6 (Medium, Security): Workers Logs is on by default and logs the callback URL

- **Location:** "What Cloudflare keeps" ("if enabled, Workers Logs. For the callback, the URL contains the one-time code and state ... What Workers Logs records is checked in proof 2"; "Never kept: access tokens, refresh tokens or documents"); proof 2 ("Workers Logs shows sign-in requests under the Free plan's 10 ms CPU limit").
- **Finding:** The Workers Logs page says all newly created Workers come with observability enabled, and each invocation log carries the request, with the message for a fetch being `<Method> <URL>`. So the callback URL with `?code=...&state=...` is written to the account's logs (3-day retention on Free) unless the owner turns invocation logs off. "If enabled" is wrong (it is on by default), and "checked in proof 2" is not in proof 2, whose text covers CPU time and request counts only. There is also a tension: proof 2 uses Workers Logs to read CPU time, so disabling logs removes the measurement. Separately, "Never kept: access tokens" describes MarDoc's design (no storage binding, no logging), not Cloudflare's platform, which proxies every response body including the callback page that carries the token; the sentence should say so.
- **Failure scenario:** Owner leaves defaults. Every sign-in writes a callback URL with a live (for up to 10 minutes, under RFC 6749's recommended lifetime) authorization code to Workers Logs, readable by anyone with dashboard or Logpush access. The code is useless without the secret and verifier, so this is not a token leak, but it contradicts the page's own "used up within seconds, not kept" framing and the L1's stance on logging.
- **Fix:** Put the logging decision in the brief: logs on for staging only (to measure CPU), `invocation_logs = false` (or sampling 0) on production, with the check "after a sign-in, no log line contains `code=`" added to proof 2 (or the proof moved to staging with test data). Reword "Never kept" to "MarDoc's design keeps no copy; Cloudflare proxies the response in transit".

### CFH-7 (Medium, Compliance): the SP-1 evidence behind the rollback story is not in the repo, and SP-1 did not test it

- **Location:** §02 ("SP-1 tested that route on the live zone"); Key idea ("ADR 0001 as SP-1 tested it"); Alternatives ("Works and was tested in SP-1").
- **Finding:** `docs/spikes/sp-1-github-sign-in.md` still reads "Status: built, awaiting owner deploy. Results and Conclusion are pending", with every criterion "pending" and "Decision: pending (ADR 0001 is Proposed)". `docs/plan.md` and the ADR record the owner's verbal PASS and ask the owner to paste the probe output and callback JSON; that has not happened. The live site corroborates only that the SP-1 Worker was removed (`/api/auth/health` today returns the Pages 404 with `x-github-request-id`). Also, SP-1 tested a disposable Worker with no static assets on `/api/auth/*`; it did not test a Worker with assets, a `/*` route, or removing a `/*` route. The brief's rollback state "ADR 0001 as SP-1 tested it" is therefore the state where only `/api/auth/*` is routed, which SP-1 covers, but the transition into and out of `/*` is new.
- **Failure scenario:** A later reader (or reviewer) follows the "tested in SP-1" citation and finds no results. The ADR says Accepted on an unrecorded report, and the one proven fallback state rests on a claim with no artefact.
- **Fix:** Have the owner paste the SP-1 results (probe output, JSON, wrangler version) into the report before D-2 relies on it, or soften the page to "reported PASS by the owner on 2026-10-21; results to be recorded". State that `/*` and Worker-with-assets are new and untested (which proof 3 covers).

### CFH-8 (Medium, Compliance): proofs are not marked reversing or shaping; proof 1 has no threshold; SP-4 bundles three assumptions

- **Location:** §04 "Decision" proofs 1-3; Recommended action ("the three proofs as spike SP-4 (1 day of agent time plus your deploy steps)").
- **Finding:** The L0 checklist requires each proof to be marked reversing or shaping; none is. Proof 1 combines a reversing check (files match, e2e passes, baseline headers present) with a shaping one (report-only CSP "reports are counted"), but gives no number or rule for what count passes, and states "If it fails: stay on GitHub Pages". So an unbounded CSP-report outcome could reverse the whole hosting move even though the CSP is described elsewhere as out of scope. SP-4 then bundles three independent risky assumptions (CSP viability, sign-in inside the site Worker with CPU limits, route cut-over and rollback on production). It also needs the owner at proofs 2 and 3, so "1 day of agent time" understates the elapsed time. `docs/plan.md` has no SP-4 row (the D-2 row refers to it). The sign-in shaping spike SP-3 is planned to run "through the live zone" against the product Worker module; it is not reconciled with proof 2 here.
- **Failure scenario:** Proof 1 shows 400 CSP reports from the app's own inline scripts. There is no threshold, so the owner can't tell pass from fail; if read as a fail, the hosting move is rejected over an optional, out-of-scope policy. Meanwhile proof 3 can't start until proofs 1 and 2 are done by an owner who must also do the deploys, with no schedule.
- **Fix:** Label proof 1a (parity and headers, reversing) and 1b (report-only CSP, shaping: failure changes the CSP plan, not the hosting decision); give 1b a rule, for example "no reports from the app's own code after an `unsafe-inline` or hash allowance, and a list of document-caused reports to review". Split SP-4 into separate spike rows (SP-4a staging parity, SP-4b sign-in in site Worker, SP-4c cut-over rehearsal) with one question each, add them to `plan.md`, and say how SP-3 merges with SP-4b.

### CFH-9 (Medium, Compliance): the single-operator risk now covers the whole site

- **Location:** Operating commitment "Operator"; `docs/risks.md`; Q-9 in `docs/design/mardoc/requirements.md`.
- **Finding:** Q-9 accepted a gap only for the Auth Worker: "Gap accepted until MarDoc has a second maintainer; the PAT option is the fallback." After this move, the site's availability, the route switch (the rollback), the Workers Builds connection and domain DNS are all in a Cloudflare account that the page says Joe Barnett owns. The page doesn't say whether the Cloudflare account is personal or an organisation's, and has no RK row for it. The PAT fallback doesn't help when the site itself is down.
- **Failure scenario:** The owner is unreachable the day a deploy breaks the site. Maintainers with write access to the GitHub repo can't roll back, because rollback is a Cloudflare dashboard action (and, per CFH-1, a GitHub-side revert is also redeployed only by Workers Builds that the same account owns). Before the move they could revert the commit and Pages redeployed.
- **Fix:** Add an RK row (single-operator hosting) and amend Q-9's scope, or add the second maintainer to the Cloudflare account as a condition of cut-over. State the account type. Say what a repo maintainer without Cloudflare access can do during the bake period (for example, GitHub Pages still deploys from `main`, so a maintainer can only help if the route is deleted).

### CFH-10 (Low, Bugs): `www.mardoc.app` and the DNS record type are not covered

- **Location:** §02 Situation ("The custom domain comes from `public/CNAME`"); proof 3 fallback ("the existing CNAME record deleted first").
- **Finding:** `curl -I https://www.mardoc.app/` returns `301` to `https://mardoc.app/` with `x-github-request-id`: `www` is served by GitHub Pages today. The route `mardoc.app/*` does not match `www.mardoc.app`, so `www` keeps working only while Pages stays deployed and then dies at clean-up. Also `public/CNAME` is a GitHub Pages file, not the Cloudflare DNS record; the brief calls the apex record a "CNAME" without checking its type (a proxied apex always resolves to Cloudflare A/AAAA records, so `dig` can't show it). If the apex uses A records, the fallback's "delete the existing CNAME first" is a different procedure.
- **Failure scenario:** After clean-up, an old link or typed `www.mardoc.app` returns a Pages 404 or a certificate error. Or the owner, at the Custom Domain fallback, finds the apex record is not a CNAME and the written steps don't apply.
- **Fix:** Add `www` handling to scope (redirect rule at Cloudflare before clean-up) and record the actual apex record type from the dashboard in the situation section.

### CFH-11 (Low, Bugs): clean-up is time-gated; verification is late; "rollback" target goes stale

- **Location:** Release order "Clean-up ... 14 days† with no rollback"; "When to switch back" (domain verification paragraph); Alternatives.
- **Finding:** The takeover point in the page is correct (verified: GitHub says takeovers happen "after any other change which unlinks the custom domain or disables GitHub Pages while the domain remains configured ... and is not verified", and the TXT record must stay). Three gaps: (1) verification takes up to 24 hours for DNS, costs nothing and reduces risk at once, but is scheduled at the end; (2) the clean-up gate is elapsed time with no condition (for example, no rollback, no unexplained error rate, no route-failover event); (3) "GitHub Pages deploys stop" leaves a stale Pages copy as the rollback target, and the page doesn't say that after clean-up the way back is "re-enable deploys and rebuild", not "delete a route". Also the apex DNS record still points at GitHub after the move; once Pages stops, the route (not DNS) is all that keeps GitHub's origin out of the path, which interacts with CFH-5's fail-open mode.
- **Failure scenario:** Day 14 arrives during a week the owner is away. Deploys stop on schedule; the next day a Worker incident forces a rollback to a Pages copy that is two weeks old and lacks the sign-in UI the Worker's API expects; or someone unpublishes the Pages site and, because verification was never done, another GitHub user claims `mardoc.app` on Pages and any route failure exposes their content.
- **Fix:** Move domain verification to before cut-over (step 0), define clean-up as "14 days and zero rollbacks and owner confirmation", and write the post-clean-up rollback honestly.

### CFH-12 (Low, Bugs): CSP "main tool" claim omits two limits

- **Location:** §01 ("the main tool for containing scripts in rendered documents"); §02 ("A srcdoc iframe inherits its parent page's CSP").
- **Finding:** The inheritance claim is correct (verified in W3C CSP3: documents loaded from local schemes, including `srcdoc`, inherit the source document's policies). Two things the page does not say: (1) the three viewers use `sandbox="allow-scripts allow-same-origin"` (confirmed at `HtmlViewer.tsx:358`, `DiffViewer.tsx:1120`, `RepositoryReference.tsx:52`), so a document script reads `window.parent` and storage directly; a CSP restricts where it can send data and what it can load, not same-origin DOM access, so the headline SEC-01 exposure in RK-1 is not closed by headers. (2) The app is a Next.js 14 static export, which cannot use per-request nonces, so a script-src policy needs `'unsafe-inline'` or build-time hashes, and an inherited `'unsafe-inline'` also allows the documents' inline scripts. The page does label the benefit "a hypothesis until the SEC-01 design uses it", so this is Low.
- **Failure scenario:** The owner approves partly because "headers fix SEC-01". The headers ship; the SEC-01 design finds the actual fix is origin separation, and the CSP only limits exfiltration hosts. The cost of the move was justified by a smaller benefit than implied.
- **Fix:** Change "the main tool for containing scripts" to "a tool for limiting what scripts can load and send; the boundary itself (SEC-01) needs separate-origin or sandbox changes". Mention the static-export inline-script limit as an open question for proof 1b.

### CFH-13 (Low, Bugs): proof 1 compares files, not behaviour

- **Location:** Proof 1 ("every file in `out/` matches the GitHub Pages copy byte for byte").
- **Finding:** Byte parity of files doesn't test URL handling. By default Workers assets use `html_handling = "auto-trailing-slash"`, which 307-redirects `/index.html` to `/` and `/foo.html` to `/foo`; `not_found_handling` defaults to `none` (CFH-5); default headers differ from Pages (the live site sends `cache-control: max-age=600` and `access-control-allow-origin: *`, which the Worker will not send unless `_headers` adds them).
- **Failure scenario:** Parity passes. After cut-over an external page that links `https://mardoc.app/demo.html` or embeds a MarDoc file cross-origin sees a redirect or a missing CORS header it did not before.
- **Fix:** Add a table of request, expected status, redirect target and the headers that matter (a sample of URLs, one unknown path, `/demo.html`, `/favicon.ico`, `/404`) compared between Pages and the staging Worker. Decide on the CORS header explicitly.

### CFH-14 (Low, Compliance): callback URL handling for a second host

- **Location:** §03 ("The callback URL stays `https://mardoc.app/api/auth/callback`"); Q-33; "add `next.mardoc.app` and its callback URL on the test App".
- **Finding:** The GitHub callback-URL page says that when an App has multiple callback URLs, the `redirect_uri` parameter should select one or the first is used, and that wildcard matching, when enabled, matches any subdomain (apps with a single callback URL before 2026-08-03 have it enabled by default). The L1 hard-codes `redirect_uri=https://mardoc.app/api/auth/callback` (design.md line 358) and `Origin: https://mardoc.app` (line 361), with `APP_ORIGIN` as config (line 286). The brief says "unchanged" and doesn't mention `APP_ORIGIN` for staging, wildcard setting, or that the L1 notes a sibling host "revisits the cookie names" (line 283). Because hostile documents already run as `mardoc.app` (SEC-01), a sibling staging host adds little cookie-tossing capability, but the L1 note should be closed with a sentence rather than left open.
- **Failure scenario:** The test App's callback list is `[mardoc.app/..., next.mardoc.app/...]`; the staging Worker sends the L1's fixed `redirect_uri`, so staging sign-in returns to production's callback and fails, or lands on the production Worker.
- **Fix:** Say staging sets `APP_ORIGIN` and `redirect_uri` per environment, that wildcard matching stays off for both Apps (A-11), and record the sibling-host cookie decision in the amended L1.

### CFH-15 (Low, Compliance): the D-2 row is in the wrong table

- **Location:** `docs/plan.md:104`; the page header ("Decision and gate status: plan.md D-2") and its link to `plan.md#decisions`.
- **Finding:** The commit inserted the D-2 row directly under the `GSI` row inside the "Gate 0: review and spikes" table, whose columns are `ID | Item | Proves | Blocks | Model | Owner review | Status`. D-2's cells are decision-table cells (`Decision | Date | Owner | Status | Scope | Links`), so "2026-10-23" lands under "Proves", "Joe Barnett" under "Blocks" and "DRAFT" under "Model". The "Decisions" table (line 198) has only D-1. The page says "gate status lives only in this file", and the link goes to the Decisions section.
- **Failure scenario:** The owner follows the link, finds no D-2 in Decisions, and the Gate 0 table renders D-2 with nonsense columns.
- **Fix:** Move the row to the Decisions table (and, if SP-4 is an item, add its own Gate 0 row per CFH-8).

### CFH-16 (Low, Compliance): the diagram does not show where the access token goes

- **Location:** `diagrams/landscape.drawio` / `.svg` (edges `auth-oauth`, `oauth-auth`, `app-oauth`, `app-api`).
- **Finding:** The owner's credentials question is about where the app, the key and the browser hold credentials. The diagram has edges for the code and verifier to GitHub, the redirect with code back, and the access token from the app to the API, but no edge for the Worker handing the token to the tab (the callback page `postMessage`). The page text covers it (step 4); the picture doesn't, so "the Worker keeps no copy" is not visible in the diagram. The `.drawio` and `.svg` agree on labels (28 text labels match the cells).
- **Failure scenario:** The owner reads the diagram alone, sees the token only on the app-to-API edge, and can't tell how it got into the app.
- **Fix:** Add an edge `auth → app` labelled "access token, once (callback page)" and a note that no copy is kept.

### Nits

- **CFH-17:** The dagger (†) on "60 s", "14 days" and the recommended action is not explained on this page. The sign-in requirements define it as "engineering targets set in this document". Add a one-line legend.
- **CFH-18:** "Reading time: 9 minutes"; the extracted text is about 3,000 words, about 12 minutes at 250 wpm.
- **CFH-19:** “strongly recommends” is quoted as GitHub's words; the GitHub page says "Strongly recommended" against the `code_challenge` and `code_verifier` parameters. Rephrase without quotation marks.
- **CFH-20:** Release step 0 says "No sign-in code" while proof 3 requires `/api/auth/health` to answer throughout. Say whether a health route ships in step 0 (the L1's `health` endpoint is Worker code) and who answers it before the cut-over.

## Claims verified

| Claim | Result | Source |
|---|---|---|
| Static asset requests are free and unlimited | Verified | Cloudflare "Billing and limitations": "Requests to static assets are free and unlimited"; pricing page footnote 3 |
| `run_worker_first` array: matched patterns always invoke the Worker; others serve assets | Verified | Static assets "Binding" page (`run_worker_first` as array of patterns; max 100 entries) |
| Free-plan over-limit gives 429 for those patterns, assets still served | Verified for `run_worker_first` patterns; see CFH-5(b) for the separate route-level 1027 behaviour | "Billing and limitations": "Important note for free tier users" |
| `_headers` applies to static asset responses only, not Worker responses | Verified | "Headers" page: "not applied to responses generated by your Worker code ... have configured `assets.run_worker_first`" |
| `_headers` limits | Not in the brief; noted: 100 rules, 2,000 chars per line | "Headers" page |
| Free plan: 20,000 asset files per version, 25 MiB per file, 100,000 req/day, 10 ms CPU | Verified | Platform limits |
| Workers Builds Free: 3,000 minutes/month | Verified (also 1 concurrent build, 20 min timeout) | Builds limits and pricing |
| Paid plan starts at $5/month | Verified | Workers pricing |
| Workers-only features: Workers Logs, gradual deployments, rate limiting binding, non-root routes | Verified; all four are ✅ Workers / ❌ Pages | Migrate-from-Pages compatibility matrix |
| Custom Domain can't be created on a hostname with an existing CNAME | Verified | Custom Domains page: "You cannot create a Custom Domain on a hostname with an existing CNAME DNS record" |
| A Worker route on a proxied record serves static assets | Not verified as stated; supported indirectly (migration guide: "configure a route if you only wish some subset of paths to be served by your Worker"; routes page: needs a proxied DNS record). The brief marks it inferred; see CFH-4 for the missing early proof | Migrate-from-Pages "Custom domains"; Routes page |
| Most specific route wins; a route without a Worker negates less specific ones | Verified | Routes page |
| Removing `/*` returns traffic to GitHub Pages while `/api/auth/*` keeps working | Plausible from routing rules and SP-1's cut test (criterion 3), not demonstrated for `/*`; and invalidated in practice by CFH-1 | Routes page; SP-1 |
| srcdoc iframes inherit the parent's CSP | Verified | W3C CSP3: local-scheme documents "will inherit a copy of the policies in the source document", listing `srcdoc` |
| The three viewers use `srcDoc` with `sandbox="allow-scripts allow-same-origin"` at the cited lines | Verified | `HtmlViewer.tsx:357-358`, `DiffViewer.tsx:1119-1120`, `RepositoryReference.tsx:51-52` (the page cites `:357`, `:1119`, `:52`, each inside the iframe element) |
| GitHub `expires_in` is always 28800; refresh token 6 months; expiry can be opted out only | Verified | GitHub "Refreshing user access tokens": "The value will always be 28800 (8 hours)"; refresh token "expires after six months"; "Opt-out" setting. Note the page's own caveat: expiring tokens are "currently an optional feature and are subject to change", which the brief doesn't repeat |
| No way to set a 12-hour expiry | Verified by absence: no parameter or setting exists in the cited pages | Same |
| `client_secret` is required even with PKCE | Verified | GitHub "Generating a user access token": `client_secret` "Required" in the token request; `code_verifier` "Strongly recommended" |
| Authorization code lifetime: RFC 6749 recommends at most 10 minutes; GitHub doesn't state its own | Verified | RFC 6749 §4.1.2: "A maximum authorization code lifetime of 10 minutes is RECOMMENDED" |
| Callback URL needs no change in the production App | True in itself; staging needs a second callback and `redirect_uri` handling (CFH-14) | GitHub callback URL page |
| Revocation: user can revoke under Settings, Applications, Authorized GitHub Apps | Verified | GitHub "Reviewing and revoking authorization of GitHub Apps" |
| Domain verification prevents takeover; TXT record must remain | Verified | GitHub "Verifying your custom domain": takeover "after any other change which unlinks the custom domain or disables GitHub Pages" |
| Secrets are hidden after being set | Verified | Cloudflare "Secrets": "not visible within Wrangler or Cloudflare dashboard after you define them" |
| Cloudflare already fronts every request, with `x-github-request-id` from Pages | Verified live | `curl -I https://mardoc.app/`: `server: cloudflare`, `x-github-request-id` present |
| `deploy.yml` builds with `next build`, publishes `out/` to Pages on push to `main`; `public/CNAME` holds `mardoc.app` | Verified | `.github/workflows/deploy.yml`, `public/CNAME` |
| `out/` is 80 files, 5.0 MB | **Not verified** (no `out/` in the worktree; I did not build) | n/a |
| "within 60 s" rollback switch time; "14 days" | Hypotheses, marked † | n/a |
| PAT "often months or no expiry", "often every repo" | **Not verified**; plausible, unsourced | n/a |
| Owner quote “I now have access to switching to cloudflare pages” | **Not verified** (conversation not available to me) | n/a |

## Judgement questions from the caller

- **Is the L0 decision clear and decidable by the owner alone?** Yes. One direction, a named owner, a date, defaults for Q-29..Q-34, and a clear scope boundary. The owner needs the CFH-2 and CFH-3 changes to know what they are overriding (L1 C-14/A-17 and the RK-2 mitigation).
- **Are the proofs reversing and observable?** Partly. They are observable, mostly (headers, `x-github-request-id`, probe, counts), except the CSP part of proof 1 (no threshold) and proof 3's durability (CFH-1). None is marked reversing or shaping (CFH-8). Proof 3 is the first use of the route mechanism and happens on production (CFH-4).
- **Are the rollback steps complete?** No: CFH-1 (re-created by deploy), CFH-10 (`www`), CFH-11 (post-clean-up state), CFH-9 (who can do it).
- **Any one-way door not flagged?** None entirely missed. The practical one-way points are: stopping Pages deploys (time-gated only, CFH-11), domain verification timing (CFH-11), the public README promise (flagged), and Q-30 replacing the owner-only deploy model (CFH-2, CFH-3). Registering the production App (Q-19) is outside this brief.
- **Does it stay at L0?** Mostly. It drifts into implementation in a few places (the five-step OAuth recap, `run_worker_first`, `_headers` rules, route patterns) but each is cited and short, and the owner asked for the sign-in explanation. No finding raised. The L1 changes it implies are larger than it lists (CFH-2).

## Checked and found sound

- **Decision hygiene:** one decision, owner (Joe Barnett), date (2026-10-30, default Q-34), amends ADR 0001 via a new ADR 0002; D-2 and Q-29..Q-34 exist with recommended defaults; outward-facing steps are listed as owner steps after sign-off and agents don't deploy (matches plan.md and C-14 for the owner-does-Cloudflare rule).
- **Writing:** headlines are claims, not labels; `sdlc-doclint` clean; no external resource loads (only two inline scripts/styles; all outbound links are navigation); local links and anchors resolve (`known-issues.md#sec-01-html-isolation`, `plan.md#decisions`, `#how-work-is-done`, `requirements.md#open-questions`, SP-1, ADR 0001, L1 pages).
- **Owner's five mid-task questions:** each has a visible answer on the page: ladder and proofs; 8 h vs 12 h (not possible; stage 2 refresh with a MarDoc cap is the way, and waits for SEC-01); switching back table; credential table and "What Cloudflare keeps"; PAT comparison table that states its own limits (RK-1 and Cloudflare in the path).
- **Honesty about unknowns:** the route-serves-assets assumption is marked inferred, and SEC-01 benefit is marked a hypothesis. The page does not claim CSP fixes SEC-01.
- **Cloudflare/GitHub facts:** every limit and billing figure cited (20,000 files, 25 MiB, 100,000/day, 10 ms, 3,000 build minutes, $5) matches the fetched pages. The Workers-only features list matches the compatibility matrix. `_headers` scope, Custom Domain CNAME restriction, secrets hiding, `expires_in` = 28800, refresh token six months, required `client_secret`, PKCE "Strongly recommended", RFC 6749 §4.1.2 ten minutes, and srcdoc CSP inheritance all check out.
- **Repo citations:** three iframe sites, `deploy.yml`, `public/CNAME`, RK-1/RK-2, F-24, F-28, NF-12, S-23, T-32, C-10, C-12 exist and mean what the page says (F-24 forbids returning/storing/logging a refresh token; NF-12 is the 8-hour credential rule; C-10 and C-12 are the Pages and `/api/auth/*` route constraints the page says it will amend).
- **Credentials story:** the user's password never reaches MarDoc; the client secret is a Worker secret hidden after being set; the state/verifier cookie is HttpOnly and scoped to `/api/auth`; no refresh token in stage 1; the access token is in tab memory only. Each row is consistent with L1 F-24, F-28, F-30 and F-31.
- **Same-origin move:** because the origin does not change, existing `localStorage` PATs survive the cut-over; the page never says this explicitly, and it is worth adding to the user-risk section (not raised as a finding).
- **Diagram:** `.drawio` and `.svg` share the same labels; lanes match the prose (browser, Cloudflare zone, Pages rollback-only, GitHub); proposed components are marked "(proposed)".

## Owner steps (live checks, not run by me)

None of these were run. Each needs the owner and Cloudflare dashboard access:

1. In Cloudflare, confirm the apex record type and whether `www` is a separate record (CFH-10).
2. Before approving, decide whether routes live in Wrangler config or only in the dashboard, and test that a dashboard route deletion survives a Workers Builds deploy on `next.mardoc.app` (CFH-1).
3. On a staging Worker with a Free account, request 200 unknown paths and confirm none count as Worker requests with `not_found_handling = "404-page"` (CFH-5).
4. After one staging sign-in, check Workers Logs for a line containing `code=` (CFH-6).
5. Paste the SP-1 probe output and callback JSON into the SP-1 report (CFH-7).

## Lead dispositions (2026-10-23)

The brief was reshaped rather than patched: the site is served by a code-free Site Worker, and sign-in stays in the L1's separate, owner-deployed Auth Worker.

| Finding | Disposition |
|---|---|
| CFH-1 | Fixed. Routes live only in the dashboard, never in the Wrangler file; proof 2 deletes a route, merges to `main` and checks the route stays deleted. |
| CFH-2 | Fixed. Auth stays in the L1's Auth Worker; the brief names the L1 changes (C-10 and design.md deployment text) and says C-12, C-14, A-17 and Q-25 are unchanged. |
| CFH-3 | Fixed. The client secret is never on the auto-deploy path; RK-2 is unchanged because only the owner deploys the Auth Worker. |
| CFH-4 | Fixed. Staging topology is stated (proxied record of the apex's type, route, staging Site Worker, test-App Auth Worker); a single-page production canary comes before cut-over. |
| CFH-5 | Fixed. The Site Worker has no code and uses `not_found_handling = "404-page"`; proof 1 checks 0 invocations after 500 unknown paths; the Auth route fails closed (Q-31). |
| CFH-6 | Fixed. Logs on by default is stated; production Auth Worker invocation logs off, staging on with the test App (Q-31). |
| CFH-7 | Fixed. The page says SP-1 is owner-reported with results not yet recorded, and what SP-1 did not test; the action asks the owner to paste the results. |
| CFH-8 | Fixed. Proofs are labelled reversing or shaping; the CSP proof is shaping with a pass rule; SP-4 and SP-5 are separate Gate 0 rows. |
| CFH-9 | Fixed. RK-4 added; Q-35 asks the account type and second admin. |
| CFH-10 | Fixed. `www` is in scope with a redirect at clean-up; the apex record type is read from the dashboard and mirrored on staging. |
| CFH-11 | Fixed. Domain verification moves before cut-over; the clean-up gate needs no rollback and owner confirmation; the post-clean-up rollback is described honestly. |
| CFH-12 | Fixed. The CSP is described as limiting loads and exfiltration, not same-origin reads; the static-export hash point is stated. |
| CFH-13 | Fixed. Proof 1 has a URL behaviour table (status, redirect, `cache-control`, `access-control-allow-origin`). |
| CFH-14 | Fixed. Staging sets `APP_ORIGIN` and its callback; wildcard matching off on both Apps. |
| CFH-15 | Fixed. D-2 moved to the Decisions table. |
| CFH-16 | Fixed. The diagram shows the Auth Worker handing the access token to the app once. |
| CFH-17..20 | Fixed: † defined in the header; reading time 12 minutes; "Strongly recommended" quoted as GitHub writes it; step 0 no longer depends on `/api/auth/health` (proof 1 checks it on staging). |

## Re-review

- **Date:** 2026-10-23
- **Fix commit reviewed:** `ec1ec4a` on `design/cloudflare-hosting-l0` ("reshape to code-free Site Worker with separate Auth Worker"), against `91becc9`. Read in full: `strategy.html`, `diagrams/landscape.drawio` and `.svg`, `docs/plan.md` (D-2, SP-4, SP-5), `docs/risks.md` (RK-4), `docs/design/mardoc/requirements.md` (Q-29..Q-35), and the lead dispositions above.
- **Baseline:** `sdlc-doclint` on the new page: 0 errors, 0 warnings. The `.drawio`, the `.svg` and the inline SVG carry the same 28 labels. Docs-only change; `npm run ci` not run. The brief was not edited and nothing was committed.
- **How:** re-read the new page alone first (it is a different design: two Workers, dashboard-only routes, canary), then checked each disposition against the files, then fetched the new external claims (Cloudflare Wrangler configuration, Workers routes, Workers Logs, Workers limits, static-assets HTML handling and Workers Builds configuration pages; the GitHub personal-access-token page). No Cloudflare or GitHub setting was touched.

### Verdict

**The reshape is a real improvement and closes most of the original findings, but it is not yet ready for the owner.** Of the 20 original findings, 16 are Fixed, 3 Partly and 1 Not fixed. The reshape introduced one High: the "code-free, auto-deployed Site Worker" still deploys with a Workers Builds API token that can edit every Worker in the account, so the page's claim that RK-2 is unchanged is not true by default. There is also one Medium defect in the new canary and URL-parity proofs. Both fixes are small and stay inside the brief.

| Severity (new findings) | Count |
|---|---|
| High | 1 |
| Medium | 1 |
| Low | 4 |
| Nit | 1 |

### Original findings

| ID | Status | Evidence |
|---|---|---|
| CFH-1 | Fixed | New page, "The two Workers": "Routes live only in the dashboard"; Q-31 says "never in the Wrangler file"; proof 2 deletes the route, merges a trivial commit to `main` and checks the route stays deleted. Wrangler docs (Source of truth): "To manage routes via the Cloudflare dashboard only, remove any route and routes keys from your Wrangler configuration file." Residue: NCFH-3 (the same doc also requires `workers_dev = false`) and NCFH-1 (the build token has Routes edit). |
| CFH-2 | Fixed | The page now says Auth stays in the L1's owner-deployed Worker, names C-10 and design.md's deployment text as the only L1 changes, and says C-12, C-14, A-17 and Q-25 are unchanged. That matches `requirements.md` C-14 and A-17. Residue: `github-sign-in/architecture.html` (5 mentions of GitHub Pages) and `intent.md` (3) also name Pages; list them when the L1 is amended. |
| CFH-3 | Partly | The client secret is now on the Auth Worker only, which the owner deploys by hand (A-17), so the secret-holding code is off the auto-deploy path. But the claim "RK-2 is unchanged because only the owner still deploys the code that sees tokens" fails: the default Workers Builds API token has Workers Scripts (edit) for the whole account and Workers Routes (edit) for all zones, and Workers Builds is now on the push-to-`main` path. See NCFH-1. |
| CFH-4 | Partly | Staging topology is now stated (same-type proxied record, staging Site Worker on a route, test-App Auth Worker, `APP_ORIGIN` and callback per hostname) and a one-page canary precedes cut-over, so the route mechanism is rehearsed twice. But the canary as written does not exercise asset serving: see NCFH-2. |
| CFH-5 | Fixed | The Site Worker has no script, so unmatched requests are handled by `not_found_handling = "404-page"` and invoke no code (static-assets docs: a script runs for unmatched requests only "if a Worker script is present"). Proof 1 requires 0 invocations after 500 unknown-path requests. The Auth route is set to fail closed (Q-31); the Workers limits page confirms the per-route fail open/closed choice and the 1027 page. Residue: the measurement (NCFH-4) and the over-limit inference (NCFH-7). |
| CFH-6 | Fixed | The page now says Workers Logs is on by default (confirmed: "All newly created Workers will come with the observability setting enabled by default") and that each invocation log has the URL; production Auth Worker invocation logs are off and staging keeps them with the test App (Q-31); "Never stored by MarDoc's design" replaces "Never kept". |
| CFH-7 | Fixed | The page says SP-1 is owner-reported, results not yet recorded, and that SP-1 used a Worker with no assets and no `/*` route; the action asks the owner to paste the results. The SP-1 report itself is unchanged (still "pending"), which is the owner's step. |
| CFH-8 | Fixed | Proofs 1 and 2 are labelled reversing and 3 shaping; proof 3 has a pass rule and "the policy changes, not the hosting decision" on failure; SP-4 and SP-5 are Gate 0 rows in `plan.md` (lines 111-112) with one question each. |
| CFH-9 | Fixed | RK-4 is in `risks.md`; Q-35 asks the account type and the second admin; the operating table says only someone with Cloudflare access can roll back. |
| CFH-10 | Fixed | `www.mardoc.app` is in the situation and scope, with a Cloudflare redirect at clean-up; the apex record type is read from the dashboard and mirrored on staging. |
| CFH-11 | Fixed | Domain verification moved before cut-over; the clean-up gate needs 14 days† with no rollback plus owner confirmation; "After clean-up" in the switching-back table says the rollback is no longer one step. See NCFH-6 (Nit) on ordering against proof 1. |
| CFH-12 | Fixed | Section 01 and the situation now say headers limit loads and exfiltration, not same-origin reads, and that hashes are needed because a static export has no per-request nonce. The new "second origin" wording is NCFH-5. |
| CFH-13 | Partly | Proof 1 now has a URL table (status, redirect target, `cache-control`, `access-control-allow-origin`). But its pass rule "same as GitHub Pages" cannot be met under Workers' default `html_handling`: see NCFH-2. |
| CFH-14 | Fixed | Proof 1 sets `APP_ORIGIN` and the callback per hostname; wildcard matching off on both Apps (A-11); Q-33 repeats it. |
| CFH-15 | Not fixed | The disposition says "D-2 moved to the Decisions table". At `ec1ec4a` D-2 is still `docs/plan.md:104`, inside the Gate 0 table, with decision-table cells under Gate 0 headers ("2026-10-23" under Proves, "Joe Barnett" under Blocks, "IN REVIEW" under Model). The Decisions table (header at line 205) contains only D-1 (line 207). The brief's link `plan.md#decisions` still lands on a table without D-2. Fix: move the row to Decisions; keep SP-4 and SP-5 in Gate 0. |
| CFH-16 | Fixed | The `.drawio` and `.svg` now have the edge `auth-app` "access token, once", the Auth Worker with the secret, and the Site Worker marked "no code; auto-deploys"; the inline SVG matches. |
| CFH-17 | Fixed | The header says "† marks a number we chose, for the owner to review". |
| CFH-18 | Fixed | Reading time 12 minutes; the text is about 2,800 words. |
| CFH-19 | Fixed | The page writes “Strongly recommended”, as GitHub does. |
| CFH-20 | Fixed | Release step 0 no longer depends on `/api/auth/health`; proof 1 checks it on staging. |

### New findings

| ID | Severity | Pass | Location | Finding |
|---|---|---|---|---|
| NCFH-1 | High | Security | "The two Workers" (Deploys row); "What Cloudflare keeps" (RK-2 sentence); risks.md RK-2 and RK-4 | The Workers Builds API token can edit the Auth Worker and every route, so "RK-2 is unchanged" and "no deploy can re-create a route" are not true by default |
| NCFH-2 | Medium | Bugs | Proof 2 (canary); proof 1 (URL table) | The canary route and the "same as GitHub Pages" table conflict with Workers' default HTML handling |
| NCFH-3 | Low | Compliance | "Routes live only in the dashboard"; Q-31 | Dashboard-only routes also need `workers_dev = false`; the Auth Worker's file route (SP-1 config) is not covered |
| NCFH-4 | Low | Bugs | Proof 1 ("0 invocations"); "What Cloudflare keeps" ("writes no invocation logs") | The "0 invocations" and "no invocation logs" checks name no metric or place to read them |
| NCFH-5 | Low | Security | Section 01 "What improves" (a second origin for rendered documents) | A sibling hostname for documents shares cookie scope with `mardoc.app` |
| NCFH-6 | Nit | Compliance | Proof 1 vs "Before cut-over" | Domain verification should precede creating the `next` record |
| NCFH-7 | Low | Bugs | Switching-back table ("Auth Worker passes 100,000 requests a day"); Q-31 | Over-limit text relies on inference for the site route, and the L1's fallback test list does not include a 1027/429 page |

#### NCFH-1 (High, Security): the auto-deployed pipeline holds a token that can replace the Auth Worker

- **Finding:** The page justifies the reshape with "The secret-holding code would deploy on every push to main, which widens RK-2" and concludes "RK-2 is unchanged because only the owner still deploys the code that sees tokens". The secret does stay off the auto-deploy path. But Cloudflare's Workers Builds configuration page says the API token it creates by default has "Account: Account Settings (read), Workers Scripts (edit), Workers KV Storage (edit), Workers R2 Storage (edit); Zone: Workers Routes (edit) for all zones on the account; User: User Details (read), Memberships (read)", and that Workers Builds keeps using this token "for all subsequent builds". Workers Scripts (edit) is account-wide, so the same token that deploys the code-free Site Worker can upload new code to the Auth Worker (secrets persist across uploads), and Routes (edit) can re-create or move any route. Every push to `main` runs repo-controlled commands (the build and the deploy command) in a container that uses this token.
- **Failure scenario:** A routine dependency bump is merged with a malicious install script. The next Workers Builds run executes it. The deploy step is repo-controlled and holds the token; whether the build step also sees it is not stated in the docs I fetched. The script uploads a replacement Auth Worker that forwards every `code` and token to an attacker. The client secret is still bound to that Worker, so the new code can use it. Sign-in works normally. Nothing in the L1, in RK-2 or in the Site Worker's "no secret" property detects it. The same token could add `mardoc.app/*` back after a rollback.
- **Fix:** In the brief and RK-2: (1) create a custom Workers Builds token with only what the Site Worker needs (Workers Scripts edit; drop Routes edit, KV and R2) and say so in Q-30; (2) state that Workers Scripts edit is account-wide, so the Auth Worker's isolation guards against accidents, not against a hostile build; (3) either accept that explicitly in RK-2 (likelihood stays Low with a lockfile, `npm ci --ignore-scripts` where possible, and required review on `main`) or move the Auth Worker out of reach of that token. Replace the sentence "RK-2 is unchanged". SP-5 could add "the Workers Builds token lists only the named permissions".

#### NCFH-2 (Medium, Bugs): the canary and the URL-parity table collide with `html_handling`

- **Finding:** The Cloudflare HTML-handling page (default `auto-trailing-slash`) shows `/file.html` answers "307 to /file" and `/file/index.html` answers "307 to /file". The canary is a route for exactly `mardoc.app/demo.html` (a file in `public/`), and proof 1's table includes `/index.html` and `/demo.html`, to be compared with GitHub Pages, which serves both with 200 and no redirect.
- **Failure scenario:** The owner adds the canary route. A visit to `/demo.html` receives a `307` from the Site Worker to `/demo`; `/demo` is not routed, so GitHub Pages answers it. The `x-mardoc-host` header appears only on the redirect, and the page has not been served by the Worker at all. If the owner reads that as a pass, asset serving is unproven when the `/*` cut-over goes ahead. In proof 1 the table fails on `/index.html` and `/demo.html` even though nothing is broken, so a literal reading ("If it fails: stay on GitHub Pages") rejects the move.
- **Fix:** State the `html_handling` choice in the brief (a one-line configuration decision) or list the accepted differences. Use a canary route on the canonical path (`mardoc.app/demo`) and require a 200 with the header. In the URL table, mark `/index.html` and `/demo.html` as "expected to differ (307)" or configure to avoid it, and add "external links to `/demo.html` still work".

#### NCFH-3 (Low, Compliance): `workers_dev = false`, and the Auth Worker's file route

- **Finding:** The Wrangler docs say that to manage routes in the dashboard only, remove the `route`/`routes` keys "Then add `workers_dev = false`". Without routes in the file, `workers_dev` defaults to `true`, so each Worker (Site and Auth, staging and production) is also reachable on a public `*.workers.dev` URL, with preview URLs. The page and Q-31 say routes stay out of the file but never mention `workers_dev`. Separately, the SP-1 Worker that proof 1 reuses for staging has `routes = [...]` in `docs/spikes/sp-1/wrangler.toml`; redeployed as is, its route is file-managed, and the Auth Worker rollback ("delete its route") has the CFH-1 problem on the next owner deploy.
- **Failure scenario:** The Site Worker is also served at `<name>.<account>.workers.dev`: a second public origin for the app that the zone's headers, routes and rollback do not govern. On the Auth Worker, `/api/auth/login` is reachable on workers.dev with the production secret attached.
- **Fix:** Add `workers_dev = false` (and no `preview_urls`) to both Workers' files in Q-31, and say the Auth Worker's file also carries no routes (the SP-1 config needs that change before reuse).

#### NCFH-4 (Low, Bugs): "0 invocations" and "no invocation logs" are not readable

- **Finding:** Proof 1 passes only if "the Site Worker shows 0 invocations" after 500 unknown paths, and the page says the Site Worker "writes no invocation logs". The docs I fetched say asset requests are free and run no Worker script, and that an invocation log is per Worker invocation, but none say where an assets-only Worker's request count appears in the dashboard or analytics. The statements are plausible but unobserved.
- **Failure scenario:** After 500 requests the dashboard shows 500 "requests" for the Site Worker (asset requests counted as requests, not as billed invocations). The owner cannot tell whether that is a pass or a fail, or whether the check measures anything.
- **Fix:** Say what is read (the Worker's invocation count versus its request count, and a Workers Logs query for zero entries). Add a response header that only a script could set, to prove that no code ran for unknown paths.

#### NCFH-5 (Low, Security): the "second origin" may be same-site

- **Finding:** Section 01 says hosting "a second origin for rendered documents, the likely SEC-01 fix, takes a hostname and a route on a zone MarDoc already controls". A hostname under `mardoc.app` is a different origin but the same site: `localStorage` and the in-memory token are isolated, but cookies set with `Domain=mardoc.app` reach the app. The L1 itself says a sibling host can overwrite the `__Secure-` attempt cookies (`design.md:283-285`) and revisits cookie names for it.
- **Failure scenario:** After the SEC-01 fix a hostile document runs on `docs.mardoc.app`. Its script sets dozens of large `Domain=mardoc.app` cookies. Every later request to `mardoc.app` is refused by the header-size limit until the user clears cookies. The document origin cannot read the token, but it can disable the app for that user.
- **Fix:** Reword as a hypothesis ("a second hostname, or better a separate registrable domain, is an option the SEC-01 design will weigh"). No change to the hosting decision.

#### NCFH-6 (Nit, Compliance): verify the domain before creating the staging record

Proof 1 creates `next.mardoc.app` as a proxied record "of the same type as the apex" (probably pointing at GitHub). The domain verification is "before cut-over" but not before proof 1. GitHub's doc says verification covers immediate subdomains, so doing it first costs nothing. Move it to the start of SP-4.

#### NCFH-7 (Low, Bugs): over-limit behaviour is partly inferred

- **Finding:** The switching-back row says the Auth route fails closed and "the site keeps loading". The first part is a documented setting (limits page: fail open "Bypasses the Worker"; fail closed "Returns a Cloudflare 1027 error page"). The second part is inferred: the fetched billing page speaks to `run_worker_first` patterns only, and the Site route's own mode is not stated. The L1's F-51 test list names a Pages 404, a 503 and a network error, not a 1027 page.
- **Failure scenario:** The Auth Worker passes the Free daily limit. If the Site route's mode is fail closed and the account-wide counter is what trips, a code-free route could return 1027 where the brief expects assets. Or sign-in shows an error that the 5-second fallback does not recognise.
- **Fix:** Set the Site route to fail open while Pages deploys (the fallback serves the same files), say the over-limit behaviour is inferred and cannot be tested, and add a 1027/429 page to the F-51 test list in the L1 amendment.

### Claims checked in the fixes

| Claim | Result |
|---|---|
| An assets-only Worker on a zone route serves assets and is never invoked | Assets are served "without invoking Worker code" and a script runs only "if no matching asset is found and a Worker script is present" (static-assets docs). With no script there is nothing to invoke. Documentation for a route in front of an assets-only Worker over a DNS origin is thin (the routes page steers Worker-as-origin to Custom Domains; the migration guide says to "configure a route if you only wish some subset of paths to be served by your Worker"). The page treats this as proof work (SP-4, SP-5), which is right. |
| Two routes to different Workers; the more specific wins | Verified: "the pattern `example.com/hello/*` would take precedence over `example.com/*`" (Routes page). |
| Routes absent from the Wrangler file are left alone by deploys | Supported by the Wrangler Source of truth section, with the caveat that `workers_dev = false` is also required (NCFH-3). SP-5 tests it. |
| Route fail open/closed | Verified on the Workers limits page: fail open "Bypasses the Worker", fail closed "Returns a Cloudflare 1027 error page", set "by toggling the corresponding route". The routes page itself doesn't describe it, and the default is not stated. |
| Workers Logs is on by default and logs the request URL | Verified on the Workers Logs page (the URL the brief cites): "All newly created Workers will come with the observability setting enabled by default"; the Fetch invocation log message is `<Method> <URL>`. Free-plan retention is three days. |
| A static export can't use per-request nonces | Reasonable for a Next 14 static export; not sourced on the page. |
| PAT lifetime "set by the user, can be no expiry" | Verified on the cited GitHub page: "Infinite lifetimes are allowed but may be blocked by a maximum lifetime policy". |
| `out/` 80 files, 5.0 MB | Not re-measured by me; now attributed to the lead's machine. |

### Checked in the fixes and found sound

- **Design coherence:** the two-Worker split removes the single-deploy secret risk at the application level, keeps the L1 intact (C-12, C-14, A-17, Q-25 unchanged), and makes the Site Worker explainable in one sentence ("a Worker with no code"). Section order, headlines, diagram and the five owner questions still read from the page alone.
- **Rollback story:** the switching-back table has a row per situation, including "After clean-up" and the over-limit case, and removes the earlier contradiction about when rollback stays one step.
- **Proof structure:** two reversing proofs and one shaping proof, each with a pass rule and an "If it fails"; SP-4 and SP-5 in the plan are bounded at half a day each; the ladder adds a canary rung.
- **Operating commitments:** RK-4 and Q-35 exist, the defaults in Q-29..Q-35 agree with the page, and the page's local links resolve (`plan.md#decisions`, `known-issues.md#sec-01-html-isolation`, the review, SP-1, ADR 0001).
- **Diagram:** `.drawio`, `.svg` and the inline SVG agree; the new `auth-app` edge shows the token hand-off.
- **Level:** the page remains L0; the new `html_handling`, `workers_dev` and token details belong in the L1 amendment and spike plans, with at most one line each in the brief.

### Owner steps for the remaining items (not run by me)

1. In Cloudflare, check **My Profile, API Tokens** for the token Workers Builds would use; create a custom token with Workers Scripts (edit) only (NCFH-1).
2. On staging, request `/demo.html`, `/index.html` and `/demo` through the Site Worker and note the status codes (NCFH-2).
3. Confirm `workers_dev = false` in both Workers' files before deploying (NCFH-3).

## Lead dispositions after re-review (2026-10-23)

| Finding | Disposition |
|---|---|
| CFH-15 | Fixed. D-2 now sits in the Decisions table after D-1 (the first move matched a `| D-1 |` inside a Gate 0 cell). |
| NCFH-1 | Fixed by changing the default: no Workers Builds or other pipeline holds a Cloudflare token; the owner deploys both Workers with `wrangler deploy` from a tagged release (Q-30). Automatic deploys are an alternative that needs the owner to accept a wider RK-2. The brief states that releases now wait for the owner. Closes the remainder of CFH-3. |
| NCFH-2 | Fixed. Proof 1's pass rule accepts one redirect to the same bytes and picks `html_handling` from the table; the canary route is `mardoc.app/demo*` and checks `/demo`. Closes the remainder of CFH-4 and CFH-13. |
| NCFH-3 | Fixed. Wrangler files carry no `routes`, `workers_dev = false` and `preview_urls = false`; the SP-1 file is not copied. |
| NCFH-4 | Fixed. The check reads the Site Worker's Metrics → Requests count in the dashboard. |
| NCFH-5 | Fixed. The separate site for documents needs its own registrable domain. |
| NCFH-6 | Fixed. Domain verification comes first, before the staging record. |
| NCFH-7 | Fixed. The Site route's over-limit behaviour is marked inferred and checked by SP-4's count; the L1 change list adds 429 and 1027 to F-51's test. |

## Final check

- **Date:** 2026-10-23
- **Commit reviewed:** `f532e22` on `design/cloudflare-hosting-l0` (changes since `ec1ec4a`): `strategy.html`, the diagram, `plan.md`, Q-30/Q-31. `sdlc-doclint`: 0 errors, 0 warnings. `.drawio`, `.svg` and the inline SVG carry the same labels. Nothing was edited or committed.

**Verdict: the targeted fixes hold. All eight items are closed except one Low (NCFH-7), and the change to owner-only deploys left one stale row and one inverted fallback (NCFH-8, NCFH-9, both Low). Safe to put to the owner once those are looked at.**

| ID | Status | Evidence |
|---|---|---|
| CFH-15 | Fixed | `plan.md:207` is now D-2 in the Decisions table (header at line 204, after D-1). No D-2 row remains in Gate 0; SP-4 and SP-5 stay there. |
| NCFH-1 | Fixed | Q-30 and the page's Deploys row: the owner runs `wrangler deploy` from a tagged release; no pipeline holds a Cloudflare token. The page gives the reason ("Why no automatic deploy") and keeps Workers Builds as an alternative that "needs the owner to accept a wider RK-2". The RK-2 sentence now reads "no pipeline holds a Cloudflare token", which is true under this design. The cost row and recommended action no longer mention Workers Builds. |
| NCFH-2 | Fixed | The canary is the route `mardoc.app/demo*`; `/demo` must answer 200 with `x-mardoc-host` (no 307 hop out of the route, since `/demo.html` redirects to `/demo`, which the route also covers). The URL table uses "same bytes, directly or after one redirect" and decides `html_handling` from the table. |
| NCFH-3 | Fixed | New "Wrangler file" row: no routes, `workers_dev = false`, `preview_urls = false`; Q-31 repeats it; the page notes the SP-1 file listed its route. |
| NCFH-4 | Fixed | Proof 1 now reads the Site Worker's "Metrics → Requests count" and expects 0; the logs claim stays tied to the Site Worker running no code. |
| NCFH-5 | Fixed | The second origin now "needs its own registrable domain, because a subdomain of mardoc.app shares its cookie scope". |
| NCFH-6 | Fixed | "First, before the staging record exists: verify mardoc.app for the GitHub organisation". |
| NCFH-7 | Partly | Labelled "inferred; SP-4 checks the count", and the L1 amendment now adds a 429 and the 1027 page to F-51's test. Still open: SP-4's count check does not test over-limit behaviour, and the Site route's own fail mode (recommend fail open while Pages deploys) is not set. Low; acceptable to carry as a stated inference. |

### New findings

| ID | Severity | Pass | Location | Finding |
|---|---|---|---|---|
| NCFH-8 | Low | Bugs | Switching-back table, "Headers break documents" row | The row still says "Remove the rule from `_headers` and merge", which no longer changes production |
| NCFH-9 | Low | Bugs | "Releases" row; switching-back "Pages is current" | With owner-only deploys the rollback target is tip of `main`, not the last released version |

- **NCFH-8:** Under Q-30 a merge reaches mardoc.app only when the owner deploys a tagged release. The row's fix is therefore "merge, tag, and run `wrangler deploy`"; as written, a header problem stays live after the fix is merged. *Scenario:* a CSP rule breaks documents; a maintainer merges the removal and reports it fixed; the Worker still serves the old `_headers` until the owner redeploys. *Fix:* say "remove the rule, then redeploy; or roll the Worker back one version" (the same step as the Auth Worker row).
- **NCFH-9:** The page now says GitHub Pages "can be ahead of the Worker" during the bake period, but it still calls Pages "current" and treats it as the proven fallback. Pages deploys on every merge, while the Worker serves the last tag, so deleting the route lands users on the newest, unreleased `main`. *Scenario:* the owner releases v1 to the Worker; a later PR that breaks a viewer merges and auto-deploys to Pages; the owner finds a v1 problem and deletes the route, and users get the broken build. *Fix:* during the bake period, build Pages from the same tag as the Worker (a one-line trigger change in `deploy.yml`), or state that the rollback goes to tip of `main` and accept it.

### Checked and found sound

- The reasoning for owner-only deploys uses the right fact (Workers Builds' default token: Workers Scripts edit account-wide, Routes edit on all zones) and costs only a line: "Releases then wait for the owner" appears in Q-30 and the Releases row, so the owner sees the trade.
- The fix for RK-2 is consistent across the page, Q-30, the diagram labels ("owner deploys" on both Workers) and the Recommended action; no stale "auto-deploys" text remains. The Alternatives table keeps the Workers Builds option with its condition.
- SP-5 now tests the real property (the route stays deleted after a later `wrangler deploy`), which is what the Wrangler docs say can undo a dashboard route.

## Lead dispositions after the final check (2026-10-23)

| Finding | Disposition |
|---|---|
| NCFH-7 | Fixed the open part: both routes fail closed (Q-31). The over-limit behaviour of a code-free Worker stays a stated inference. |
| NCFH-8 | Fixed. The row now rolls the Site Worker back one version, then deploys a release without the rule. |
| NCFH-9 | Fixed. During the bake period `deploy.yml` runs on release tags, so GitHub Pages and the Worker serve the same release; the page no longer calls Pages "current" on its own. |
