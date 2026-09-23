# Sharing and refreshing repository documents

Open a repository document and use **Share branch** to copy a link that follows
the branch, or **Share revision** to copy a link to the exact loaded commit.
**Refresh document** resolves the branch again and reloads its text and images
from that commit. Refreshing a pinned revision keeps that revision.

Recipients need their own GitHub access and connection in MarDoc for private
repositories. Links contain repository, revision and path information; they do
not contain credentials.

## Link format

- Repository: `#/owner/repo`
- Branch: `#/owner/repo/tree/feature%2Ftraining`
- Document: `#/owner/repo/blob/feature%2Ftraining/docs/deck.html`
- Pinned document: `#/owner/repo/blob/<40-character-commit-SHA>/docs/deck.html`
- Pull request: `#/owner/repo/pull/123/files/2`

A branch is one URL segment: slash characters must be encoded as `%2F`.
Each document path segment is encoded separately. Old unencoded links for
branches containing slashes are ambiguous; open the branch and copy a new link.
PR file indices are zero-based within the supported document files, and can
change when files are added or removed from a PR.

## Fetching and cache behavior

A branch document resolves to a commit before fetching its content, tree and
Markdown images. Branch resolution bypasses the browser HTTP cache; concurrent
identical requests share one promise. Completed content is retained only under
a full commit SHA, repository and path. PR base and head documents use their
respective commit SHAs, including fork repositories and renamed base paths.

The content, image and tree caches live in tab memory and have entry and
approximate byte limits. Authentication changes clear them and prevent old
requests from repopulating the new session. Navigation guards prevent late
responses from overwriting a newer document or tree. Existing browser storage
for settings, credentials and drafts is separate from these caches.

Document links do not wait for repository or PR enumeration. PR links fetch the
specified PR directly, even when it is absent from the current sidebar list.
PR document contents load on selection after the changed-file manifest arrives.
Only the selected document’s base/head are fetched; visited documents are reused.
Comments load independently, and a failed file does not block other files.

Large files whose Contents API response has `encoding: "none"` are fetched
through the Git Blobs API using the returned blob SHA. Fetch errors are surfaced
instead of silently turning a failed document into an empty preview.

HTML executes in the existing iframe viewer. This change does not make arbitrary
web applications portable: relative HTML assets still use GitHub raw URLs, and
private external assets may require additional handling. Self-contained decks
avoid that dependency.

Decks that call `history.replaceState` to update their slide URL can still throw
in the `srcdoc` iframe. Rendering and slide controls may work, but slide URL
updates are not supported by this fix; viewer compatibility is separate work.

## Review checklist

1. Open a copied slash-containing branch link in a fresh tab after connecting
   GitHub. Confirm the URL, document and selected branch agree.
2. Advance that branch with a text and image change. Refresh the document and
   confirm both update together.
3. Copy a revision link, advance the branch again, and confirm the revision link
   still displays the original content.
4. Switch quickly between branches and repositories. Confirm late requests do
   not replace the latest document or tree.
5. Open a direct PR HTML-file link, including a self-contained deck larger than
   1 MB. Check rendering, slide controls and review comments.
6. Edit a document, then navigate or refresh. Cancel the discard dialog and
   confirm the edits remain.

Automated coverage lives in `branch-navigation.test.tsx`,
`snapshot-cache.test.ts`, `hash-router.test.ts` and `e2e/branch-links.spec.ts`.
Use `PLAYWRIGHT_PORT=3107 npm run e2e -- e2e/branch-links.spec.ts` when the
default test port is occupied.
