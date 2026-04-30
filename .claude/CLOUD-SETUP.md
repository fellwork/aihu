# Claude Code Cloud Setup

This repo is wired for `fw-agent-skill` + AGENTS.db in Claude Code
cloud sessions and locally.

## Cloud-panel parameter (Anthropic Claude Code Cloud)

The Anthropic Cloud sandbox runs your setup command from `/tmp/init-script-*.sh`,
*not* from inside the repo. So a relative `.claude/scripts/cloud-setup.sh`
path won't resolve. Paste this self-locating one-liner into the
**setup command** field instead:

```bash
SCRIPT=$(find / -maxdepth 6 -path '*/.claude/scripts/cloud-setup.sh' 2>/dev/null | head -1) && cd "$(dirname "$(dirname "$(dirname "$SCRIPT")")")" && bash .claude/scripts/cloud-setup.sh
```

That command:
1. Searches the sandbox filesystem for the vendored cloud-setup script.
2. `cd`s to the repo root.
3. Runs `cloud-setup.sh`, which installs the AGENTS.db CLI, compiles the
   vendored `fw-agent-skill` into the base layer, and seeds empty
   user/delta layers if missing.

The MCP server is auto-registered via `.mcp.json` — once the sandbox is
ready, subagents get `agents_search` and `agents_context_write` tools.

> **Future hardening:** if you can capture the cloud env's repo path
> (e.g. via `pwd` in a session), replace the `find` probe with a direct
> `cd <path> && bash .claude/scripts/cloud-setup.sh` for faster cold starts.

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

## Local use

Run from the repo root (where the relative path resolves fine):

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
