#!/usr/bin/env bash
# Wrapper invoked by .mcp.json. Starts the GBrain MCP server (stdio) with
# Supabase credentials sourced from environment.
#
# Required env vars (set via the Claude Code cloud env panel, or .env locally):
#   SUPABASE_URL              — your Supabase project URL
#   SUPABASE_SERVICE_ROLE_KEY — service-role key (server-side only)
#
# If your gbrain version uses a different subcommand for the MCP server,
# run `gbrain --help` and adjust the final exec line.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "${BASH_SOURCE[0]}")"

if ! command -v gbrain >/dev/null 2>&1; then
  echo "[gbrain-mcp] gbrain CLI not installed. Run gstack's /setup-gbrain or .claude/scripts/cloud-setup.sh first." >&2
  exit 1
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "[gbrain-mcp] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set." >&2
  exit 1
fi

exec gbrain mcp serve
