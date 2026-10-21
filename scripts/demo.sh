#!/bin/sh
# Milestone demo: npm run demo -- m1
# Builds the static export and serves it; milestone scripts go in demos/<m>.md.
set -e
echo "MarDoc demo ${1:-(no milestone)}"
npx next build
npx --yes serve out -l 3000 --no-clipboard
