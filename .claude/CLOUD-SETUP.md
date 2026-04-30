# Claude Code Cloud Setup

This repo is wired for `fw-agent-skill` + AGENTS.db in Claude Code
cloud sessions and locally.

## Cloud-panel parameter

Paste this into the Claude Code cloud env's **setup command** field:

```
bash .claude/scripts/cloud-setup.sh
```

That single command:
1. Installs the AGENTS.db CLI in the sandbox (`~/.local/bin/agentsdb`).
2. Runs `agentsdb init` if `AGENTS.db` is missing (default offline `hash` embedder — no API key needed).
3. Compiles the vendored `fw-agent-skill` into the base layer.

The MCP server is auto-registered via `.mcp.json` — once the sandbox is
ready, subagents get `agents_search` and `agents_context_write` tools.

## What's in the repo

| Path | Purpose |
|---|---|
| `.claude/skills/fw-agent-skill/` | Vendored skill — auto-loaded by Claude Code. |
| `.mcp.json` | Registers the `agentsdb` MCP server (project scope). |
| `.claude/scripts/cloud-setup.sh` | The cloud-panel setup command. |
| `.claude/scripts/agentsdb-mcp.sh` | PATH-safe wrapper invoked by `.mcp.json`. |
| `AGENTS.db` | Base layer — committed. |
| `AGENTS.user.db`, `AGENTS.delta.db` | Earned + proposed layers — committed. |
| `AGENTS.local.db` | Session scratch — gitignored. |

## Local use (same setup)

```bash
bash .claude/scripts/cloud-setup.sh
```

then open Claude Code in the repo root. The MCP server starts via
`.mcp.json`; the skill auto-triggers when you describe orchestration work.

## Re-vendoring the skill

This repo's `.claude/skills/fw-agent-skill/` is a snapshot. To pull in
upstream skill updates from your `~/.claude/skills/fw-agent-skill/`:

```bash
bash ~/.claude/skills/fw-agent-skill/install-into-repo.sh
```

It re-copies the skill files; existing `.mcp.json`, `cloud-setup.sh`,
`.gitignore` entries are left alone if already present.
