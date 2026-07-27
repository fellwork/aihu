# aihu

A JavaScript/TypeScript meta-framework for building Web Components with
runtime-first reactivity. Authored as `.aihu` SFCs, compiled to vanilla
custom elements, mounted with sub-2 kB reactive primitives.

## Commands

```bash
bun install                 # Install workspace deps
bun run test                # vitest, 612 TS + 232 Rust tests
bun run build               # Build all packages
bun run bench               # Run benchmark suite (cellx, dynamic-deps, etc.)
bun run typecheck           # tsc --noEmit across packages
```

## Stack

- **bun** — runtime, package manager
- **vitest** — test runner
- Workspace packages under `packages/`:
  - `@aihu/signals` — push-based signals/computeds/effects (≤ 1.7 kB gz)
  - `@aihu/arbor` — `branch`/`leaf`/`mount` DOM primitives
  - `@aihu/runtime` — runtime layer
  - `@aihu/agent` + agent-readiness — agent/MCP compliance helpers
- Rust SFC compiler is the v0 → v1 gate (not yet shipped)

## Conventions

- **Per-package size gates are the contract.** Every browser-eligible package has a row in `.size-limit.json`; every PR validates each row via `bun run size`. The combined browser-bundle figure is reported (currently ~5.5 kB gz across browser-eligible packages post-v1 cutover, Plan 7.1) but is NOT itself a budget — the per-package rows are. New packages that enter the browser tier add a row; server-side and build-time-only packages MUST NOT add a row (per `.size-limit.README.md`).
- Output is **vanilla custom elements**. No framework lock-in at the consumer boundary, no global context, no hydration step.
- Reactive text updates assign `nodeValue` on a cached text node (not `textContent` on its parent), so a targeted write is O(1) in the parent's child count rather than rebuilding its child list.
- llms.txt + MCP support is part of the contract, not optional.

## Multi-agent orchestration

This repo is the home of the `fw-agent-skill` (under `.claude/skills/`).

**The bus is the record.** Swarm coordination runs over `swarm-bus` (the Rust
core in `packages/swarm`, installed at `~/.swarm/bin/swarm-bus`) against one
SQLite file at `~/.swarm/bus.db`. Payloads are typed and validated at the
boundary — a malformed message is REJECTED with exit 2, never silently
accepted, so **read the exit code**:

```bash
~/.swarm/bin/swarm-bus send --from <role> --to <role|all> \
  --kind <note|claim|counter|verdict|blocked> --body '...'
#   a verdict MUST name --contract, and should carry --pr / --claims
#   a blocked MUST carry --question (the one thing a human must decide)
~/.swarm/bin/swarm-bus claim --id <contract> --role <role>   # before you build
~/.swarm/bin/swarm-bus watch --role <role>                   # traffic not addressed to you
```

**The bus is the ONLY channel. Do not post to Slack.** (Founder ruling,
2026-07-27.) Everything — claims, verdicts, blocked questions, disclosures,
status — goes on the bus. The bus is what the reconciler checks, what the
console displays, and what the Linear/GitHub sync publishes; Slack is none of
those things. **Work reported only in Slack is invisible to every gate and
every audit — in ledger terms it did not happen.** A significant incident
disclosure was lost this way on 2026-07-27.

If something genuinely needs a human right now, that is what
`--kind blocked --question '<the one thing to decide>'` is for: it surfaces in
the console's DECIDE bucket, and unlike a Slack message it is attached to the
contract and survives.

**Durable role state lives at `docs/state/<role>.md`** — committed files named
by ROLE, not by scope. Each ends with "what the next instance must not redo";
if you are woken as that role, you are that next instance. Read it first, and
update it before you finish.

You may NOT set your own status to `verified` / `no-claims`. Only the
supervisor's reconcile pass does that, after checking your claims against your
transcript or from merged-PR evidence.

GBrain (Supabase + pgvector) remains available for semantic recall via gstack's
`/setup-gbrain`, but it is **not** the coordination or state layer. See
`.claude/skills/fw-agent-skill/INSTALL.md` and `.claude/CLOUD-SETUP.md` for the
cloud-sandbox bootstrap.

## gstack

AI dev tooling — headless browser, QA, design review, deploy workflows.

**Install (one-time per machine):**
```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Use `/browse` for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

Available skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
