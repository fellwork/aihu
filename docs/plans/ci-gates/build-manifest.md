# CI gates build manifest — #453 (emit-parses at 0/0) + #454 (showcase smoke tests)

One PR closes both issues; they share `.github/workflows/plan-a.yml`.

Branch: `fix/ci-gates` off `origin/main`.

## #453 — gate `check:emit-parses` at 0 compile / 0 parse

### Where it was wired
`plan-a.yml`, the **`check`** job, as a step immediately after the Slice-0
compile invariants (`check:derived` / `check:attributed` / `check:governed` /
`check:dual-audience`) and before the CLI-templates test:

```yaml
- run: bun scripts/check-emit-parses.ts --expect-parse 0 --expect-compile 0
```

### Why there
- The step needs the `aihu-compile` binary. The `check` job already builds both
  Rust binaries (`cargo build --release`) and **stages `aihu-compile` into
  `packages/compiler/bin/`** (lines 61–72). The script's `resolveCompiler()`
  resolves that staged binary (newest-first among `packages/compiler/bin`,
  `target/release`, `target/debug`), so no extra build step was required — the
  gate is simply sequenced after the existing build+stage.
- It needs **no built `dist`** (it shells the compiler directly and parses the
  emitted JS with `Bun.Transpiler`), so it can run early and **fail fast**,
  before the coverage run — same rationale and neighbourhood as the four
  Slice-0 invariants.
- It reuses the established gate mechanism; the script's own `--expect-parse` /
  `--expect-compile` flags provide the ratchet (exit 0 iff BOTH stage counts
  equal their committed baseline), so no `vitest.gates.config.ts` change was
  needed for this gate.

### Meta-guard (proof the gate has teeth)
Introduced a broken scratch fixture `examples/_ci_meta_guard_scratch.aihu`
(v1 `<template>` HTML-tag form + block-bodied `$computed` — stale/invalid v2):

| run | command | exit |
|-----|---------|------|
| clean baseline | `bun scripts/check-emit-parses.ts --expect-parse 0 --expect-compile 0` | **0** |
| broken fixture present | same command | **1** (`compile: expected 0, found 1 — 1 NEW failure(s)`) |
| fixture removed | same command | **0** |

Scratch fixture removed; **not committed**.

## #454 — showcase smoke tests in CI

### Finding: both smoke suites already existed
Contrary to the brief's "storefront needs an equivalent smoke test if it lacks
one," `examples/storefront/tests/smoke.test.ts` (+ `vitest.config.ts`) was
**already committed** (mirrors agent-hub's setup added by #455). So #454 was a
**wiring** task, not an authoring task — with one rot fix (below).

### Where it was wired
`plan-a.yml`, the **`examples`** job **test loop** — added `examples/agent-hub`
and `examples/storefront` to the existing per-example `bun run test` loop
(each runs its own `vitest.config.ts` smoke suite).

### Why NOT the build loop
Both showcases were **deliberately kept out of the `vite build` loop**. Their
app scaffolding uses dev-server-only wiring that rollup cannot resolve at build
time, unrelated to `.aihu` compile-correctness:
- **agent-hub**: `index.html` references the `/@shared/agent-panel.aihu` URL
  form; the `@shared` alias covers bare imports, not that leading-slash URL →
  `Failed to resolve /@shared/agent-panel.aihu`.
- **storefront**: `vite.config.ts` aliases `@aihu/arbor` to
  `node_modules/@aihu/arbor`, which it neither declares nor installs →
  `Could not load @aihu/arbor`.

Adding them to the build loop would turn CI red for the wrong reason. Their
**SFC compile-correctness is instead guarded by `check:emit-parses` (#453)**,
which globs `examples/**/*.aihu` and therefore compiles both showcases' SFCs at
0/0 in the `check` job. The smoke suites guard their shape/API/wire contracts.
Both mechanisms are documented inline in the workflow.

### Rot fix (storefront smoke suite)
The committed storefront suite carried **two stale v1 assertions** that failed
against the current v2 source — the exact silent-rot #454 exists to prevent
(and the same fix agent-hub's A5-5 already received):

| test | was (v1) | now (v2) |
|------|----------|----------|
| A6-5 | `storefront-root.aihu` contains `@agent` | contains `expose:` (v2 collection form; storefront-root exposes via `expose: { read: true }`, no `@agent` block) |
| A6-9 | `product-list.aihu` contains `$expose` | contains `expose:` (v2 retired `$expose name`; product-list uses `expose: { read: true, write: true }`) |

## Measured results

| check | result |
|-------|--------|
| `plan-a.yml` YAML parse (`yaml.safe_load`) | OK |
| `gh workflow view "Plan A — TS runtime family"` | still lists `plan-a.yml` (ID 266245046) |
| emit-parses `--expect-parse 0 --expect-compile 0` | **exit 0**, 58 components, 0 compile / 0 parse |
| meta-guard (broken fixture) | **exit 1** |
| agent-hub smoke (`bun run test`) | **15 passed / 15** |
| storefront smoke (`bun run test`) | **19 passed / 19** (2 previously failing, fixed) |
| `sync-readme.ts --check` | **PASS** (all in sync) |
| `biome ci examples/storefront/tests/smoke.test.ts` | **exit 0** |
| 0/0 baseline unchanged after edits | confirmed still 0/0 |

## Files changed
- `.github/workflows/plan-a.yml` — emit-parses gate in `check`; showcases added
  to `examples` test loop (with rationale comments on both loops).
- `examples/storefront/tests/smoke.test.ts` — A6-5 / A6-9 stale v1 → v2 `expose:`.

## Not changed (surfaced)
- No compiler/runtime Rust src touched → **no binary bump** required.
- Showcase `vite build` scaffolding gaps (agent-hub `/@shared/` URL form;
  storefront undeclared `@aihu/arbor` dep) left as-is — out of scope for CI
  gating and would require editing example app config/deps.
