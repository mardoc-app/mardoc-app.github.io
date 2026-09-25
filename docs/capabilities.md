# Capabilities and workflows

Reviewed against `4abb8f5` on 2026-09-23. See [known issues](known-issues.md) for implementation gaps and [data storage](data-and-security.md) before relying on draft recovery or document isolation.

## Document support

The file picker and repository filters recognize `.md`, `.mdx`, `.html`, and `.htm`. MDX files use the Markdown pipeline; there is no MDX/React component execution pipeline.

| Capability | Markdown | HTML |
| --- | --- | --- |
| Render repository or local files | Yes | Yes, including document CSS/scripts |
| Rich editing | TipTap editor | Not implemented |
| Source view | Editable Markdown code view | Read-only HTML source view |
| PR comparison | Inline Diff, Split, Suggest, Preview | Rendered base/head toggle and Source Diff |
| Select text and queue PR comments | Yes | Yes, source-line attributes reported from iframe |
| PR replies, resolution, review submission | Shared PR review flow | Shared PR review flow |
| Propose paragraph suggestions | Yes | No equivalent HTML workflow |
| Paste/drop repository image upload | Markdown editor | No equivalent HTML workflow |
| Draft recovery | Existing repository Markdown files | No HTML editor draft flow |

## Review an existing PR

Open the PR, select a document, choose a view, and select a passage to comment. File panels filter inline comments to the selected file; general PR comments have no file association and are excluded from these panels. Pending inline comments remain local until you finish the review. Refreshing or leaving the review can lose unsubmitted work; there is no cross-device pending queue.

Finish the review with a comment, approval, or request for changes. Normally the pending comments are sent together through GitHub's review endpoint. If GitHub rejects source-line mappings or reports a diff too large to comment on, the app tries individual inline comments and then PR conversation comments for known location failures. These fallback comments carry file, line, quote and revision context so MarDoc can restore their jump targets on reload. A visible notice explains the fallback. Failed writes keep the unsent drafts; confirmed comments are removed from the queue so a retry does not resend them. General PR comments can be posted immediately. Replies and resolution changes also write directly to GitHub.

Accepting a suggestion applies one line-range replacement to the current PR branch. Batch acceptance in one commit and reliable outdated-suggestion protection remain unfinished. GitHub permissions and branch rules still govern writes.

## Edit or create Markdown

Open a file and edit in rich or code view. The editor offers an edit-to-PR action, but its existing-file save path currently calls the new-file helper without the SHA required for an update; treat this as an open save bug, not a reliable overwrite workflow. A new document can create a branch and PR; the add-file-to-PR flow commits to the existing PR head branch. See [EDIT-02](known-issues.md#edit-02-existing-file-edit-to-pr-save-path).

The rich editor normalizes Markdown through Showdown, TipTap, and Turndown. Conversion is not lossless: unsupported HTML can be stripped or flattened, HTML comments and table spans have known failures, and table cell serialization loses inline formatting. Inspect source changes before submitting documents with complex formatting. Switching to code view after normalization does not recover content already lost in conversion.

Existing repository Markdown drafts are saved after a short edit debounce and can be offered for restoration when reopened. New files, browser-local files, and pending comments do not have this recovery. Storage failures silently disable persistence.

## Start a review from a file

Markdown and HTML viewers can collect comments outside a PR and create a review PR. The current `createReviewPR` implementation creates a fresh branch from the repository's default branch and appends a space to create a diff; it includes the comments in the PR description and attempts inline comments individually.

This does not implement the original story's selected-branch/existing-PR reuse behavior. A document viewed on another branch can differ from the default-branch version used for the review PR. Prefer an existing PR when reviewing branch-specific changes. See [feature 003](features/done/003-comment-to-pr.md).

## Images

The Markdown editor accepts PNG, JPEG, GIF, WebP, and SVG uploads up to 5 MiB. The default folder is `docs/images`; a per-repository browser preference can change it.

For existing documents, paste/drop commits the image immediately to the selected branch, before the document's edit-to-PR action. Abandoning the document edit does not undo that upload. New-file images use temporary blob URLs and are committed during the save flow. Demo mode and local-only files reject uploads.

HTML presenter-note links and Markdown PR-review links can open changed documents in their PR review view, including heading anchors. Other repository documents open in a commit-pinned read-only reference preview. Returning to the originating deck preserves its slide and notes within the current PR session. See [review links](review-links.md) for behavior and limitations.

Repository Markdown images use URL rewriting and authenticated loading. HTML asset rewriting is a separate path; do not assume private-repository assets or relative assets in HTML PR views have identical support. The browser cannot read neighboring local files merely because one document was opened with its file picker.

## Runtime modes

| Mode | Available behavior | Boundary |
| --- | --- | --- |
| Demo | Sample documents/PRs, rendering, editing, local review interactions | Writes do not reach GitHub; image uploads are disabled; not every connected workflow is simulated. |
| Connected browser | Repository browsing, PR review, Markdown commits and uploads | PAT permissions, branch rules, and GitHub availability apply. |
| Local file in browser | File-picker loading; Markdown editing or HTML viewing | No general filesystem access or automatic disk write-back. New/local drafts are not recovered by the repository draft store. |
| VS Code embed | App-side init/save/image/reload messages and embedded UI | Requires the separately maintained extension; this repository cannot certify its installed behavior. |
| Mobile | Layout below 768px, navigation drawer, review comment sheet | Split mode is hidden; swipe-file navigation and forced tablet/mobile preference remain unfinished. |

Use `?` for the in-app keyboard list and `Cmd/Ctrl+Shift+P` for the command palette. Embed reload is also exposed as a toolbar action; webview shortcut routing depends on the host.


### Large-diff review comments

GitHub may render a file too large for its review diff even when MarDoc can render
the complete HTML document. The API's `Diff entry … diff is too large` response is
a known location failure, alongside unresolved diff lines. MarDoc can post that
feedback to the PR conversation, preserving a readable filename/line heading and
a versioned location marker. Review summary text and approval/change-request events
are still submitted separately when required. GitHub documents review creation
and its validation responses in the [review API reference](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).

Conversation comments are labelled in the document panel. They can be jumped to
in MarDoc, but GitHub does not provide inline thread resolution or native suggestion
acceptance for them. Replies appear as PR conversation comments. Fallback targets
are pinned to the viewed commit; a changed revision is labelled outdated rather
than reusing historical line numbers. Older fallback comments without the new
location marker remain general discussion. The marker is location evidence, not
authenticated provenance; the rendered locator still verifies the passage.

If a fallback write fails, submission stops and unsent comments remain pending in
the current tab. Confirmed earlier writes are removed from the queue, including
when the final approval/review event fails. Authentication errors and uncertain
network errors do not trigger a second comment type automatically. A lost server
response still cannot prove whether a write happened; check GitHub before manually
retrying such an error. Pending drafts are not restored after reloading the tab.
