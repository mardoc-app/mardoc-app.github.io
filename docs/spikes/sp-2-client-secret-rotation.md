# SP-2: Two GitHub App client secrets live at once

Date: 2026-10-21. Time box: 2 days, starting when the owner deploys. Agent: spiker (Sonnet 5.5).
Informs: the operating commitment row (client secret rotation) on the L0 page [strategy.html](../design/github-sign-in/strategy.html).
**Status: built, awaiting owner deploy.** Shares the Worker and runbook with [SP-1](sp-1-github-sign-in.md).

## Question

Can two GitHub App client secrets be live at once, so the secret can be rotated without downtime?

- **PASS:** with `CLIENT_SECRET_A` and `CLIENT_SECRET_B` both set, `/api/auth/login?secret=a` and `?secret=b` each complete a round trip returning the GitHub login.
- **FAIL:** GitHub refuses to generate a second secret, or one of the two exchanges fails while both exist.
- **Dependencies:** SP-1 deployed (same Worker, same test App).
- **Blocks on failure:** the zero-downtime rotation claim; rotation would need a brief sign-in outage window.

## Method

The SP-1 Worker (`docs/spikes/sp-1/worker.mjs`) picks `CLIENT_SECRET_A` or `CLIENT_SECRET_B` from `?secret=a|b` at login and remembers the choice in a short-lived cookie for the callback. The owner follows **step 7 of the runbook in [sp-1-github-sign-in.md](sp-1-github-sign-in.md#owner-runbook)**: generate secret B while A exists, `npx wrangler secret put CLIENT_SECRET_B`, then complete a round trip with each. The optional last part deletes A and confirms B still works and A fails.

**Simulated parts and remaining limits:** pre-deploy, `docs/spikes/sp-1/check.mjs` proves only that `secret=b` sends `CLIENT_SECRET_B` (stubbed GitHub). Whether GitHub accepts both secrets is unproven until the owner runs step 7. GitHub's docs don't say.

## Prototype

Disposable; see SP-1. No separate artifact.

## Results

| Case | Setup | Result | Measurement |
|---|---|---|---|
| A alone | step 5 | pending | |
| A and B both set, `?secret=a` | step 7.3 | pending | |
| A and B both set, `?secret=b` | step 7.3 | pending | |
| A deleted, `?secret=b` / `?secret=a` | step 7.4 | pending | |

## Conclusion

Pending.

## Recommendation

Pending. If yes, the operating commitment row can promise rotation without downtime: add B, switch the Worker, delete A.

Decision: pending, no ADR expected beyond ADR 0001's operating notes.

## Cleanup

Owner cleanup is runbook step 10 (delete both secrets).
