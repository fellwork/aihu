# BUILD-549 — fix for PR #549 `examples` / `governed-examples`

**Branch:** `feat/signals-lifecycle-contract`
**Commit pushed:** `1a8fb814c8a68abfbf4b77e8ea0843fe22fd3d11`
(`fix(examples): alias @aihu/signals/lifecycle subpath before the package alias`)
**Base before fix:** `e3759bf0`
**Worktree:** throwaway, under the session scratchpad; removed after push. The
user's checkout at `/Users/smcguirt/conductor/repos/aihu` stayed on `main`.

## Fix

Per INV-C: Vite string aliases are **prefix** replacements, so
`'@aihu/signals': <path>` rewrote the new `@aihu/signals/lifecycle` specifier
(introduced by #549 and imported by `@aihu/runtime`) into a nonexistent
`<pkg dir>/lifecycle` path, bypassing the signals `exports` map entirely.

Added the more-specific subpath alias **immediately before** each package alias,
matching the existing `@aihu/runtime/ssr` precedent already in
`tests/vitest.config.ts` and the root `vitest.config.ts`.

Alias target matches whatever each file already did for the package alias:

- dist-alias configs → `resolve(__dirname, 'node_modules/@aihu/signals/dist/lifecycle.js')`
- src-alias configs → `packages/signals/src/lifecycle.ts`

No change to `packages/signals/package.json`, no re-export of lifecycle from the
signals index, no `[bench-bump]`.

## Files changed (16)

`examples/*/vite.config.ts` — 14 files, dist-alias form:

| | |
| --- | --- |
| agent-driven-demo | primitives-showcase |
| agent-hub | realtime-scores |
| cf-adapter | storefront |
| color-theme | temperature-converter |
| css-engine-demo | timer |
| currency-converter | todo-mvc |
| live-counter | weather-card |

Src-alias form — 2 files:

- `examples/agent-driven-demo/vitest.config.ts` → `pkg('signals/src/lifecycle.ts')`
- `tests/vitest.config.ts` → `../packages/signals/src/lifecycle.ts`

Not touched: the root `vitest.config.ts` (the PR author already added the
subpath alias there), and `packages/magna/vitest.config.ts` (aliases signals but
never reaches `@aihu/runtime` — INV-C says no change needed; left alone to avoid
scope creep).

**Investigator counted 15 example configs; the real count is 14.** Verified by
`grep -rlF "'@aihu/signals':" examples/*/vite.config.ts | wc -l`.

## Acceptance — observed results

| | Check | Result |
| --- | --- | --- |
| A | `bun install --frozen-lockfile` then `bun run build` | **exit 0** — 45 tasks, 1m 12s |
| B | `cd examples/live-counter && bun run build` (verbatim CI reproducer) | **exit 0** — 12 modules, `index-CI6y0EFW.js` 23.69 kB / gzip 8.45 kB |
| C | `examples/agent-driven-demo` (vite 6.4.3 / vitest 3.2.6, src resolution) | `bun run build` **exit 0**; `bun run test` **exit 0** — `tests/real-ws-bridge.test.ts` 2/2 passed (this is the exact file INV-C showed failing) |
| D | `grep -rn "@aihu/signals/lifecycle" examples/*/vite.config.ts \| wc -l` | **14**, equal to the **14** configs that alias `'@aihu/signals'` |

Extra verification beyond the four:

- `bun run test:integration` — **exit 0**, 9 files / 40 tests passed. This was
  broken on the branch and is run by no workflow (the INV-C bonus finding); the
  one-line `tests/vitest.config.ts` alias was all it needed.
- `bun run build:governed-examples` — **exit 0**, 8 examples passed (todo-mvc and
  agent-driven-demo, the two reported failures, both green).
- Full CI `examples` job reproduced step-for-step: builds of `live-counter`,
  `temperature-converter`, `timer`, `todo-mvc`, `color-theme` all **exit 0**;
  smoke tests of those five plus `agent-hub` and `storefront` all **exit 0**.
- `biome check .` — clean (1112 files, no fixes applied). The formatter collapses
  the new alias to a single 100-char line, exactly at the configured `lineWidth`.

### Local-environment note

The worktree needed `cargo build --bin aihu-compile` plus a
`packages/compiler/bin/aihu-compile` symlink before `agent-driven-demo`'s vitest
`globalSetup` would run (it shells out to the native binary). That is the same
step the CI `examples` job performs; unrelated to this fix.

### Pre-existing failures, out of scope

Building *all* 14 signals-aliasing examples surfaces 4 failures that have nothing
to do with the lifecycle subpath, and are documented as known in
`.github/workflows/plan-a.yml`:

- `agent-hub`, `cf-adapter` — `Failed to resolve /@shared/agent-panel.aihu` from
  `index.html` (dev-server-only URL form rollup cannot resolve at build).
- `storefront`, `realtime-scores` — `Could not load node_modules/@aihu/arbor`;
  they alias `@aihu/arbor` to a path they do not declare or install.

None of these four is in the CI build set. Their alias tables were still fixed so
the lifecycle subpath resolves once the unrelated scaffolding is repaired.

## Still open (not done here, by instruction)

- `bench` / `bench-arbor` remain red on stale baselines. `[bench-bump]` was **not**
  added — INV-C flags it as a separate decision, and it must land on the PR head
  commit.
