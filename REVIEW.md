# Review rubric: MarDoc

How every design and code review in this repo is done. The `sdlc:review`
skill and its `reviewer` and `security-reviewer` agents follow it. Reports
go in `docs/reviews/`.

## Three passes

Run all three, in this order, and tag each finding with its pass.

1. **Bugs:** wrong behaviour in a realistic case. Logic errors, races,
   error paths, data loss, resource leaks, broken invariants (I-n), edge
   cases at boundaries, and tests that claim more than they check.
2. **Security:** trust boundaries, input handling, authentication and
   authorization, secrets, injection, unsafe defaults, fail-open paths and
   the supply chain (new or changed dependencies).
3. **Compliance:** the work matches what was agreed. The requirements (F-n,
   NF-n, C-n), the design and its invariants, the accepted ADRs, and the
   slice plan (`docs/plan/WP-n.md`): files, order and proof. Tests carry the
   requirement IDs they prove. Docs changed with the behaviour.

## Severity

- **High:** breaks a requirement, loses data, or is a security or safety
  hole. Fix before acceptance.
- **Medium:** wrong in a realistic case, or a design that will cost rework.
  Fix, or defer with an owner-visible backlog ID (AT-n or DEBT-n).
- **Low:** quality, clarity, robustness at the edges.
- **Nit:** style. **At most five per review**; drop the rest.

## Every finding has

ID (`<review>-n`) · severity · pass · location (file:line or doc section) ·
finding · **a concrete failure scenario** (inputs, sequence, result;
"reproduced" when it was) · fix. A finding without a failure scenario is not
recorded.

## Out of scope

- Generated files (lockfiles, generated code, exported diagrams, vendored
  third-party code).
- Anything CI already enforces: formatting, lint rules, the layout check,
  type checks. Report a CI gap as one finding, not each instance.

## What a review decides

- Findings never approve or block a PR on their own. The verdict says
  whether the work is safe for owner acceptance and what must be fixed
  first; the lead and the owner decide, and record dispositions in an ADR
  when the design changes.
- Every review lists what it checked and found sound.
- A re-review gives every finding a status with evidence.

## Project-specific checks

- The static export still builds (`output: "export"`); there are no server-only APIs or routes.
- Credentials and document content never reach a third-party host other than GitHub, unless the user configured one (for example, the AI feedback endpoint).
- `docs/data-and-security.md`, `docs/capabilities.md` and `docs/known-issues.md` match the behaviour after the change.
- e2e specs that seed `localStorage.mardoc_github_token` keep working.
