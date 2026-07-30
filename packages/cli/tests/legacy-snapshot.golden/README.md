# legacy-snapshot.golden — provenance

This directory is the golden tree for the default scaffold: `aihu app <name>
--pm bun` with no `--template` flag must produce this exact artifact, byte for
byte. It is compared by `packages/cli/tests/legacy-snapshot.test.ts`; this
README is the one file the harness skips when walking the golden (provenance
annotation, not scaffold output).

**This is no longer the arch-6 §7.3 backward-compat freeze (R-CT-06).** That
contract was retired with Shane's approval: pinning the default scaffold to a
v0.2.0 artifact guaranteed the default could never be current. The *mechanism*
is kept because it is worth keeping — it makes scaffold drift visible in code
review instead of silent. An intentional improvement is now a normal reviewed
diff plus an entry below, rather than a contract violation.

Refresh the fixture by deleting the directory and re-running the harness; it
writes a fresh tree when none exists (local only — it refuses to self-generate
in CI). **Restore this README afterwards** — it is not scaffold output, so the
generator does not recreate it, and a plain `rm -rf` of the directory takes it
with them.

## Regeneration log

### 2026-07-30 — `src/main.ts` no longer scaffolded (virtual client entry)

- **Why it moved:** `viteAihuPlugin()` gained an `aihu-entry` sub-plugin
  (`packages/app/src/vite-plugin.ts` + `packages/app/src/entry.ts`) that
  injects `<script type="module" src="virtual:aihu-entry">` into
  `index.html` and serves `virtual:aihu-entry` (byte-identical to the old
  `src/main.ts` content: `import { createApp } from '@aihu/app/client';
  createApp()`) whenever no real `src/main.ts` exists on disk. `appMainTs`/
  `appIndexHtml` (`packages/cli/src/index.ts`) stopped emitting the file and
  its `<script>` tag for the `minimal`/`docs` templates — a project that
  needs `createApp(options)` (`provide`, `outletId`, a non-default `head`)
  still writes a real `src/main.ts`, which makes the virtual entry step
  aside entirely (full eject, not a partial override).
- **Regenerated:** 2026-07-30, from emitter at commit `f88cdf02`, by
  deleting the directory and running the harness twice; this README was
  restored afterward per the warning above. Verified byte-identical by a
  full harness run (`bunx vitest run
  packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts`
  → 1 passed).
- **Diff vs previous golden:** `src/main.ts` removed; `index.html` lost its
  `<script type="module" src="./src/main.ts"></script>` line;
  `AGENTS.md`'s project-map table dropped the now-stale `src/main.ts` row
  and updated the `index.html` row to describe the injected virtual entry
  (`viteTemplateAgentsFacts` in `packages/cli/src/templates-tooling.ts`).
  No other file changed.

### 2026-07-30 — `@aihu/agent` joins the dependency list (scaffold DX-matrix)

- **Why it moved:** the compiler unconditionally emits `import {
  registerAgentMetadata } from '@aihu/agent'` for any component with an
  `$action` block, and the scaffolded counter component always has one.
  `@aihu/agent` was only reachable transitively (via `@aihu/server`), which
  bun/npm/yarn's hoisted `node_modules` papered over but pnpm's strict
  per-package resolution did not — `minimal × pnpm` failed the DX-matrix
  `build` step with an unresolved Rollup import. Added `@aihu/agent` as a
  direct dependency in `appPackageJson` (`packages/cli/src/index.ts`).
- **Regenerated:** 2026-07-30, from emitter at commit `e44f491b` (branch
  `lint-cleanup-and-dx-matrix-fixes`), by deleting the directory and running
  the harness twice; this README was restored afterward per the warning
  above (`rm -rf` had taken it with the rest of the tree). Verified
  byte-identical by a full harness run (`bunx vitest run
  packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts`
  → 1 passed).
- **Diff vs previous golden:** exactly one added line in `package.json` —
  `"@aihu/agent": "latest"`. No other file changed.

### 2026-07-28 — pnpm build-allow + the transitive peer closure (C-FEL-SCAFFOLD-PM-COMPAT)

- **Why it moved:** two already-committed scaffold changes had never been
  reflected here, so this gate was red on `main` before the work below touched
  it. (a) `pnpm-workspace.yaml` joined the baseline file set — pnpm reads its
  per-project settings from that file only, and without it a scaffold's first
  `pnpm install` exits non-zero with `ERR_PNPM_IGNORED_BUILDS`. (b)
  `package.json` gained `@aihu/context`, `@aihu/server` and `@aihu/store`: the
  scaffold has to declare the TRANSITIVE PEER CLOSURE of what it lists, because
  `@aihu/app`, `@aihu/runtime` and `@aihu/arbor` all declare zero runtime
  dependencies and express every edge as a peer.
- **Refreshed, not regenerated.** The delta was one added file plus one
  `package.json`, so both were copied from a real `aihu app legacy-snapshot
  --pm bun` run rather than deleting the directory — which would have taken
  this README with it (see the warning above). Verified by a full harness run
  (`bun run test packages/cli/tests/legacy-snapshot.test.ts --config
  vitest.gates.config.ts` → 1 passed).
- **Diff vs previous golden:** `+pnpm-workspace.yaml`, and three added
  dependency lines in `package.json`. No other file changed.
- **Note for the next refresh:** this gate is EXCLUDED from the root vitest
  config, so a green `bun run test packages/cli` does not cover it. That is how
  both deltas above reached `main` unnoticed. Run it explicitly whenever
  scaffold output changes.

### 2026-07-26 — config moves into `vite.config.ts` (#609)

- **Why it moved:** #609 relocates the whole aihu configuration surface out of
  a separate `aihu.config.ts` and into `vite.config.ts`, read back through the
  plugin's own `api` handle. The generated `vite.config.ts` therefore gains
  `app.head` and an `agentReadiness` block passed to `viteAihuPlugin()`.
- **Conflict resolution, stated because it is not mechanical:** the golden was
  regenerated during the rebase of #609 onto `main` after #612 landed. #612
  rewrote the starter page's copy (honest build-target claims, teaching voice)
  and wired agent-readiness *directly*, commenting that this was done "rather
  than via viteAihuPlugin's `agentReadiness` option so it loads as an ESM
  import." That rationale does not hold: `agentReadiness` has been typed on
  `AihuConfig` and lazily loaded via a dynamic `import()` since #53 —
  `packages/app/src/vite-plugin.ts` already documents why `require`/
  `createRequire` fail there and dynamic `import()` does not. The resolution
  therefore takes **#609's structure** (the `agentReadiness` option) and
  **#612's prose** (the honesty rule and teaching voice), and drops the stale
  ESM rationale rather than carrying a workaround for a solved problem.
- **Regenerated:** 2026-07-26, on the rebase of `feat/config-in-vite-config`
  onto `origin/main` at `bc1c4eac`. Bootstrapped by deleting the directory,
  then verified byte-identical by a second full harness run
  (`bun run test packages/cli/tests/legacy-snapshot.test.ts --config
  vitest.gates.config.ts` → 1 passed).
- **Diff vs previous golden:** `vite.config.ts` (config surface inlined,
  `app.head` + `agentReadiness` added, direct `viteAgentReadinessIntegration`
  import dropped) and `src/pages/index.aihu` (#612's copy, retained).

### 2026-07-21 — DA4 flip: binary shadow vocabulary, pin becomes `$shadow: 'light'` (#437)

- **Why it moved:** the founder-ratified DA4 flip landed together with the
  binary `ShadowMode = 'light' | 'shadow'` API (`'open'`/`'closed'`/`'none'`
  retired; `'closed'` never worked — it nulls `this.shadowRoot` and
  misdetects as light DOM). The legacy scaffold emitter
  (`packages/cli/src/index.ts::appIndexAihu`, plain/non-css branch) now pins
  `$shadow: 'light'` — the same light-DOM posture as before, spelled in the
  new vocabulary. Pages default to light DOM as of this release, so the pin
  is simply explicit about the default.
- **Regenerated:** 2026-07-21, on `feat/da4-light-dom-flip` (base
  `origin/main` at `89d9c9d5`). Only `src/pages/index.aihu` moved; verified
  byte-identical by a full harness run
  (`vitest run packages/cli/tests/legacy-snapshot.test.ts --config
  vitest.gates.config.ts`).
- **Diff vs previous golden:** exactly one line, in `src/pages/index.aihu` —
  `$shadow: 'none'` → `$shadow: 'light'`. No other file changed.

### 2026-07-20 — DA4 scaffold `$shadow: 'none'` pin (#437)

- **Why it moved:** DA4 phase 1 (founder-ratified, issue #437) intentionally
  changed the legacy scaffold emitter (`packages/cli/src/index.ts::appIndexAihu`,
  plain/non-css branch) to pin `$shadow: 'none'` in the generated index page's
  `@state` block. Pages default to light DOM at the next major; new apps adopt
  that now, and the pin keeps a fresh scaffold free of the new W472 warning.
- **Regenerated:** 2026-07-20, from the emitter on `fix/da4-classifier`
  (base `origin/main` at `774b38cf`). Only `src/pages/index.aihu` was
  rewritten — regenerated directly from `appIndexAihu('legacy-snapshot',
  false)` and then verified byte-identical by a full harness run.
- **Diff vs previous golden:** exactly one hunk, in `src/pages/index.aihu` —
  the `$shadow: 'none'` line (plus its blank separator) at the top of
  `@state`. No other file changed.

### 2026-07-20 — aihu-tsc typecheck (#434)

- **Why it moved:** PR #395 (commit `81279254`, 2026-07-13, "type-check .aihu
  files (aihu-tsc)") intentionally changed the legacy scaffold emitter
  (`packages/cli/src/index.ts::appPackageJson`) to emit
  `"typecheck": "aihu-tsc"` (plain `tsc` cannot see inside `.aihu` files) and
  a `"@aihu/tsc": "latest"` devDependency. The golden — last written
  2026-06-16 (`6a0d8e42`, #374) — was never regenerated, because the CI gate
  naming this test was silently no-opped by the root vitest exclude (#445).
- **Founder-ratified:** accept the evolution, regenerate the golden
  (investigation D1 option (a); ratified 2026-07-20 via /autoplan, issue #445).
- **Regenerated:** 2026-07-20, from emitter at commit `94ad14f7` (worktree of
  `fix/ci-honesty`, base `origin/main`).
- **Diff vs previous golden:** exactly two hunks, both in `package.json` —
  the `typecheck` script line and the `@aihu/tsc` dep addition. No other file
  changed.

## How to regenerate (intentional scaffold changes only)

Delete this directory and run the test twice through the gates config:

    bunx vitest run packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts

First run bootstraps a fresh golden (and fails loudly to say so); second run
verifies. The harness REFUSES to bootstrap when `process.env.CI` is set.
Record the regeneration here (why, date, emitter SHA) and commit.

- 2026-07-21 — grammar v2 (the prefix-less template): the legacy scaffold's
  generated `src/pages/index.aihu` now emits `on:click={…}` colon directives
  instead of the retired dollar-prefixed event layer (C607), so the frozen artifact
  compiles against the current `@aihu/compiler`. Emitter: feat/grammar-v2.
