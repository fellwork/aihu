#!/usr/bin/env bash
#
# check-storybook-a11y.sh — the Storybook a11y + interaction gate, as ONE
# non-interactive command.
#
# WHY THIS EXISTS
#   The gate has four moving parts — build the static Storybook, assert the
#   required-story set against the BUILT index, serve that build, then run the
#   test-runner (play functions + axe) against the served URL. Until now those
#   four steps existed only as four hand-sequenced `run:` steps inside
#   .github/workflows/storybook.yml, with the server started as a bare
#   background job and never reaped. That shape has two failure modes:
#
#     1. It cannot be run locally as one command, so the gate that blocks merge
#        is not the gate a developer can reproduce before pushing.
#     2. The background `http-server` outlives a failing test run. In CI the
#        runner is torn down anyway so it never showed; locally it leaks a
#        process holding the port, and the NEXT run silently tests a STALE
#        build served by the old process.
#
#   Both are fixed by codifying the sequence here: a trap reaps the server on
#   every exit path (success, test failure, Ctrl-C), and the port is chosen at
#   random from the free ones rather than hardcoded to 6006, so concurrent runs
#   and a stale listener cannot collide.
#
# USAGE
#   bun run check:a11y            # from the repo root
#
#   Requires a Playwright chromium matching the lockfile's playwright version.
#   Locally that is whatever `bunx playwright install chromium` last placed in
#   the ms-playwright cache; in CI storybook.yml installs it explicitly BEFORE
#   invoking this script (browser install is deliberately NOT done here — it is
#   a slow, network-bound, machine-level side effect, not part of the gate).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/4] Building Storybook"
bun run --cwd apps/storybook build-storybook

# Reads apps/storybook/storybook-static/index.json — the ground truth of what
# actually rendered — so it MUST come after the build and before the run.
echo "==> [2/4] Required-story-set gate"
bun scripts/check-required-stories.ts

# Ask the OS for a free port instead of hardcoding one: a leaked server from an
# earlier run, or a second checkout running this concurrently, would otherwise
# make the run test somebody else's bytes.
PORT="$(bun -e 'import net from "node:net"
const s = net.createServer()
s.listen(0, "127.0.0.1", () => {
  const a = s.address()
  console.log(typeof a === "object" && a !== null ? a.port : "")
  s.close()
})')"
test -n "$PORT"
URL="http://127.0.0.1:${PORT}"

echo "==> [3/4] Serving storybook-static on ${URL}"
bunx http-server apps/storybook/storybook-static -p "$PORT" --silent &
SERVER_PID=$!

# EVERY exit path reaps the server — including a non-zero test-runner exit,
# which is the common case this gate exists to produce.
cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ready=0
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "$URL"; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "check:a11y: storybook-static never became reachable at ${URL}" >&2
  exit 1
fi

echo "==> [4/4] Test-runner — play functions + axe"
AIHU_STORYBOOK_URL="$URL" bun run --cwd apps/storybook test-storybook
