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

## 2. Reliable Markdown jumps — shipped (#125)

- [x] Use coordinates and quote context to distinguish repeated text.
- [x] Respect base/head and outdated status throughout display and navigation.
- [x] Replace silent failure with explicit missing/ambiguous/outdated feedback.
- [x] Add keyboard-accessible jump controls; dismiss mobile sheet on jump.
- [x] Test formatted, cross-block, repeated and deleted selections.

- [x] Manual acceptance and merge of the Markdown jump PR.

## 3. PR-wide comment navigation — shipped (#126)

- [x] Show comments across files, retaining a per-file view.
- [x] Resolve renamed paths, load the correct document/side and await rendering.
- [x] Carry a pending jump safely through async loading and rapid navigation.
- [x] Distinguish general/file comments from range targets.
- [x] Test reloads, failed loads, removed files and browser history.

- [x] Paginate review comments, general comments, and review-thread resolution.
- [x] Manual acceptance and merge of the PR-wide navigation PR.

## 4. HTML jumps and highlighting — shipped (#127)

- [x] Locate ranges inside the live iframe without resetting its document.
- [x] Scope source-line candidates, then refine by quote/context.
- [x] Highlight without damaging scripts, links or selections.
- [x] Reveal supported collapsed content; report hidden or missing targets.
- [x] Test source/rendered views, multiline elements, dynamic DOM and mobile.

- [x] Manual acceptance and merge of the HTML jump PR.

## 5. Presentation navigation — shipped (#129, #130)

- [x] Detect supported numbered slide containers and explicitly reveal target slides.
- [x] Provide honest unsupported/hidden-target fallback for arbitrary scripts.
- [x] Preserve the live deck and use its controls to select slides and expand notes.
- [x] Validate SVG slide targeting and template-note targeting on the private architectural deck using local fixtures.
- [x] Merge template-note navigation (#130).
- [ ] Live acceptance of presenter-note navigation by the reviewer.

## Foundation scope

Stage 1 supplies location evidence. Stage 2 locates Markdown comments and stage 4
locates HTML comments. Stage 5 adds numbered slide and template-note navigation.
Numbered slides and template-generated notes are supported; other presentation frameworks remain extensions.
Stage 3 loads every REST comment page and GraphQL review-thread cursor. A later
page failure rejects the refresh rather than publishing partial results. If the
initial GraphQL request is unavailable (for example, insufficient token scope),
the existing fallback still shows REST comments without resolution metadata.


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
The stage 3 navigator and per-file panels share this lookup. Markdown viewers consume side/range/status evidence in stage 2. HTML targeting uses the same target metadata in stage 4.


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
static outline. HTML comment creation remains available; stage 4 supplies its rendered jump action.


### PR-wide navigation (stage 3)

All PR comments opens a bounded, scrollable index grouped by document. It includes
pending, resolved and outdated threads, replies, and general discussion. Files
outside the renderable PR manifest remain visible with an unavailable explanation;
general discussion never acquires an invented document target. Per-file panels
remain available for replying and resolving document comments.

Opening a comment selects its document and waits for lazy loading before issuing
a single jump. A newer selection replaces the pending jump; navigation away or
browser history cancels it. A failed load retains the request for Retry document.
Renamed paths use exact-current-path-first matching and only unique old aliases.
Deleted documents can target their base revision. Resolved Markdown comments can
be explicitly highlighted without restoring them to the unresolved list.

Leaving an HTML deck through the index retains its live iframe for Back to review.
HTML comments open the correct file and use stage 4 targeting. Opening the index does not fetch document bodies.
Comment/thread pagination adds requests for large reviews; it does not prefetch
all changed documents.


### Live HTML jumps (stage 4)

An explicit comment jump selects Rendered view and the comment's base/head side,
waits for that iframe document to load, then checks source evidence and the live
DOM. Opening and closing source-line annotations restrict the candidate text;
whitespace-normalized quotes must match uniquely in both the inert source and
the live document. Repeated, changed, missing, unknown and outdated targets have
explicit feedback. A quote-free range receives an element outline labelled as
approximate. HTML range highlights follow the explicitly selected comment. The marker follow-up below adds passive entry points for locatable unresolved comments.

Highlighting uses the feature-detected [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)
with DOM ranges, preserving text nodes, event listeners and the user's selection.
Browsers without that API get containing-element outlines and a fallback message.
Focus moves into the iframe; highlights and temporary focus/outline changes are
cleaned up on the next jump or document disposal. If a script replaces the
highlighted text, the highlight is removed and the reviewer is asked to jump again.
Background comment refreshes do not repeat a jump.

Source Diff hides the existing iframe instead of unmounting it, so returning to
Rendered or jumping from source preserves controls and expanded notes. Selecting
a different base/head revision still loads that revision into the iframe and
resets that revision's runtime state; it is not a cache of two live presentations.
The originating deck remains retained by PR-wide Back to review as in stage 3.

Standard details/summary sections can be expanded after a unique match. Other
hidden content is reported without changing arbitrary presentation classes or
calling deck-specific scripts. Canvas/shadow-DOM text and generated text
without matching source evidence are not supported. Malformed markup or root-only
text that cannot be verified in the inert source fragment may report missing;
the locator does not guess. Supported numbered slides and template notes are described below.


### Oversized-diff submission follow-up

- [x] Recognize GitHub's oversized-diff 422 response as an inline-location failure.
- [x] Preserve fallback comment location, quote and viewed revision across reloads.
- [x] Show PR-conversation status and avoid unsupported native thread controls.
- [x] Keep unsuccessful drafts and remove only confirmed writes before retry.
- [x] Preserve review summary text and final review events on fallback.
- [x] Merge the submission fix (#128); reviewer confirmed successful live submission.

See [large-diff review comments](capabilities.md#large-diff-review-comments) for
conversation-comment behavior and revision limits.

### SVG text and numbered slide follow-up

SVG text/tspan passages now use the same source-verified range locator and CSS
highlighting as HTML text. SVG metadata remains excluded. A narrowly detected
numbered deck (slide elements, one active aria-visible slide, matching position
counter, and Previous/Next buttons) can reveal the target through its own controls.
Each step must synchronously advance exactly one slide; unrecognized decks retain
the hidden-target explanation. No slide classes are rewritten by MarDoc.

Validated locally against the private architectural deck: the saved SVG comment
now moves from slide 1 to slide 7 and highlights its exact quote. The private
document and comment are not committed. Template-generated presenter notes are covered below; other presentation frameworks remain follow-up work.

### Template presenter notes — shipped (#130)

The source locator checks each top-level template independently and requires a
unique quote plus source coordinates before attempting note navigation. This
matters for generated documents that place all notes on one source line.
Ambiguity across ordinary content and templates is reported before navigation.

For the supported numbered deck, `notes-N` identifies the slide, `#notes` hosts
its cloned content, and `#toggle-notes` controls visibility with aria-expanded.
MarDoc uses the deck's Previous/Next and notes buttons, then re-locates the
passage in the live notes container. It never highlights the inert template or
copies its contents itself. Already-open notes stay open. Replacing note text
on subsequent slide navigation clears the old highlight through the existing
mutation check.

Other template conventions, nested templates, cross-template selections, and
quote-free template targets are not automatically navigated. Unknown controls
or mismatched live text produce location feedback instead of guessed highlights.
Validation includes desktop/mobile links, controls, Source/Rendered switching,
and a temporary local comment on the private deck's slide-7 notes. No remote
comment was created.

## Clickable HTML comment markers — ready for review

- [x] Show markers for existing HTML comments without requiring a prior jump.
- [x] Clicking a marker opens and focuses its comment in the panel.
- [x] Validate SVG/deck controls, text-node preservation, links and mobile/keyboard access.
- [ ] Manual acceptance and merge of the marker PR.

### Passive HTML marker behavior

Numbered, keyboard-accessible marker buttons appear beside confidently located,
visible unresolved comments in the currently displayed base/head revision. Markers
also work for SVG text and for presenter notes after the deck has made them visible.
They never navigate slides or expand notes automatically. Outdated, ambiguous,
missing and whole-file comments remain accessible through the existing panels.

Clicking a marker opens the existing comment card, scrolls it into view and focuses
it; on mobile it opens the Comments sheet. Reply, resolution and PR-conversation
limitations remain the same as in the panel.

A zero-size fixed host with isolated styles keeps marker controls separate from
document text and out of source scans. Placement avoids measured text and standard
controls and stacks nearby markers when room permits. If no nearby 44-pixel hit
area fits, that marker is omitted; the comment is still available in the panel.
Marker numbering can therefore have gaps. Scroll/resize/DOM changes schedule one
layout per animation frame; identical polling data does not rebuild controls.
Text changes trigger re-location, while geometry-only updates reuse locations.
Source view, revision changes and unmount dispose the marker layer and listeners.

Validation includes desktop/mobile HTML, SVG slides, cloned notes, hidden sections,
links, changed text, matching-card focus, and observer/animation-frame cleanup.
The actual architectural-deck SVG comment was also checked locally using captured
read-only data: its marker appears on slide 7 and opens the saved comment without
switching slides. No private data is committed.
