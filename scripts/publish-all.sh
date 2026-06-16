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

# Refresh bun.lock to match current package.json versions BEFORE packing.
# changesets/action bumps package.json files in the Release-PR but does not
# update bun.lock — so without this step, `bun pm pack` rewrites workspace:*
# peer deps using stale lock-resolved versions and bakes old version pins
# into the published artifact (observed: @aihu/app@0.1.5 shipped with
# `@aihu/router: 0.1.1` peer despite local router being at 0.1.2).
(cd "$ROOT" && bun install --ignore-scripts >/dev/null 2>&1)

# Topological order: dependencies before dependents.
#
# v1.0.9 (Naming Scheme A) note:
#   - `plugin-data` and `plugin-agent-readiness` are the new homes of the two
#     plugin-contract packages (now published as `@aihu-plugin/data` and
#     `@aihu-plugin/agent-readiness`).
#   - `_moved/data` and `_moved/agent-readiness` are the moved-stub packages
#     that still publish under the legacy `@aihu/data` / `@aihu/agent-readiness`
#     names at v1.0.0 with a single dependency on the new home; they MUST be
#     listed AFTER their new-home counterparts so the dep ref resolves at
#     publish time.
PKGS=(
  "signals"
  "arbor"
  "runtime"
  "agent"
  "plugin-agent-readiness"
  "agent-service"
  "agent-a2a"
  "agent-acp"
  "auth"              # depends on agent-service + signals
  "scraping"          # leaf — middleware for agent services
  "mcp"               # leaf — MCP server, only external sdk dep
  "ai"                # leaf — peer deps only on external sdks
  "context"
  "plugin-data"
  "plugin"
  "router"
  "server"
  "adapter-cloudflare"
  "adapter-vercel"
  "app"
  "seo"               # @aihu/seo SSR/meta helpers; depends on @aihu/plugin + @aihu/server + @aihu-plugin/agent-readiness (must follow them)
  "cli"
  "create-aihu"       # `npm create aihu` entry point; thin delegator — depends on @aihu/cli (must follow it)
  "compiler"
  "css-engine"        # build-time CSS engine; depends on @aihu/compiler (must follow it)
  "primitives"        # headless UI primitives; depends on css-engine + signals + arbor (must follow them)
  "ui"                # @aihu/ui styled-recipe registry; aihu add resolves it from npm (must follow primitives)
  "language-server"   # @aihu/language-server LSP; depends on @aihu/compiler (must follow it)
  "plugin-drizzle"    # @aihu-plugin/drizzle; depends on @aihu/server + @aihu-plugin/data (must follow them)
  "plugin-kindly-note" # @aihu-plugin/kindly-note; depends on @aihu/signals (must follow it)
  "_moved/data"
  "_moved/agent-readiness"
)

DRY_RUN="${1:-}"
NPM_FLAGS="--access public"
[ "$DRY_RUN" = "--dry-run" ] && NPM_FLAGS="$NPM_FLAGS --dry-run"

# Provenance allowlist — pass --provenance only for packages whose npmjs.com
# trusted-publisher config is in place. Setting NPM_PROVENANCE=1 enables it
# for ALL packages (use once every package's OIDC config is done).
# NPM_PROVENANCE_PKGS is a comma-separated list of short names (e.g.
# "signals,arbor,runtime"). Grow it tier-by-tier as you finish npmjs.com config.
PROVENANCE_PKGS=",${NPM_PROVENANCE_PKGS:-},"
PROVENANCE_ALL="${NPM_PROVENANCE:-}"

for pkg in "${PKGS[@]}"; do
  PKG_DIR="$ROOT/packages/$pkg"
  # Resolve the real package name once for logging + idempotency checks.
  PKG_NAME="$(node -p "require('$PKG_DIR/package.json').name")"
  PKG_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"

  # Most packages produce dist/index.js via rolldown; the moved-stub packages
  # ship a root-level index.js (no dist); @aihu/ui is SOURCE-distributed
  # (registry.json + .aihu recipe sources, no build); create-aihu ships a
  # single committed bin.mjs (no build). Allow all four layouts.
  if [ ! -d "$PKG_DIR/dist" ] && [ ! -f "$PKG_DIR/index.js" ] && [ ! -f "$PKG_DIR/registry.json" ] && [ ! -f "$PKG_DIR/bin.mjs" ]; then
    echo "⚠  ${PKG_NAME}: missing dist and no root index.js — run 'moon run :build'. Skipping."
    continue
  fi
  echo ""
  echo "▶  publishing ${PKG_NAME} ..."

  # Idempotency: skip if the version already exists on npm. Mirrors the
  # publish-native pattern in release.yml so workflow re-runs are safe.
  if [ "$DRY_RUN" != "--dry-run" ]; then
    EXISTING=$(npm view "${PKG_NAME}@${PKG_VERSION}" version 2>/dev/null || true)
    if [ -n "$EXISTING" ]; then
      echo "↷  ${PKG_NAME}@${PKG_VERSION} already published — skipping"
      continue
    fi
  fi

  # Per-package provenance opt-in: pass --provenance only when the package
  # is in the allowlist (or NPM_PROVENANCE=1 is set globally). Skipping the
  # flag for unconfigured packages keeps mid-rollout publishes from failing.
  PROVENANCE_FLAG=""
  if [ "$PROVENANCE_ALL" = "1" ] || [[ "$PROVENANCE_PKGS" == *",$pkg,"* ]]; then
    PROVENANCE_FLAG="--provenance"
    echo "   (with --provenance via OIDC trusted publisher)"
  fi

  # bun pm pack rewrites workspace:* → real version range; npm publish
  # then uploads the tarball using npm's auth (which works in CI).
  PACK_DIR="$(mktemp -d)"
  (cd "$PKG_DIR" && bun pm pack --ignore-scripts --destination "$PACK_DIR" >/dev/null)
  TARBALL="$(ls "$PACK_DIR"/*.tgz | head -1)"
  npm publish "$TARBALL" $NPM_FLAGS $PROVENANCE_FLAG
  rm -rf "$PACK_DIR"
  echo "✔  ${PKG_NAME}@${PKG_VERSION} published"
done

echo ""
echo "Done. Verify at: https://www.npmjs.com/search?q=%40aihu"
