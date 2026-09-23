# Performance measurement and remaining work

MarDoc has no telemetry backend. To record bounded timings in your own browser,
run this in DevTools and reload before following a document link:

```js
localStorage.setItem('mardoc_profile', '1');
```

After the document renders, inspect User Timing in the Performance panel, or:

```js
console.table(performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('mardoc:'))
  .map(({name, duration}) => ({name, milliseconds: Math.round(duration)})));
```

Disable profiling and clear the recorded measures:

```js
localStorage.removeItem('mardoc_profile');
['document-fetch', 'pr-manifest', 'pr-comments', 'mermaid-prepare', 'mermaid-render']
  .forEach(name => performance.clearMeasures(`mardoc:${name}`));
```

Entries contain only fixed operation names and durations. No credentials,
repository names, paths or document content are recorded or sent anywhere.
Each operation retains at most 50 entries, then starts a fresh batch.
Profiling is off by default. Durations include failed operations.

## What the timings mean

- `document-fetch`: obtaining and decoding a body, including cache wait/hit,
  network retries, and the large-file blob fallback.
- `pr-manifest`: changed-file pagination and base/head metadata, without bodies.
- `pr-comments`: fetching and processing PR comments.
- `mermaid-prepare`: preparing editor HTML with diagram rendering if needed.
- `mermaid-render`: finding/rendering diagrams in the displayed diff.

These operations can overlap; do not add their durations. They do not measure
complete time to usable content, browser layout/paint, or every Markdown
conversion. Use a DevTools Performance recording with screenshots and Network
request counts for those. A warmed file cache can make document-fetch nearly
zero while parsing/layout still takes time.

## Repeatable comparison

Use the same device, browser, revision and network conditions. Record several
cold-tab and warm-navigation runs for: a small Markdown document, a large HTML
deck, a diagram-heavy document, and a PR with many documents. Record time to
visible content, request counts/bytes, long main-thread tasks, and memory after
repeated navigation. Never publish private documents, tokens or unredacted HARs
as public fixtures. The automated fixtures are synthetic.

## Improvements with regression coverage

- Selected PR document loading: initial body requests scale with the selected
  file (at most base and head), not every document in the PR. Comments are
  independent; visited bodies are reused.
- Hidden PR tabs: no periodic comment fetches while hidden. Returning to the
  tab requests one refresh. Overlapping polls and post-write refreshes coalesce;
  unmounting cancels scheduled retries and prevents stale comment updates.
- Existing snapshot caching: immutable content reuse, duplicate-request sharing,
  bounded caches, and navigation guards remain in place.

The synthetic 20-modified-document example goes from up to 40 initial body reads
to two, excluding metadata and comments. A hidden tab avoids ten polling cycles
in five minutes. These are request-count improvements, not claims about
production latency. Browser timer throttling already varies by environment.

## Next investigations

Measure before choosing further changes: manifest pagination, sidebar count
queries competing with foreground requests, HTML layout/resize observers,
Markdown diff/conversion costs, Mermaid rendering, retained document memory,
and cancellation of obsolete requests. The current changes do not establish
that every performance issue is solved. Track slow real-world cases with a
revision and timing report so each additional optimization has a reproducible
baseline and a regression test.

## HTML iframe resize batching

Standalone HTML and PR HTML viewers share `src/lib/iframe-resize.ts`. DOM mutation
callbacks, resource loads, font completion and the existing delayed checks request
one measurement on the next animation frame. The helper reads
`document.documentElement.scrollHeight` at most once per scheduled frame and posts
only when that measured value changes. Text-node changes are also observed.

The parent still uses the existing height plus 20-pixel padding; this is not a
new sizing algorithm. In particular, this change does not solve all shrink-to-fit,
viewport-dependent deck layout, or slide-history compatibility issues. No window
resize or ResizeObserver feedback loop is introduced.

The synthetic browser fixture delivers 50 mutation callbacks before a paint and
asserts one scrollHeight read in both viewers, on desktop and mobile. Tests also
check expanding/collapsing notes, delayed image growth, unclipped end content and
settled iframe height. Unit tests cover unchanged-height suppression and font
completion. This measures resize work, not end-to-end page-load speed.

Run `npm run e2e -- e2e/iframe-resize.spec.ts` against a built static export in CI,
or the development server locally. When reviewing a real deck, test slide changes,
notes, resource loading and narrow layouts before merging. Private deck fixtures
must remain outside the public repository.
