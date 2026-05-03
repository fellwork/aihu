# scribe

A JavaScript/TypeScript meta-framework for building Web Components with
runtime-first reactivity. Authored as `.scribe` SFCs, compiled to vanilla
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
  - `@scribe/signals` — push-based signals/computeds/effects (≤ 1.7 kB gz)
  - `@scribe/arbor` — `branch`/`leaf`/`mount` DOM primitives
  - `@scribe/runtime` — runtime layer
  - `@scribe/agent` + agent-readiness — agent/MCP compliance helpers
- Rust SFC compiler is the v0 → v1 gate (not yet shipped)

## Conventions

- **Per-package size gates are the contract.** Every browser-eligible package has a row in `.size-limit.json`; every PR validates each row via `bun run size`. The combined browser-bundle figure is reported (currently ~5.5 kB gz across browser-eligible packages post-v1 cutover, Plan 7.1) but is NOT itself a budget — the per-package rows are. New packages that enter the browser tier add a row; server-side and build-time-only packages MUST NOT add a row (per `.size-limit.README.md`).
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
