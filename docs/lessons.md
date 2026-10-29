# Lessons: MarDoc

How to read this document: each row is a lesson that passed the quality
gate in `sdlc:improve` (generalizable, evidence-backed, actionable). "Applies
when" is the trigger a planner uses to copy the lesson into a slice plan.
"Promoted to" says where it is now enforced; an empty cell means it lives
only here.

| L-n | Date | Source | Lesson | Evidence | Applies when | Promoted to |
|---|---|---|---|---|---|---|
| L-1 | 2026-10-20 | Review M2 (M2-1, M2-5) | When a change replaces stored state, keep what it replaced so undo and expiry can restore it. | M2-1 reproduced: an expiring allow deleted a permanent block; fixed in `{{SHA}}`. | Writing code that overwrites or deletes stored records | `AGENTS.md`; test `f12_temporary_allow_restores_block` |

Add one row per lesson with the next L-n. Source is a review finding, an
AT-n, an incident, a spike or a session. Evidence is a commit, a test or a
reproduction. When a lesson moves up the ladder (guidance line, skill or
checklist, hook or test, eval), fill in "Promoted to" and remove the old
line in the same commit.

## Archive

| L-n | Archived | Reason |
|---|---|---|
| L-0 | 2026-10-20 | Superseded by L-1 |

Lessons are archived, never deleted. Reasons: superseded by L-n, stale
(the code or tool it names is gone), or promoted into a hook or test that
makes the prose redundant.
