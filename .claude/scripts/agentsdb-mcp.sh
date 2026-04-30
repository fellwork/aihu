#!/usr/bin/env bash
# Wrapper invoked by .mcp.json. Ensures ~/.local/bin is on PATH so agentsdb
# is found in cloud sandboxes where it isn't on the default PATH.
export PATH="$HOME/.local/bin:$PATH"
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "${BASH_SOURCE[0]}")"
exec agentsdb serve \
  --base  AGENTS.db \
  --user  AGENTS.user.db \
  --delta AGENTS.delta.db \
  --local AGENTS.local.db
