#!/usr/bin/env bash
# cloud-setup.sh — paste 'bash .claude/scripts/cloud-setup.sh' into the
# Claude Code cloud env panel as the setup command.
#
# Idempotent — safe to re-run. Bootstraps GBrain (Supabase-backed) so a
# fresh sandbox is ready for orchestrated fw-agent-skill sessions.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

SKILL_DIR=".claude/skills/fw-agent-skill"

# 1. Install gbrain CLI if missing (cloud sandboxes start fresh).
if ! command -v gbrain >/dev/null 2>&1; then
  echo "[cloud-setup] Installing gbrain CLI..."
  if command -v npm >/dev/null 2>&1; then
    npm install -g gbrain || true
  fi
fi
export PATH="$HOME/.local/bin:$PATH"

if ! command -v gbrain >/dev/null 2>&1; then
  echo "[cloud-setup] WARN: gbrain still not on PATH. See https://github.com/garrytan/gbrain for manual install." >&2
fi

# 2. Verify Supabase env vars are set. These must be supplied by the
#    cloud sandbox env panel (or your shell, when running locally).
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "[cloud-setup] WARN: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set." >&2
  echo "[cloud-setup]       Provision a Supabase project (or reuse one) and add both as env vars." >&2
  echo "[cloud-setup]       The gbrain MCP server will fail at first call until they're set." >&2
fi

# 3. Optional: register this skill's docs as a GBrain source so the
#    methodology itself is queryable alongside project knowledge.
#    Uncomment if you want the skill indexed on first run.
# if command -v gbrain >/dev/null 2>&1 && [ -d "$SKILL_DIR" ]; then
#   gbrain sources add "$SKILL_DIR" --label fw-agent-skill || true
#   gbrain sync || true
# fi

echo "[cloud-setup] Ready. MCP config in .mcp.json registers gbrain at project scope."
echo "[cloud-setup] Subagents will get mcp__gbrain__search, mcp__gbrain__put_page, et al."
