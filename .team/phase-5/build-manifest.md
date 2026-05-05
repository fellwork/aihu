# Phase 5 — `@aihu/agent` build manifest

**Builder:** Mode-2 parallel Builder
**Branch:** `phase-5/agent-implementation`
**Base:** `claude/aihu-phase-3-team-Za4UQ` @ `0353263`
**Spec:** `.team/phase-5/spec-agent.md` (Final, binding)

## Files created / modified

| File | Action |
|---|---|
| `packages/agent/package.json` | create |
| `packages/agent/tsconfig.json` | create (`rootDir: "."`, `include: ["src/**/*.ts", "tests/**/*.ts"]`) |
| `packages/agent/moon.yml` | create (`layer: library`) |
| `packages/agent/rolldown.config.ts` | create (ESM + dts + minify) |
| `packages/agent/src/registry.ts` | create — `Map`, `register`/`get`, `__resetRegistryForTesting`, `AgentMetadata` |
| `packages/agent/src/index.ts` | create — re-exports `AgentMetadata`, `getAgentMetadata`, `registerAgentMetadata` |
| `packages/agent/tests/registry.test.ts` | create — 7 unit tests per spec §4 |
| `.size-limit.json` | modify — add `@aihu/agent` row at `100 B gzip` |

## Module layout

Two source files per spec §2.1:
- `registry.ts` — `Map`, both functions, `AgentMetadata` interface, `__resetRegistryForTesting`
- `index.ts` — public re-exports only

`AgentMetadata` co-located in `registry.ts` rather than a separate `types.ts` to honour the spec's "two files" file count. `__resetRegistryForTesting` is exported from `registry.ts` but intentionally NOT re-exported from `index.ts`.

## Test isolation strategy

Chose **option (a)** from spec §4: `__resetRegistryForTesting` exported from `registry.ts`, called in `beforeEach`. Each test additionally uses unique `x-test-N` tag names for defence-in-depth.

## Gate results (clean state)

| Gate | Result |
|---|---|
| `bun run typecheck` | exit 0 (after build provides `dist/` for downstream packages) |
| `bun run build` | exit 0 — agent emits `dist/index.js` (114 B raw) + `dist/index.d.ts` |
| `bun run test` | **131 passed / 131** (including 7 new agent tests) |
| `bun run size` | all 4 packages under budget (see below) |
| `bunx biome ci .` | exit 0 (7 pre-existing warnings, no errors) |

## Size measurements

| Package | Limit | Measured | Headroom |
|---|---|---|---|
| `@aihu/signals` | 1.6 kB | 1.55 kB | 49 B |
| `@aihu/arbor` | 2.05 kB | 1.28 kB | 766 B |
| `@aihu/runtime` | 1.02 kB | 438 B | 586 B |
| `@aihu/agent` | **100 B** | **72 B** | **28 B** |

## Acceptance-criteria check

- 7 spec §4 tests pass — yes
- `@aihu/agent` ≤ 100 B gz — 72 B, 28 B headroom
- Zero source-level imports of `@aihu/signals`/`@aihu/arbor`/`@aihu/runtime`: `grep "from '@aihu/" packages/agent/src/*.ts` returns no matches
- `__resetRegistryForTesting` exported from `registry.ts` only — confirmed
- No `AgentError` class — confirmed
- All gates green from clean (`rm -rf packages/agent/dist`) state — confirmed

## Commits

(SHA backfilled after commit creation per Learning #20.)

| SHA | Message |
|---|---|
| `648d11c` | feat(agent): scaffold @aihu/agent + registry + 7 tests |
