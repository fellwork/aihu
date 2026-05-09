#!/usr/bin/env bash
# publish-all.sh — publish all @aihu/* packages to npm in dependency order.
# Run from the aihu workspace root.
#
# Prereqs:
#   1. npm login  (sets ~/.npmrc token; bun publish reads the same file)
#   2. bun install
#   3. moon run :build  (or run scripts/build-data-compiler.sh for missing pkgs)
#
# Usage:
#   ./scripts/publish-all.sh            # live publish
#   ./scripts/publish-all.sh --dry-run  # dry-run (no network write)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# bun publish does not interpolate ${NODE_AUTH_TOKEN} placeholders that
# actions/setup-node writes into ~/.npmrc. In CI, resolve the token here so
# bun's auth read succeeds. No-op locally where NODE_AUTH_TOKEN is unset.
if [ -n "${NODE_AUTH_TOKEN:-}" ]; then
  echo "//registry.npmjs.org/:_authToken=$NODE_AUTH_TOKEN" > "$HOME/.npmrc"
fi

# Topological order: dependencies before dependents.
PKGS=(
  "signals"
  "arbor"
  "runtime"
  "agent"
  "agent-readiness"
  "agent-service"
  "agent-a2a"
  "agent-acp"
  "context"
  "data"
  "plugin"
  "router"
  "server"
  "adapter-cloudflare"
  "adapter-vercel"
  "app"
  "cli"
  "compiler"
)

DRY_RUN="${1:-}"
FLAGS="--access public"
[ "$DRY_RUN" = "--dry-run" ] && FLAGS="$FLAGS --dry-run"

for pkg in "${PKGS[@]}"; do
  PKG_DIR="$ROOT/packages/$pkg"
  if [ ! -d "$PKG_DIR/dist" ]; then
    echo "⚠  @aihu/$pkg: missing dist — run 'moon run :build'. Skipping."
    continue
  fi
  echo ""
  echo "▶  publishing @aihu/$pkg ..."
  # bun publish rewrites workspace:* → actual version before uploading.
  (cd "$PKG_DIR" && bun publish $FLAGS 2>&1)
  echo "✔  @aihu/$pkg published"
done

echo ""
echo "Done. Verify at: https://www.npmjs.com/search?q=%40aihu"
