#!/bin/sh
# Milestone demo: npm run demo -- m1
# Owner guides live in demos/<m>.md. `m1` runs the scripted part (Part A)
# and writes demos/m1-demo-report.md; any other milestone builds the static
# export and serves it on port 3000.
#
# m1 environment:
#   PLAYWRIGHT_PORT   port for the mocked specs' dev server (config default 3000)
#   REAL_WORKER_PORT  port for the local harness under wrangler dev (default 8787)
# Nothing here reaches GitHub or Cloudflare: GitHub and /api/auth/* are mocked
# or stubbed, and the Worker bundle check runs esbuild locally; nothing uploads.
set -e
milestone="${1:-}"
echo "MarDoc demo ${milestone:-(no milestone)}"

if [ "$milestone" != "m1" ]; then
  npx next build
  npx --yes serve out -l 3000 --no-clipboard
  exit 0
fi

set +e
report="demos/m1-demo-report.md"
logs="$(mktemp -d)"
overall="PASS"
rows=""

# Last "N passed" / "N failed" / "N flaky" / "N skipped" line of a Playwright log.
summary() {
  grep -E '^ +[0-9]+ (passed|failed|flaky|skipped|did not run)' "$1" | sed 's/^ *//' | sed 's/ (.*)//' | paste -sd ',' - | sed 's/,/, /g'
}

row() { rows="${rows}| $1 | $2 | $3 | $4 |
"; }

echo "== 1/5 build the static export"
if npx next build > "$logs/build.log" 2>&1; then
  row 1 "\`next build\` (static export in \`out/\`)" PASS "exported"
else
  row 1 "\`next build\`" FAIL "see build output"; overall="FAIL"
  tail -30 "$logs/build.log"
fi

echo "== 2/5 mocked sign-in journeys, stage 1 gate (T-10, T-11, T-31, M1-4), desktop and mobile"
npx playwright test e2e/sign-in-flow.spec.ts e2e/sign-in-ui.spec.ts \
  e2e/sign-in-stage1-gate.spec.ts e2e/sign-in-journeys.spec.ts > "$logs/mocked.log" 2>&1
code=$?
if [ $code -eq 0 ]; then result=PASS; else result=FAIL; overall="FAIL"; fi
row 2 "Mocked journeys: \`e2e/sign-in-{flow,ui,stage1-gate,journeys}.spec.ts\`" "$result" "$(summary "$logs/mocked.log")"
grep -E '✘|^ +[0-9]+ (passed|failed|flaky)' "$logs/mocked.log" | sed 's/^/   /'

echo "== 3/5 T-32: the real Worker under wrangler dev, GitHub stubbed, Chromium"
REAL_WORKER=1 npx playwright test --project real-worker > "$logs/real-chromium.log" 2>&1
code=$?
if [ $code -eq 0 ]; then result=PASS; else result=FAIL; overall="FAIL"; fi
row 3 "T-32 real Worker, Chromium (\`--project real-worker\`)" "$result" "$(summary "$logs/real-chromium.log")"
grep -E '✓|✘|^ +[0-9]+ (passed|failed)' "$logs/real-chromium.log" | sed 's/^/   /'

echo "== 4/5 T-32: the real Worker, Firefox"
REAL_WORKER=1 npx playwright test --project real-worker-firefox > "$logs/real-firefox.log" 2>&1
code=$?
if [ $code -eq 0 ]; then
  row 4 "T-32 real Worker, Firefox (\`--project real-worker-firefox\`)" PASS "$(summary "$logs/real-firefox.log")"
elif grep -q "Executable doesn't exist" "$logs/real-firefox.log"; then
  row 4 "T-32 real Worker, Firefox" BLOCKED "Playwright's Firefox is not installed (\`npx playwright install firefox\`)"
  [ "$overall" = "PASS" ] && overall="PASS (Firefox BLOCKED)"
else
  row 4 "T-32 real Worker, Firefox" FAIL "$(summary "$logs/real-firefox.log")"; overall="FAIL"
fi
grep -E '✓|✘|^ +[0-9]+ (passed|failed)' "$logs/real-firefox.log" | head -8 | sed 's/^/   /'

echo "== 5/5 the dev harness ships nowhere: out/ and the Worker bundle"
bundle="$logs/bundle"
# Bundle the production entry with esbuild (wrangler's own bundler, from
# worker/node_modules), using wrangler's Workers settings: ESM, the
# workerd/worker/browser export conditions. Nothing here can upload (C-14).
mkdir -p "$bundle"
worker/node_modules/.bin/esbuild worker/src/index.ts --bundle --format=esm --platform=neutral \
  --target=es2022 --conditions=workerd,worker,browser --main-fields=workerd,worker,browser,module,main \
  --sourcemap --outfile="$bundle/index.js" > "$logs/bundle.log" 2>&1
dev_in_out=$(find out -path '*local-auth*' | wc -l | tr -d ' ')
stub_in_out=$(grep -rlE 'stub-github|STUB_GITHUB|ghu_stub|local-auth' out | wc -l | tr -d ' ')
if [ -f "$bundle/index.js" ]; then
  stub_in_bundle=$(grep -cE 'stub-github|STUB_GITHUB|ghu_stub|local-auth' "$bundle/index.js")
  # Source paths in the map are relative to the bundle; count those under the repo's dev/.
  dev_sources=$(node -e 'const fs=require("fs"),p=require("path");const map=process.argv[1];const m=JSON.parse(fs.readFileSync(map,"utf8"));console.log(m.sources.map(s=>p.relative(process.cwd(),p.resolve(p.dirname(map),s))).filter(s=>s.split(p.sep)[0]==="dev").length)' "$bundle/index.js.map")
else
  stub_in_bundle="no bundle"; dev_sources="no bundle"
fi
if [ "$dev_in_out" = 0 ] && [ "$stub_in_out" = 0 ] && [ "$stub_in_bundle" = 0 ] && [ "$dev_sources" = 0 ]; then
  result=PASS
else
  result=FAIL; overall="FAIL"
fi
row 5 "\`dev/\` absent from \`out/\` and from the Worker bundle (esbuild of \`worker/src/index.ts\`, no upload)" "$result" \
  "out/: ${dev_in_out} dev files, ${stub_in_out} files with stub strings; bundle: ${stub_in_bundle} stub strings, ${dev_sources} dev/ sources"

commit=$(git rev-parse --short HEAD)
dirty=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')
pw=$(npx playwright --version 2>/dev/null)
wr=$(worker/node_modules/.bin/wrangler --version 2>/dev/null | tail -1)
cat > "$report" <<EOF
# M1 demo report (Part A, automated)

Generated by \`npm run demo -- m1\` ([scripts/demo.sh](../scripts/demo.sh)); the
owner guide is [m1.md](m1.md).

- **Result: ${overall}**
- Commit: \`${commit}\`$( [ "$dirty" != 0 ] && echo " plus ${dirty} uncommitted tracked changes" )
- Date (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Environment: $(uname -sm), Node $(node --version), Playwright ${pw#Version }, wrangler ${wr}
- Ports: mocked specs on ${PLAYWRIGHT_PORT:-3000}, harness on ${REAL_WORKER_PORT:-8787}

| Step | What | Result | Evidence |
|---|---|---|---|
${rows}
## What this proves and what it does not

- Steps 2 to 4 simulate GitHub. Step 2 mocks the Auth Worker
  and GitHub in the browser (NF-19). Steps 3 and 4 run the real Worker module
  and the real callback page under \`wrangler dev\`, with GitHub stubbed in
  \`dev/local-auth/worker.ts\`; the stub's consent hop is same-origin, so the
  attempt cookie's \`SameSite=Lax\` trip back from github.com is not exercised.
- Not proved here: real GitHub (Part B of [m1.md](m1.md)), the live
  \`mardoc.app\` zone and the five SP-3 browsers (SP-3), Safari and mobile
  browsers against the real Worker, and secret rotation (SP-2).
EOF

echo
cat "$report"
rm -rf "$logs"
case "$overall" in
  FAIL) exit 1 ;;
  *) exit 0 ;;
esac
