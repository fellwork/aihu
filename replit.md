# Scribe (fellwork-scribe)

A JavaScript/TypeScript meta-framework for building Web Components with
runtime-first reactivity. Pre-v0; phases 2 (`@scribe/signals`) and 3
(`@scribe/arbor`) have shipped. The compiler/runtime layers are not yet
started.

## What this project is (and isn't)

This is a **library monorepo**, not an application. There is no frontend and
no backend server to run. The deliverables are publishable npm packages that
consumers import.

- `packages/signals` — `@scribe/signals` reactive primitives (signal,
  computed, effect, batch, untrack, $state). Targets ≤ 1.6 kB gzipped.
- `packages/arbor` — `@scribe/arbor` DOM mount layer (`branch`, `leaf`,
  `mount`, `MountScope`). Depends on `@scribe/signals`.
- `bench/signals` — perf benchmarks vs alien-signals (cellx 4×4, wide-fanout).
- `tests/integration` — cross-package tests that exercise arbor + signals
  together.

## Toolchain

- **Runtime:** Bun ≥ 1.3 (installed: 1.3.6) and Node ≥ 20.18 (installed:
  20.20). Both are required; `engines` is enforced.
- **Workspaces:** Bun workspaces (`packages/*`, `bench/*`).
- **Bundler:** Rolldown (Rust/OXC) — per-package `rolldown.config.ts`.
- **Test runner:** Vitest + jsdom + fast-check (property tests). Root
  `vitest.config.ts` covers `packages/*/tests/**`; `tests/vitest.config.ts`
  covers the integration suite.
- **Lint/format:** Biome (`bun run check`).
- **Task graph:** Moon (`moon run :build`, `moon run :typecheck`). Shared
  task definitions live in `.moon/tasks/tasks.yml`.
- **Size budget:** size-limit gates per-package gzipped bundle sizes
  (`bun run size`).

## Common commands

```bash
bun install                              # install workspace deps
bun run --cwd packages/signals build     # build signals → dist/
bun run --cwd packages/arbor build       # build arbor → dist/
bun run build                            # moon: build all packages
bun run test                             # vitest run (110 tests)
bun run test:watch                       # vitest watch (used by workflow)
bun run test:integration                 # cross-package integration tests
bun run typecheck                        # moon: tsc --noEmit per package
bun run check                            # biome lint + format
bun run size                             # size-limit gates
```

## Replit setup

- A single workflow named **Tests** runs `bun run test:watch` with console
  output. There is no web preview because this repo has no UI to serve.
- No deployment is configured: this is a library, not a deployable app.
  Publishing would mean releasing the packages to a registry, which is
  out of scope for the current repo state (no `LICENSE`, packages still at
  `0.0.0`).

## Project structure highlights

- `.team/` — binding specs, phase plans, retros, and learnings. Specs in
  `phase-2/spec-signals.md` and `phase-3/spec-arbor.md` are the source of
  truth for runtime behavior.
- `.moon/` — Moon workspace + shared task definitions.
- `docs/superpowers/` — additional internal docs.
