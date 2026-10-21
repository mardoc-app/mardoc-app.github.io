# MarDoc: intent

- **Author:** {{OWNER_NAME}}
- **Written with:** {{AUTHOR_AGENT}}
- **Date:** 2026-10-20
- **Status:** {{STATUS}} (draft until the owner has corrected it)

This document says what the owner wants and why, in the owner's words. It
comes before [requirements.md](requirements.md), which turns it into
testable requirements. If this document and the requirements disagree, this
document is corrected first, by the owner.

## Problem

{{PROBLEM}}

<!-- Two to five sentences. Who has the problem, what goes wrong for them today,
and why it matters now. No solution yet. Example: "I review every deploy by hand
and miss failures that happen after I log off." -->

## Proposed outcome

{{OUTCOME}}

<!-- What is true for the user when this is done. Observable, not technical.
Example: "A failed deploy pages me with the cause and a one-click rollback." -->

## Affected users and systems

| Who or what | How it is affected |
|---|---|
| {{USER_OR_SYSTEM}} | {{EFFECT}} |

Add one row per user group or system that changes, is called, or must keep working.

## Constraints

- {{CONSTRAINT}}

<!-- Things the owner has fixed: platform, budget, data location, licence,
deadline, tools that must or must not be used. These become C-n rows. -->

## Out of scope

- {{OUT_OF_SCOPE}}

## Owner's statements

The inputs the requirements come from, in the owner's own words. Quote them.
If a statement is paraphrased, say so.

| Ref | Statement | Source |
|---|---|---|
| S-1 | "{{OWNER_QUOTE}}" | {{SOURCE}} |

Add one row per distinct wish or rule. Source is Brief (written by the
owner), Session (said while brainstorming), or the event that raised it
(for example "M1 acceptance" or "incident 2026-01-04").

## Open questions

| ID | Question | Recommended default | Status |
|---|---|---|---|
| Q-1 | {{QUESTION}} | {{DEFAULT}} | PENDING |

Add one row per open point. Work continues on the default. When the owner
answers, set Status to DONE and write the answer and date in the default
column.
