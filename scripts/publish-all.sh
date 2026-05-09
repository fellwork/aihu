#!/usr/bin/env bash
# publish-all.sh — publish all @aihu/* packages to npm in dependency order.
# Run from the aihu workspace root.
#
# Strategy: `bun pm pack` rewrites `workspace:*` deps to real version ranges
# at pack time, then `npm publish <tarball>` uploads using npm's auth. This
# split sidesteps `bun publish` failing to read the ${NODE_AUTH_TOKEN}
# placeholder that actions/setup-node writes into ~/.npmrc — npm resolves
# that placeholder; bun does not.
#
# Prereqs:
#   1. npm login  (or NODE_AUTH_TOKEN env in CI via setup-node)
#   2. bun install
#   3. moon run :build  (or scripts/build-data-compiler.sh for missing pkgs)
#
# Usage:
#   ./scripts/publish-all.sh            # live publish
#   ./scripts/publish-all.sh --dry-run  # dry-run (no network write)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

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
NPM_FLAGS="--access public"
[ "$DRY_RUN" = "--dry-run" ] && NPM_FLAGS="$NPM_FLAGS --dry-run"

for pkg in "${PKGS[@]}"; do
  PKG_DIR="$ROOT/packages/$pkg"
  if [ ! -d "$PKG_DIR/dist" ]; then
    echo "⚠  @aihu/$pkg: missing dist — run 'moon run :build'. Skipping."
    continue
  fi
  echo ""
  echo "▶  publishing @aihu/$pkg ..."

  # Idempotency: skip if the version already exists on npm. Mirrors the
  # publish-native pattern in release.yml so workflow re-runs are safe.
  PKG_NAME="$(node -p "require('$PKG_DIR/package.json').name")"
  PKG_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
  if [ "$DRY_RUN" != "--dry-run" ]; then
    EXISTING=$(npm view "${PKG_NAME}@${PKG_VERSION}" version 2>/dev/null || true)
    if [ -n "$EXISTING" ]; then
      echo "↷  ${PKG_NAME}@${PKG_VERSION} already published — skipping"
      continue
    fi
  fi

  # bun pm pack rewrites workspace:* → real version range; npm publish
  # then uploads the tarball using npm's auth (which works in CI).
  PACK_DIR="$(mktemp -d)"
  (cd "$PKG_DIR" && bun pm pack --ignore-scripts --destination "$PACK_DIR" >/dev/null)
  TARBALL="$(ls "$PACK_DIR"/*.tgz | head -1)"
  npm publish "$TARBALL" $NPM_FLAGS
  rm -rf "$PACK_DIR"
  echo "✔  ${PKG_NAME}@${PKG_VERSION} published"
done

echo ""
echo "Done. Verify at: https://www.npmjs.com/search?q=%40aihu"
