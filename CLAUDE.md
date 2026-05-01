# scribe

A JavaScript/TypeScript meta-framework for building Web Components with
runtime-first reactivity. Authored as `.scribe` SFCs, compiled to vanilla
custom elements, mounted with sub-2 kB reactive primitives.

## Commands

```bash
bun install                 # Install workspace deps
bun run test                # vitest, 255 tests
bun run build               # Build all packages
bun run bench               # Run benchmark suite (cellx, dynamic-deps, etc.)
bun run typecheck           # tsc --noEmit across packages
```

## Stack

- **bun** — runtime, package manager
- **vitest** — test runner
- Workspace packages under `packages/`:
  - `@scribe/signals` — push-based signals/computeds/effects (≤ 1.7 kB gz)
  - `@scribe/arbor` — `branch`/`leaf`/`mount` DOM primitives
  - `@scribe/runtime` — runtime layer
  - `@scribe/agent` + agent-readiness — agent/MCP compliance helpers
- Rust SFC compiler is the v0 → v1 gate (not yet shipped)

## Conventions

- Browser bundle has a hard ceiling at 3.46 kB gz — every PR validates against `bun run build` size budgets.
- Output is **vanilla custom elements**. No framework lock-in at the consumer boundary, no global context, no hydration step.
- Reactive updates use `nodeValue` (not `textContent`) — 122× faster on targeted updates.
- llms.txt + MCP support is part of the contract, not optional.

## Multi-agent orchestration

This repo is the home of the `fw-agent-skill` (under `.claude/skills/`) and
runs Mode 2 build sessions via AGENTS.db. State files live at
`state-<track>.md` in the repo root.

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
