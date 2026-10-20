#!/usr/bin/env sh
# E2E dans l'image Playwright officielle (Linux), contre la pile Docker de la machine :
# utile là où un navigateur ne démarre pas en local (Firefox bloqué sous Windows).
#   sh scripts/e2e-docker.sh --project=firefox
set -eu
VERSION=$(node -p "require('@playwright/test/package.json').version")
exec docker run --rm --ipc=host \
  -v "$(pwd):/work" -w /work \
  -e CI="${CI:-}" \
  "mcr.microsoft.com/playwright:v${VERSION}-noble" \
  sh -c 'node scripts/forward-ports.mjs & sleep 1; node node_modules/@playwright/test/cli.js test "$@"' -- "$@"
