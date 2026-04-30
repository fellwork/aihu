#!/usr/bin/env bash
# cloud-setup.sh — paste 'bash .claude/scripts/cloud-setup.sh' into the
# Claude Code cloud env panel as the setup command.
#
# Idempotent — safe to re-run. Bootstraps AGENTS.db + the vendored
# fw-agent-skill so a fresh sandbox is ready for orchestrated sessions.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

SKILL_DIR=".claude/skills/fw-agent-skill"

# 1. Install AGENTS.db CLI if missing (cloud sandboxes start fresh)
if ! command -v agentsdb >/dev/null 2>&1; then
  echo "[cloud-setup] Installing AGENTS.db CLI..."
  curl -fsSL https://raw.githubusercontent.com/krazyjakee/AGENTS.db/main/scripts/install.sh | bash
fi
export PATH="$HOME/.local/bin:$PATH"

# 2. Compile vendored skill into the base layer.
# Uses --replace so re-runs are idempotent (same chunks, every time).
# Skipping `agentsdb init` deliberately — its scanned content is wiped by
# this step anyway, and the playbook says base = canonical methodology only.
if [ ! -d "$SKILL_DIR" ]; then
  echo "[cloud-setup] ERROR: $SKILL_DIR missing — re-vendor the skill." >&2
  exit 1
fi
echo "[cloud-setup] Compiling fw-agent-skill into base layer..."
agentsdb compile --out AGENTS.db --replace \
  "$SKILL_DIR/SKILL.md" \
  "$SKILL_DIR"/references/*.md

# 3. Ensure user + delta layers exist so the MCP server can read them on
# day one. Each gets a placeholder chunk; subsequent writes append normally.
for layer in AGENTS.user.db AGENTS.delta.db; do
  if [ ! -f "$layer" ]; then
    echo "[cloud-setup] Initializing $layer..."
    agentsdb compile --out "$layer" --replace \
      --kind placeholder \
      --text "$(basename "$layer" .db) layer initialized by cloud-setup.sh"
  fi
done

echo "[cloud-setup] Ready. MCP config in .mcp.json; subagents will get agents_search + agents_context_write."
