#!/usr/bin/env bash
# DISPOSABLE SPIKE PROBE (SP-1). Read-only: GET only, prints status codes and
# selected headers, never bodies. Usage: probe.sh routed|cut [asset-path]
set -u
MODE="${1:-}"
ASSET="${2:-/demo.html}"
BASE="https://mardoc.app"
[ "$MODE" = routed ] || [ "$MODE" = cut ] || { echo "usage: $0 routed|cut [asset-path]"; exit 2; }

fails=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; fails=$((fails+1)); }
check() { if [ "$1" = yes ]; then ok "$2"; else bad "$2"; fi; }
hdrs() { curl -sS -o /dev/null -D - -A "mardoc-sp1-probe" -H 'cache-control: no-cache' "$1" | tr -d '\r'; }
code() { printf '%s\n' "$1" | head -1 | awk '{print $2}'; }
val()  { printf '%s\n' "$1" | grep -i "^$2:" | head -1 | cut -d: -f2- | sed 's/^ //'; }
yn()   { if [ -n "$(val "$1" "$2")" ]; then echo yes; else echo no; fi; }
absent() { if [ -z "$(val "$1" "$2")" ]; then echo yes; else echo no; fi; }

echo "== probe $MODE $(date -u +%FT%TZ) =="

H=$(hdrs "$BASE/")
echo "-- GET /  status=$(code "$H") x-github-request-id=$(val "$H" x-github-request-id) cf-cache-status=$(val "$H" cf-cache-status)"
check "$(yn "$H" x-github-request-id)" "criterion 2: / served by Pages (x-github-request-id present)"

H=$(hdrs "$BASE$ASSET")
echo "-- GET $ASSET  status=$(code "$H") x-github-request-id=$(val "$H" x-github-request-id) cf-cache-status=$(val "$H" cf-cache-status)"
check "$(yn "$H" x-github-request-id)" "criterion 2: $ASSET served by Pages (x-github-request-id present)"

H=$(hdrs "$BASE/api/auth/health")
echo "-- GET /api/auth/health  status=$(code "$H") cache-control=$(val "$H" cache-control) age=$(val "$H" age) cf-cache-status=$(val "$H" cf-cache-status) x-github-request-id=$(val "$H" x-github-request-id)"
if [ "$MODE" = routed ]; then
  [ "$(code "$H")" = 200 ] && r=yes || r=no; check $r "criterion 3 routed: /api/auth/health is 200"
  check "$(absent "$H" x-github-request-id)" "criterion 6: no x-github-request-id on routed path"
  [ "$(val "$H" cache-control)" = no-store ] && r=yes || r=no; check $r "criterion 6: cache-control is no-store"
  case "$(val "$H" cf-cache-status)" in HIT|STALE|REVALIDATED|UPDATING) r=no;; *) r=yes;; esac
  check $r "criterion 6: cf-cache-status is not a cache hit"
else
  [ "$(code "$H")" = 404 ] && r=yes || r=no; check $r "criterion 3 cut: /api/auth/health is Pages 404"
  check "$(yn "$H" x-github-request-id)" "criterion 3 cut: x-github-request-id present"
  H2=$(hdrs "$BASE/api/auth/health?cb=$RANDOM$RANDOM")
  echo "-- cache-busted GET  x-github-request-id=$(val "$H2" x-github-request-id)"
  echo "   (INFO criterion 6: same id as plain URL above, repeated hours apart, suggests the edge cached the Pages 404)"
fi

echo "== done: $fails failure(s) =="
[ "$fails" = 0 ]
