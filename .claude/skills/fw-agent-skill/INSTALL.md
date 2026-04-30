# Installing & Using

This skill needs two things in place: the skill files where Claude Code can find them, and AGENTS.db running as an MCP server in your project. After that, Claude auto-loads the skill when you describe orchestration work.

---

## Prerequisites

| Need | Check with | If missing |
|---|---|---|
| Claude Code | `claude --version` | https://claude.ai/install |
| Bash shell (Git Bash on Windows) | `bash --version` | https://git-scm.com (Windows) |
| `curl` | `curl --version` | Install from your package manager |
| A git repo to use it in | `git status` in your project | `git init` |

---

## Step 1 — Install the skill

Recommended: **personal install** (`~/.claude/skills/`) — the skill becomes available across all your projects. This matches the "organization folder" intent: methodology that travels with you, not pinned to one repo.

**macOS / Linux / Git Bash on Windows:**

```bash
mkdir -p ~/.claude/skills/
unzip /path/to/agent-team-orchestration.zip -d ~/.claude/skills/
```

**Verify:**

```bash
ls ~/.claude/skills/agent-team-orchestration/
# should show: SKILL.md  references/  INSTALL.md
ls ~/.claude/skills/agent-team-orchestration/references/
# should show: lessons.md  middleware.md  modes.md  operations.md  roles.md  templates.md
```

**Windows path:** `~/.claude/skills/` resolves to `C:\Users\<you>\.claude\skills\`.

**Common pitfall:** if the unzip nests the folder one level too deep (e.g., `~/.claude/skills/agent-team-orchestration/agent-team-orchestration/SKILL.md`), Claude Code won't find it. The path must be exactly `~/.claude/skills/agent-team-orchestration/SKILL.md`. Fix by moving files up a level.

**Project-level install instead** (skill committed to one specific repo):

```bash
mkdir -p .claude/skills/
unzip /path/to/agent-team-orchestration.zip -d .claude/skills/
```

---

## Step 2 — Install AGENTS.db CLI

```bash
curl -fsSL https://raw.githubusercontent.com/krazyjakee/AGENTS.db/main/scripts/install.sh | bash
```

This installs `agentsdb` to `~/.local/bin`. Make sure that's on your PATH.

**Verify:**

```bash
agentsdb --help
# should print the CLI usage
```

**On Windows (Git Bash):** the install script works the same. PATH entries persist across Git Bash sessions automatically.

---

## Step 3 — Set up AGENTS.db in your project

Run these in the project root.

**Configure the embedder** (interactive — pick offline `hash` if you don't want API costs):

```bash
cd /path/to/your/project
agentsdb options wizard
```

If you pick `hash` (default, offline, no API key), you get deterministic embeddings that work without internet. If you pick `openai` / `voyage` / `anthropic` / etc., set the corresponding API key env var (e.g. `export ANTHROPIC_API_KEY=sk-...`) before agents will be able to query.

**Initialize the layer files:**

```bash
agentsdb init
# creates AGENTS.db (base) by scanning your existing docs
# creates AGENTS.local.db (your scratch layer)
```

**Gitignore the local layer** — it's session scratch, not durable:

```bash
echo 'AGENTS.local.db' >> .gitignore
```

Commit `AGENTS.db`, and (when they appear) `AGENTS.user.db` and `AGENTS.delta.db`. They are source-control safe.

---

## Step 4 — Compile this skill into the base layer

The orchestration playbook itself belongs in `base` — it's canonical methodology. This makes the playbook queryable by every dispatched subagent without them having to read the markdown files.

**From your project root:**

```bash
agentsdb compile --out AGENTS.db --replace \
  ~/.claude/skills/agent-team-orchestration/SKILL.md \
  ~/.claude/skills/agent-team-orchestration/references/lessons.md \
  ~/.claude/skills/agent-team-orchestration/references/middleware.md \
  ~/.claude/skills/agent-team-orchestration/references/modes.md \
  ~/.claude/skills/agent-team-orchestration/references/operations.md \
  ~/.claude/skills/agent-team-orchestration/references/roles.md \
  ~/.claude/skills/agent-team-orchestration/references/templates.md
```

`--replace` is correct only at first install. For updates, use `agentsdb compile` without `--replace` (appends a new version of the same id).

**Adjust the path** if you used project-level install (`.claude/skills/...` instead of `~/.claude/skills/...`).

**Verify the compile worked:**

```bash
agentsdb search --base AGENTS.db --query "synthesis spine" -k 2
# should return the section about the Researcher → Director → Synthesizer loop
```

---

## Step 5 — Register the MCP server with Claude Code

This is what gives subagents the `agents_search` and `agents_context_write` tools.

**From your project root:**

```bash
claude mcp add --transport stdio --scope project agentsdb -- \
  agentsdb serve \
    --base   "$PWD/AGENTS.db" \
    --user   "$PWD/AGENTS.user.db" \
    --delta  "$PWD/AGENTS.delta.db" \
    --local  "$PWD/AGENTS.local.db"
```

**Windows / PowerShell:** `$PWD` doesn't expand the same way. Use absolute paths:

```bash
claude mcp add --transport stdio --scope project agentsdb -- \
  agentsdb serve \
    --base   "C:/path/to/project/AGENTS.db" \
    --user   "C:/path/to/project/AGENTS.user.db" \
    --delta  "C:/path/to/project/AGENTS.delta.db" \
    --local  "C:/path/to/project/AGENTS.local.db"
```

**`--scope project`** writes the MCP config into `.claude/` in this project. Use `--scope user` if you want this MCP available across all projects (each project still uses its own DB files because they're keyed by `$PWD`).

**Verify:**

```bash
claude mcp list
# should show 'agentsdb' as registered
```

---

## Step 6 — First session

Open Claude Code in your project root:

```bash
cd /path/to/your/project
claude
```

The skill auto-triggers when you describe orchestration work. You don't need to invoke it manually. Try one of:

**To start a build:**
> Let's start a Mode 2 build session for [the auth middleware / the cache invalidation refactor / whatever]. Apply the agent-team-orchestration skill.

**To start a defect fix:**
> I want to investigate and fix [specific defect]. This is non-trivial and probably needs the investigate-then-fix loop. Use the agent-team-orchestration playbook.

**To resume work:**
> Resume the orchestration session. Read state-<track>.md and let's pick up where we left off.

**What to expect on the first dispatch:**

1. Claude reads `SKILL.md` and identifies which mode applies.
2. Since no director-note exists yet, the first dispatch is a **Topic Director** — it sets initial direction.
3. The Director calls `agents_search` against `AGENTS.db` (you'll see the MCP tool calls in the UI).
4. Director writes a director-note record to `AGENTS.delta.db`.
5. Claude then dispatches the first **Scout** or **Architect** per the Director's brief.
6. Loop continues per the synthesis spine.

**Verify mid-session:**

In another terminal, while a session is running:

```bash
agentsdb inspect AGENTS.delta.db
# should show new records: director_note, scout_report, etc.
```

**End of session:** explicitly tell Claude to dispatch the **Historian**. The Historian writes the retro and runs `delta → user` promotion for any earned learnings. Without this step, durable findings stay in delta forever.

> End of session — dispatch the Historian.

---

## Verification checklist

After all six steps, run through this:

| Check | Command | Expected |
|---|---|---|
| Skill is discoverable | `ls ~/.claude/skills/agent-team-orchestration/SKILL.md` | File exists |
| AGENTS.db CLI installed | `agentsdb --help` | Usage prints |
| Project initialized | `ls AGENTS.db AGENTS.local.db` | Both exist |
| Skill compiled into base | `agentsdb search --base AGENTS.db --query "topic director" -k 1` | Returns a hit |
| MCP registered | `claude mcp list` | `agentsdb` listed |
| Local layer ignored | `grep AGENTS.local.db .gitignore` | Match found |
| First-session test | Tell Claude to start a Mode 2 session, watch for `agents_search` calls | MCP tool calls visible in transcript |

If all seven pass, you're ready.

---

## Troubleshooting

**Skill doesn't trigger.** Mention specific keywords from the skill's description: "team lead", "Mode 2 build", "dispatch a subagent", "topic director", "agent-team-orchestration playbook". If still no, check Claude Code can see the skill — type `/` in a session and look for it in the slash-command list.

**`agents_search` returns nothing.** The base layer wasn't compiled. Re-run Step 4 and verify with `agentsdb inspect AGENTS.db | head`.

**MCP server fails to start.** Check absolute paths in your `claude mcp add` command — relative paths don't work because the MCP server runs from a different working directory than you. Re-register with absolute paths.

**Embedder errors at search time.** Re-run `agentsdb options wizard` and pick a different backend. The offline `hash` backend has no external dependencies and is the safest default.

**MCP not showing tools in Claude Code.** Restart Claude Code (`exit` and re-run `claude`). MCP server changes don't always pick up live.

**Subagent writes to wrong layer.** This is an orchestration discipline issue, not a tool issue. Check the brief — the template should say which layer to write to. See the layer-permission tables in `references/roles.md` and `references/middleware.md`.

**"Skill triggered but the dispatch went sideways."** The most common reasons: (a) Team Lead made a substance call instead of dispatching a Director (lesson #11), (b) brief used stale director-note guidance, (c) named samples not specified. Run the pre-flight checklist in `references/templates.md` — it catches all three.

---

## Updating the skill

When you edit the skill files (e.g., to tune the description or add a project-specific note):

```bash
# Re-compile to base — note no --replace this time, so it appends new versions
agentsdb compile --out AGENTS.db \
  ~/.claude/skills/agent-team-orchestration/SKILL.md \
  ~/.claude/skills/agent-team-orchestration/references/*.md
```

Live skill file edits in `~/.claude/skills/` are picked up by Claude Code within the current session — no restart needed.

---

## Removing the skill

```bash
rm -rf ~/.claude/skills/agent-team-orchestration/
claude mcp remove agentsdb --scope project   # if you want to disable AGENTS.db too
```

`AGENTS.db` and friends in your project root are independent — they stay until you delete them explicitly.
