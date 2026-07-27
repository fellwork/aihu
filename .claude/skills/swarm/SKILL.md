---
name: swarm
description: Read and write the agent swarm's shared memory — Notion (scratchpad + wiki) and Linear (tasks). Use at the START of any work session to find what you own and what is already known, and at every handoff to record findings. Required before claiming work, reporting status, or concluding that something is unknown.
---

# swarm — shared consciousness for concurrent agents

Durable swarm state lives **outside git**, reachable from any worktree, any
branch, any machine, any cleared context.

| Layer | Backend | Holds |
|---|---|---|
| **Wiki / scratchpad** | Notion | findings, decisions, topology, retros, working notes — *what we know* |
| **Tasks** | Linear (team `FEL`) | ownership, status, priority — *who is doing what* |

Linear issues carry a `project` (`aihu`, `data`, `web`) that mirrors the project
list in Notion. That is the join between the two layers.

## Why not git, and why not MCP

**Not git:** git is *branch-scoped*. `docs/TOPOLOGY.md` was committed
specifically so it would "survive a cleared context and reach another agent's
checkout" — and did neither, because it sat on one unmerged branch while every
agent briefed to read it from a main-cut worktree got `ENOENT`. A record that
reads as present while being absent at the point of use is this project's
signature defect. Shared state cannot live on a branch.

**Not MCP:** MCP servers are per-session and OAuth-gated. They are unavailable
to subagents, to cron runs, and to headless cloud sandboxes — exactly the
contexts a swarm memory has to survive. This talks to both REST APIs directly,
with tokens read from the macOS keychain at call time.

## Setup (once per machine)

```bash
security add-generic-password -s LINEAR_API_KEY -a "$USER" -w   # prompts; no echo
security add-generic-password -s NOTION_TOKEN   -a "$USER" -w
echo <your-role> > .agent-role                                  # in your worktree root
```

Then point the wiki at its root page:

```bash
bun .claude/skills/swarm/swarm.ts wiki-init        # lists pages the integration can see
bun .claude/skills/swarm/swarm.ts wiki-root <id>
```

**The Notion step people skip:** the integration must be added to the page via
`•••` → **Connections**. Without it, search returns an empty list with HTTP 200
— indistinguishable from "nothing there" unless you know. `wiki-init` detects
this and says so rather than reporting an empty workspace.

Roles: `orchestrator`, `verifier`, `architect`, `historian`, `builder`,
`builder-a`, `builder-b`, `investigator`. Anything else is refused — an agent
that silently adopts another's identity attributes its writes to the wrong role
and corrupts the record for everyone. Conductor auto-names workspaces after
cities, so the directory name is never used as a role.

## Commands

```bash
# `S` is a function, not `S="…"`: zsh does not word-split an unquoted `$S`, so
# the string form runs a single command literally named "bun …" and fails with
# "command not found". A function works in zsh and bash alike. FEL-461.
S() { bun .claude/skills/swarm/swarm.ts "$@"; }

S whoami                       # role + health of both backends. RUN THIS FIRST.

S tasks --project aihu --state "In Progress"
S show  FEL-409                # description + all comments, oldest first
S claim FEL-409                # assigns the human owner, records YOU as acting agent
S note  FEL-409 "finding..."   # comment, attributed to your role
S move  FEL-409 "In Review"

S recall "bench attribution"   # search the wiki
S wiki-read <page-id>
S wiki-write --title "T" --body "..."      # or pipe markdown on stdin
S wiki-write --append <page-id> --body "..."
```

## Discipline

**Read before you write.** The first write ever made through this tool was a
status update that contradicted a finding recorded on the same issue five hours
earlier — because its author carried task state in context instead of running
`show`. *An agent's memory of a task is not the task's state.* Run `show` first.
Always.

**Claim before you build.** Two agents claimed the same fix once because
ownership was framed as "who owns which files" instead of "who is doing which
job". `claim` writes that down where the other agent can see it.

**Record findings where they survive you.** Anything another agent would need
after your context is cleared goes in the wiki or an issue comment — not in
Slack, which scrolls, and not in a branch file, which is invisible from every
other branch.

**Empty is not the same as broken.** Every command here fails loudly and exits
non-zero: missing token, unreachable API, unknown issue, unset role. A genuinely
empty result says so explicitly. If you get silence, something is wrong with the
tool, not with the data — say so rather than proceeding as if the answer were
"nothing".

**Never print or paste a token.** They are read from the keychain at call time
and never passed via argv, written to disk, or echoed.
