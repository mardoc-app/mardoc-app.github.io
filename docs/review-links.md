# Following links during document review

HTML presenter-note links and Markdown review links resolve relative to the
source file in the repository. For example, `workshop.md#workshop-outcomes`
in `docs/support/architecture.html` opens `docs/support/workshop.md`.
Root-relative paths start at the repository root.

When the target is a changed document in the PR head, MarDoc selects its review
view and keeps the heading anchor in the PR URL as `?anchor=...`. Comments and
suggestions remain attached to that changed file. Browser Back returns within
the same loaded PR without refetching its manifest.

The originating HTML deck stays mounted when following a link to another PR
file. **Back to review** returns to it with its slide, presenter notes and other
in-frame state retained. Only one originating deck is retained; this is not a
persistent browser session across reloads or different PRs.

Links outside the PR open a **Not changed in this PR · Read-only** preview at
the source document's head commit. Links from the base-side HTML view use the
base repository, original path and base commit instead. These reference previews
have no PR commenting or editing controls. Missing or unsupported documents show
an error with a return control rather than navigating the deck to an app 404.
Browser Back or **Back to review** closes a PR reference preview; reopening a
reference is supported, but browser Forward does not reconstruct its transient
preview state.

Standalone repository HTML documents use the same relative-link resolution and
read-only reference preview. External HTTP(S), mail and telephone links open
through the existing external-link handler. Same-document anchors stay inside
the source document. Unsupported URL schemes are blocked.

Link listeners attach directly to the loaded iframe document, rather than
accepting navigation messages from arbitrary frames. They handle dynamically
inserted presenter notes and preserve the original href even when the displayed
hover destination is rewritten. Existing iframe sandbox behavior is unchanged.

Test with the HTML presenter-note browser fixture in `e2e/branch-links.spec.ts`:
follow an in-PR link, return to the deck, follow an outside-PR reference, and test
a missing reference. The unit resolver cases cover parent/root paths, encoded
names, anchors, unsafe schemes and dynamically inserted links.
