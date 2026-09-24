# Comment navigation priorities

Acceptance rule: reach the correct target, or explain why it cannot be located.
Never silently jump to a plausible match. Ship one stage per PR, followed by
desktop/mobile checks and a real-document acceptance pass before merging.

## 1. Accurate comment targets — shipped (#124)

- [x] Preserve path, base/head side, commit IDs and original/current line ranges.
- [x] Keep historical coordinates separate; identify outdated and file comments.
- [x] Recover MarDoc's legacy selection quote without changing the comment body.
- [x] Capture target metadata for pending selection comments.
- [x] Provide exact-path-first, unambiguous rename lookup for the navigator.
- [x] Validate API reloads and historical coordinates with regression fixtures.
- [x] Review and merge the foundation PR.

## 2. Reliable Markdown jumps — in review

- [x] Use coordinates and quote context to distinguish repeated text.
- [x] Respect base/head and outdated status throughout display and navigation.
- [x] Replace silent failure with explicit missing/ambiguous/outdated feedback.
- [x] Add keyboard-accessible jump controls; dismiss mobile sheet on jump.
- [x] Test formatted, cross-block, repeated and deleted selections.

- [ ] Manual acceptance and merge of the Markdown jump PR.

## 3. PR-wide comment navigation — planned

- [ ] Show comments across files, retaining a per-file view.
- [ ] Resolve renamed paths, load the correct document/side and await rendering.
- [ ] Carry a pending jump safely through async loading and rapid navigation.
- [ ] Distinguish general/file comments from range targets.
- [ ] Test reloads, failed loads, removed files and browser history.

## 4. HTML jumps and highlighting — planned

- [ ] Locate ranges inside the live iframe without resetting its document.
- [ ] Scope source-line candidates, then refine by quote/context.
- [ ] Highlight without damaging scripts, links or selections.
- [ ] Reveal supported collapsed content; report hidden or missing targets.
- [ ] Test source/rendered views, multiline elements, dynamic DOM and mobile.

## 5. Presentation navigation — planned

- [ ] Detect supported slide containers and explicitly reveal target slides.
- [ ] Provide honest unsupported/hidden-target fallback for arbitrary scripts.
- [ ] Preserve slide state, expanded notes and Back navigation.
- [ ] Validate with the private architectural deck without publishing its content.

## Foundation scope

Stage 1 supplies location evidence, not a complete locator. Markdown navigation now uses stage 2 location evidence; HTML targeting remains
planned in stages 4–5.
GitHub comment pagination and review-thread pagination also require coverage:
the current loader fetches only the first 100 comments/threads. Include complete
comment enumeration in stage 3 so the PR-wide navigator cannot silently omit work.


### Location contract

`PRComment.target` preserves GitHub's path, side/start-side, commit IDs, current
coordinates, and original coordinates separately. API commit IDs are preserved
as supplied, not asserted to be the current base/head blob revision. A missing
current line with an original line is marked outdated; missing evidence remains
unknown. File-level comments have no range target. Line numbers are not block
indexes.

The legacy leading MarDoc quote format is restored into `selectedText` while
leaving the body unchanged. This is compatibility parsing, not authenticated
provenance: a manually written comment using the same format is indistinguishable.
The future locator must verify quote text against coordinates/context.

`commentFileIndex` prefers exact current paths, then a unique previous filename.
It does not fetch historical revisions or silently choose among ambiguous aliases.
UI integration of this lookup belongs to stage 3. Markdown viewers consume side/range/status evidence in stage 2. HTML targeting
remains a separate stage.


### Markdown jump behavior (stage 2)

The explicit Jump to comment button switches to split view, which keeps base and
head text distinct. Source blocks carry side and line-range annotations. The
locator restricts candidates by those coordinates, validates the quote against
rendered source lines, normalizes whitespace, and requires one matching passage.
Emphasis/link tags and multiple blocks can share one highlight. Older, unknown,
missing, and ambiguous locations produce visible status text instead of a guess.
Comments without quotes can jump to a source block, explicitly labelled as such
rather than claiming an exact text selection.

Within a multiline Markdown block, multiple identical rendered matches remain
ambiguous even if a narrower line might distinguish them; this conservative
fallback avoids inventing a per-character Markdown source map. Complex Markdown
whose isolated source lines cannot reproduce the quote also reports missing.
Mermaid SVG internals are excluded. Preview/suggestion views are not treated as
the reviewed revision: jumping selects split view.

Selecting a card opens its reply controls; jumping is a separate keyboard button.
Mobile jumps dismiss the sheet and focus the highlighted document. Closed sheets
are hidden from assistive technology and inert. Reduced-motion users receive a
static outline. Existing HTML comment creation remains available; its jump action
now explicitly explains that HTML targeting is not implemented yet.
