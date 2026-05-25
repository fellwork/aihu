# Claude Code Cloud Setup

This repo is wired for `fw-agent-skill` + [GBrain](https://github.com/garrytan/gbrain)
(Supabase + pgvector) in Claude Code cloud sessions and locally.

## Prerequisites — a Supabase project

GBrain stores all durable agent knowledge in Supabase. Before a session
can write or recall anything, the sandbox needs two env vars:

| Env var | What |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key — never expose to a browser |

Set both in the Claude Code cloud panel under **Environment variables**.
Locally, export them in your shell or load via `.env`.

To provision a fresh Supabase project, either run gstack's `/setup-gbrain`
locally first (it auto-provisions via the Supabase Management API) and
copy the resulting credentials into the cloud env, or create one by hand
at https://supabase.com and supply the URL + service-role key directly.

## Cloud-panel parameter (Anthropic Claude Code Cloud)

The Anthropic Cloud sandbox runs your setup command from `/tmp/init-script-*.sh`,
*not* from inside the repo. Paste this self-locating one-liner into the
**setup command** field:

```bash
SCRIPT=$(find / -maxdepth 6 -path '*/.claude/scripts/cloud-setup.sh' 2>/dev/null | head -1) && cd "$(dirname "$(dirname "$(dirname "$SCRIPT")")")" && bash .claude/scripts/cloud-setup.sh
```

That command:
1. Searches the sandbox filesystem for the vendored cloud-setup script.
2. `cd`s to the repo root.
3. Runs `cloud-setup.sh`, which installs the gbrain CLI and verifies the
   Supabase env vars.

The MCP server is auto-registered via `.mcp.json` — once the sandbox is
ready, subagents get `mcp__gbrain__search`, `mcp__gbrain__put_page`,
`mcp__gbrain__add_tag`, etc.

## What's in the repo

| Path | Purpose |
|---|---|
| `.claude/skills/fw-agent-skill/` | Vendored skill — auto-loaded by Claude Code. |
| `.mcp.json` | Registers the `gbrain` MCP server (project scope). |
| `.claude/scripts/cloud-setup.sh` | The cloud-panel setup command. |
| `.claude/scripts/gbrain-mcp.sh` | Wrapper invoked by `.mcp.json`; checks env, starts the gbrain MCP server. |

Durable agent knowledge lives in Supabase, not in tracked files.

## Local use

Run from the repo root:

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
bash .claude/scripts/cloud-setup.sh
```

then open Claude Code in the repo root. The MCP server starts via
`.mcp.json`; the skill auto-triggers when you describe orchestration work.

If you have gstack installed, the equivalent one-liner is `/setup-gbrain`
followed by adding this repo as a source: `gbrain sources add .`.

## Re-vendoring the skill

This repo's `.claude/skills/fw-agent-skill/` is a snapshot. To pull in
upstream skill updates from your `~/.claude/skills/fw-agent-skill/`:

```bash
bash ~/.claude/skills/fw-agent-skill/install-into-repo.sh
```

It re-copies the skill files; existing `.mcp.json`, `cloud-setup.sh`,
`.gitignore` entries are left alone if already present.
