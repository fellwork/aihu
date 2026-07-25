# Installing & Using

This skill needs **one** thing in place: the skill files where Claude Code can find them. After that, Claude auto-loads the skill when you describe orchestration work.

GBrain (Supabase + pgvector) as an MCP server is an **optional upgrade**, not a prerequisite. Without it the team runs on the **file substrate** — durable artifacts committed under `docs/plans/`, `docs/lessons/`, `docs/domain-hints/`, `docs/architecture/` — which is the default and is fully sufficient. Steps 3–4 below are only for the optional gbrain path.

> **Whichever you end up with, the Team Lead resolves it at session start** with the Step 0 preflight in `SKILL.md` (`ToolSearch query: "gbrain search put_page get_page"`). Two things make this non-negotiable:
> 1. **The tool namespace follows the registered server NAME**, and project scope and user scope frequently disagree — a user-scope `gbrain-local` yields `mcp__gbrain-local__*`, not `mcp__gbrain__*`.
> 2. **A misconfigured server fails silently.** `.claude/scripts/gbrain-mcp.sh` exits before starting unless both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported, and nothing in the session reports it. See `references/middleware.md`.

---

## Prerequisites

| Need | Check with | If missing |
|---|---|---|
| Claude Code | `claude --version` | https://claude.ai/install |
| Bash shell (Git Bash on Windows) | `bash --version` | https://git-scm.com (Windows) |
| Node.js (for gbrain CLI via npm) | `node --version` | https://nodejs.org |
| A git repo to use it in | `git status` in your project | `git init` |
| *(optional)* A Supabase project | URL + service-role key, **both exported into the environment that launches the MCP server** | https://supabase.com (or auto-provision via `/setup-gbrain`) — or skip it and use the file substrate |

---

## Step 1 — Install the skill

Recommended: **personal install** (`~/.claude/skills/`) — the skill becomes available across all your projects.

**macOS / Linux / Git Bash on Windows:**

```bash
mkdir -p ~/.claude/skills/
unzip /path/to/fw-agent-skill.zip -d ~/.claude/skills/
```

**Verify:**

```bash
ls ~/.claude/skills/fw-agent-skill/
# should show: SKILL.md  references/  INSTALL.md
ls ~/.claude/skills/fw-agent-skill/references/
# should show: lessons.md  middleware.md  modes.md  operations.md  roles.md  templates.md
```

**Windows path:** `~/.claude/skills/` resolves to `C:\Users\<you>\.claude\skills\`.

**Project-level install instead** (skill committed to one specific repo):

```bash
mkdir -p .claude/skills/
unzip /path/to/fw-agent-skill.zip -d .claude/skills/
```

---

## Step 2 — Install GBrain

The fastest path is gstack's `/setup-gbrain` skill (it handles install, Supabase provisioning, and MCP registration in one go):

```
/setup-gbrain
```

Pick **Supabase cloud** when prompted (existing URL or auto-provision via the Management API). When it finishes, you'll have:

- The `gbrain` CLI on `PATH`
- A Supabase project provisioned with pgvector and the required schema
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exported in your shell config
- The `gbrain` MCP server registered with Claude Code at user scope

**Verify:**

```bash
gbrain --version
gbrain search "test" --limit 1   # should return at least a no-results response without error
```

**Manual install path** (if you don't have gstack):

```bash
npm install -g gbrain
```

then provision a Supabase project at https://supabase.com, copy the URL + service-role key into your shell, and register the MCP server (see `gbrain --help` for the exact `gbrain mcp` subcommand on your version):

```bash
export SUPABASE_URL=https://xxxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
claude mcp add --transport stdio --scope user gbrain -- gbrain mcp serve
```

---

## Step 3 — Register this project's repos as GBrain sources (optional)

GBrain can index your repo's code so searches across `SEARCH` can surface code context alongside the team's durable knowledge:

```bash
cd /path/to/your/project
gbrain sources add . --label <project-slug>
gbrain sync
```

This is **optional** for the orchestration playbook — agents write durable findings to GBrain as pages regardless. But indexed sources make Builder/Investigator searches richer.

---

## Step 4 — Project-scope MCP wrapper (for cloud sandboxes)

User-scope MCP registrations don't survive ephemeral cloud containers. For Claude Code on the web, register GBrain at *project scope* so a fresh container picks it up automatically.

This repo's `.mcp.json` already does this:

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "bash",
      "args": [".claude/scripts/gbrain-mcp.sh"]
    }
  }
}
```

The wrapper at `.claude/scripts/gbrain-mcp.sh` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the container's env and runs `gbrain mcp serve` on stdio.

For your own projects, copy `.mcp.json` and `.claude/scripts/gbrain-mcp.sh` from this repo. Then add the Supabase env vars to your cloud sandbox's environment-variables panel.

---

## Step 5 — Establish the project slug

GBrain pages live under slug prefixes. Pick a short, stable identifier for your project (matching its repo name is fine) and use it consistently:

| Layer | Slug prefix | Example |
|---|---|---|
| base | `<project>/base/...` | `aihu/base/skill/SKILL` |
| user | `<project>/user/<topic>/...` | `aihu/user/cache-invalidation/promoted-spec` |
| delta | `<project>/delta/<topic>/<round>/<kind>` | `aihu/delta/cache-invalidation/3/build-manifest` |
| local | `wiki/agents/<subagent-id>/...` (enforced) | `wiki/agents/builder-7f3/scratch/probe-1` |

This convention is what the per-role permission matrix (in `references/roles.md` and `references/middleware.md`) is built around. Pick the project slug **once** and put it in the project's `docs/state/<track>.md` so every agent uses the same one.

---

## Step 6 — First session

Open Claude Code in your project root:

```bash
cd /path/to/your/project
claude
```

The skill auto-triggers when you describe orchestration work. You don't need to invoke it manually. Try one of:

**To start a build:**
> Let's start a Mode 2 build session for [the auth middleware / the cache invalidation refactor / whatever]. Apply the fw-agent-skill playbook.

**To start a defect fix:**
> I want to investigate and fix [specific defect]. This is non-trivial and probably needs the investigate-then-fix loop. Use the fw-agent-skill playbook.

**To resume work:**
> Resume the orchestration session. Read docs/state/<track>.md and let's pick up where we left off.

**What to expect on the first dispatch:**

1. Claude reads `SKILL.md` and identifies which mode applies.
2. Since no director-note exists yet, the first dispatch is a **Topic Director** — it sets initial direction.
3. The Director calls `SEARCH` against your Supabase brain (you'll see the MCP tool calls in the UI).
4. Director writes a `kind:director_note` page to `<project>/delta/<topic>/0/director-note` via `PUT_PAGE`, then tags it with `topic:<id>`, `track:<id>`, `layer:delta`, `round:0` via `ADD_TAG`.
5. Claude then dispatches the first **Scout** or **Architect** per the Director's brief.
6. Loop continues per the synthesis spine.

**Verify mid-session:**

In another terminal:

```bash
gbrain search "kind:director_note" --limit 5
# should show the just-written director-note page
```

**End of session:** explicitly tell Claude to dispatch the **Historian**. The Historian writes the retro page and runs `delta → user` promotion for any earned learnings. Without this step, durable findings stay in delta forever.

> End of session — dispatch the Historian.

---

## Verification checklist

After all six steps, run through this:

| Check | Command | Expected |
|---|---|---|
| Skill is discoverable | `ls ~/.claude/skills/fw-agent-skill/SKILL.md` | File exists |
| gbrain CLI installed | `gbrain --version` | Version prints |
| Supabase env set | `echo $SUPABASE_URL` | URL prints |
| MCP registered | `claude mcp list` | `gbrain` listed |
| Brain reachable | `gbrain search "test" --limit 1` | No connection error |
| First-session test | Tell Claude to start a Mode 2 session, watch for `SEARCH` calls | MCP tool calls visible in transcript |

If all six pass, you're ready.

---

## Troubleshooting

**Skill doesn't trigger.** Mention specific keywords from the skill's description: "team lead", "Mode 2 build", "dispatch a subagent", "topic director", "fw-agent-skill playbook", "GBrain". If still no, check Claude Code can see the skill — type `/` in a session and look for it in the slash-command list.

**`SEARCH` returns nothing.** First-run brain is empty by design — durable knowledge accumulates session-over-session. If you want the skill itself indexed for `SEARCH` retrieval, register it as a source: `gbrain sources add ~/.claude/skills/fw-agent-skill --label fw-agent-skill && gbrain sync`.

**MCP server fails to start.** Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in the environment Claude Code launches the MCP server with. The wrapper at `.claude/scripts/gbrain-mcp.sh` fails fast with a clear message if either is missing.

**Subagent `put_page` rejected.** GBrain enforces a `wiki/agents/<subagent-id>/.+` slug prefix on subagent writes by default. If a Builder, Verifier, etc. needs to write to `<project>/delta/...`, the dispatch brief must either (a) un-wrap the subagent namespace for that call, or (b) the Team Lead writes the page on the subagent's behalf after the dispatch returns. See `references/middleware.md` for the worked example.

**MCP not showing tools in Claude Code.** Restart Claude Code (`exit` and re-run `claude`). MCP server changes don't always pick up live.

**Subagent writes to wrong layer (slug prefix).** This is an orchestration discipline issue. Check the brief — the template should say which slug to write to. See the layer-permission tables in `references/roles.md` and `references/middleware.md`.

**"Skill triggered but the dispatch went sideways."** The most common reasons: (a) Team Lead made a substance call instead of dispatching a Director (lesson #11), (b) brief used stale director-note guidance, (c) named samples not specified. Run the pre-flight checklist in `references/templates.md` — it catches all three.

---

## Updating the skill

When you edit the skill files (e.g., to tune the description or add a project-specific note):

```bash
# If you registered the skill as a GBrain source, re-sync to pick up changes:
gbrain sync
```

Live skill file edits in `~/.claude/skills/` are picked up by Claude Code within the current session — no restart needed.

---

## Removing the skill

```bash
rm -rf ~/.claude/skills/fw-agent-skill/
claude mcp remove gbrain --scope user   # if you want to disable GBrain too
```

Supabase data persists until you delete the project at https://supabase.com — it is independent of this skill.
