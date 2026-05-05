# Scout Report — Phase 2 (`@aihu/signals`)

**Author:** Scout
**Date:** 2026-04-26
**Worktree:** `c:/git/fellwork-worktrees/aihu-phase-2-builder` (branch `plan-a-phase-2`)
**Time spent:** ~30 min

---

## 1. In-repo state

### `packages/signals/` — file-by-file

| File | Bytes | Status | Notes |
|---|---|---|---|
| `package.json` | 418 | OK | name `@aihu/signals`, ESM-only, `sideEffects: false`, scripts: `build` (rolldown), `typecheck` (tsc --noEmit). No `test` script (intentional — root vitest discovers). No deps declared on rolldown/tsc — relies on root devDeps + bun workspace hoisting. |
| `tsconfig.json` | 191 | OK-ish | `"include": ["src/**/*.ts", "tests/**/*.ts"]`. `tests/` does not yet exist; tsc is fine with that, but it does mean any orphan `.ts` outside those globs is invisible. |
| `moon.yml` | 112 | **BROKEN** | Uses `type: library` — Moon 2.x rejects this field (see §1.1). |
| `rolldown.config.ts` | 247 | OK | rolldown 1.0.0-rc.17, `dts()` plugin, esm output to `dist/`. Single entry `src/index.ts`. |
| `src/errors.ts` | 312 | OK | Two classes: `SignalError extends Error`, `SignalCircularError extends SignalError` with `chain: readonly string[]`. Matches plan §530-636 exactly. |
| `src/index.ts` | 64 | **BROKEN under typecheck** | `export { SignalError, SignalCircularError } from './errors.ts'` — explicit `.ts` extension. Root tsconfig has `verbatimModuleSyntax: true` + `moduleResolution: Bundler` but does NOT set `allowImportingTsExtensions`. Verified by running `tsc --noEmit -p packages/signals/tsconfig.json`: → `error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.` |
| `tests/` | — | absent | Phase 2 tasks 7-11 will create this. Plan code samples use the same `.ts` extension imports throughout (see plan lines 703, 877, 1077, 1271, etc.) — every test file will hit the same TS5097 unless the tsconfig is amended. |

### 1.1 Confirmed Moon 2.x breakage

Reproduction (`moon --version` → `2.2.3`):

```
$ moon project signals
Error: config::parse::failed
  × Failed to parse packages/signals\moon.yml.
  ╰─▶   × type: unknown field `type`, expected one of `$schema`, `dependsOn`,
        │ `deps`, `docker`, `env`, `fileGroups`, `id`, `language`, `layer`,
        │ `owners`, `project`, `stack`, `tags`, `tasks`, `toolchains`,
        │ `workspace`
```

**Legal v2 alternatives** (from <https://moonrepo.dev/docs/config/project>):

- `layer:` — replaces v1 `type:`. Accepted values: `application`, `automation`, `configuration`, `library`, `scaffolding`, `tool`, `unknown`. **`layer: library`** is the direct port.
- `stack:` — orthogonal axis. Values: `backend`, `data`, `frontend`, `infrastructure`, `systems`, `unknown`. Optional.
- Or simply remove the field — `language: typescript` alone is enough for Moon to pick the project up.

The `.moon/tasks.yml` itself does NOT reference `type` and inherits cleanly. The fix is purely the per-package `moon.yml`.

> Same fix needed in **plan §602** (`type: library` is in the plan's example snippet for Task 6 step 3) — the Architect must update the plan as well as the file.

### 1.2 `.size-limit.json`

Currently lists **five rows**: `@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`, `@aihu/agent`, and a "Combined runtime family". Only `signals/dist/index.js` will exist after Phase 2 — the other four paths fail the size-limit gate with "file not found" until Phases 3-5 ship. **Plan Task 6 step 8 (line 657-672) explicitly mandates trimming this to a single signals row** and reinstating others in Tasks 12 / 20 / 23 / 25. The current file is therefore stale-by-plan; trimming is the first half-step of Task 6 step 8.

### 1.3 Root `vitest.config.ts` aliases

```ts
'@aihu/signals': new URL('./packages/signals/src/index.ts', ...).pathname
```

`packages/signals/src/index.ts` exists, so the alias resolves. Pattern repeats for arbor/runtime/agent — those still point at non-existent files. Vitest is fine with a missing alias target until something tries to import that name (none do today). **No action required for signals.**

### 1.4 CI workflow status (`.github/workflows/plan-a.yml`)

Three lines commented out (lines 23, 25, 26):

```yaml
      # - run: bun run typecheck
      # - run: bun run build
      # - run: bun run size
```

Comment on line 21 explicitly says: *"typecheck/build/size … are re-enabled in Phase 2 alongside @aihu/signals."* That re-enablement is the implicit final deliverable of Phase 2 (Task 11) and is **not** spelled out as a discrete step in the plan. The Architect should add it as a step in Task 11 or as Task 11.5.

---

## 2. Spec & plan synthesis

### 2.1 What the spec demands of `@aihu/signals`

Spec §7.4 (lines 216-226):

> - `signal<T>(init): Signal<T>` — function-style read/write
> - `$state<T>(init): T` — runes-style, compiled sugar over the same primitive
> - `computed(fn)`
> - `effect(fn)`
> - Circular dependency detection with typed error.
> **Design constraint (for future ecosystem compat):** Primitives must be designed such that a Vue-compatible surface (e.g., `.value` accessor, `watchEffect` alias) can be layered on in sub-project #11 without changes to the core. … just keep the core plastic enough to accept one.

Spec §6.5 (lines 148-161): both function-style `signal(0)` returning `[get, set]` and runes-style `$state(0)` exist; **both compile to the same underlying signal cells**. (This is load-bearing for the Plan's $state-via-signal-cell decision at line 1294-1304.)

Spec §6.6 (lines 165-177): size budget is **~1.0 KB gz for signals** alone, **≤ 4096 bytes for the combined family**, gated in CI.

Spec §2 (lines 25-29): "Node, Vite 8+, Rolldown are external pinned deps; everything above that floor is in-tree. Nuxt/Vue/UnJS/Nitro are reference shapes, not dependencies." — **No runtime dep on Vue or Solid is acceptable**, even for "compat".

Spec §13 anti-goal (line 427): *"Make `@aihu/signals` a generic Observable library → no, keep it aihu-focused."* — pushes back against feature creep (no `subscribe()`, no `.subscribe`, no Observable interop in v0).

### 2.2 What the plan prescribes for Phase 2

Plan §530-1633, Tasks 6-11. **Design clarifications applied** (plan §534-542):

- `signal<T>(init)` → tuple `[get, set]` (Solid-shaped).
- Equality short-circuit via **`Object.is`** on writes; opt out with `equals: false`. Custom `equals(a,b)` allowed.
- `effect(fn)` runs **synchronously** once at registration, captures deps, re-runs synchronously on dep change. Returns `dispose()`.
- `computed(fn)` is **lazy**: doesn't run until read; re-runs only when a dep changed since last read. Forwards observation when read inside another effect/computed.
- `$state(init)` returns `{ value: T }` accessor whose getter/setter delegates to the same signal cell (so the future SFC compiler emits `.value` access mechanically).
- **Cycle detection:** `running` flag on each computation; re-entry while running → throw `SignalCircularError` synchronously with chain context.
- **NO batching API in Phase 2.** Synchronous fan-out only. Defer batching to Phase 3+.

**Per-task TDD scaffold (plan §687-1633):**

| Task | Surface added | Tests added | Files |
|---|---|---|---|
| 6 | scaffold + errors | (none) | package.json, tsconfig, moon.yml, rolldown.config.ts, src/{index,errors}.ts |
| 7 | `signal()` | 5 unit (read, set, updater, Object.is short-circuit, equals:false no-throw) | src/signal.ts, tests/signal.test.ts |
| 8 | `effect()` | 6 unit (init run, re-run, eq-short-circuit, equals:false re-run, dispose, fan-out) | src/effect.ts, tests/effect.test.ts |
| 9 | `computed()` | 4 unit (derive, cache, downstream effect, lazy-chain) | src/computed.ts, tests/computed.test.ts; modifies signal.ts (adds `peekCurrentObserver`) |
| 10 | `$state()` | 4 unit (read, write, track, eq-short-circuit) | src/state.ts, tests/state.test.ts |
| 11 | cycle detection + property tests + size-limit gate | +2 cycle unit tests, 3 fast-check properties; full suite green; size budget enforced | modifies effect.ts/computed.ts; tests/properties.test.ts |

**Public surface at end of Phase 2** (plan §1639): `signal`, `effect`, `computed`, `$state`, `SignalError`, `SignalCircularError`, types `Read`/`Signal`/`SignalOptions`/`Write`/`Dispose`/`EffectFn`/`State`. Six runtime symbols, seven types.

### 2.3 Spec ↔ plan inconsistencies / ambiguities

1. **Equality default:** Spec §7.4 doesn't pin a default. Plan picks `Object.is`. Solid uses `===`, Vue uses `Object.is`. Plan's choice is defensible (matches Vue, plays well with `NaN`) but should be stated as a spec decision, not just a plan decision, since downstream layers will depend on it.
2. **Size budget for signals alone:** Spec §6.6 says "~1.0 KB gz", `.size-limit.json` enforces hard `1024 B`. Spec uses ~ (approximate), `.size-limit` uses === (hard gate). The plan inherits the hard gate. Architect should confirm "1024 B" is the contracted value, not "1.0 KB ≈ 1000 B".
3. **`peekCurrentObserver`:** Plan §1094-1104 introduces a non-destructive peeker on the global observer. Spec doesn't mention it; it's an implementation-internal helper. Risk: if exported, it leaks; if used cross-package later by arbor, it becomes a public API by accident.
4. **`SignalCircularError.chain`** is declared `readonly string[]` (errors.ts line 8, plan §632) but the implementations in plan §1451 and §1520 only push static labels `['effect']` / `['computed']`. The "chain context" promised by spec §10.2 isn't truly built — the chain is a one-element array of literals. **Decide:** is "chain" vestigial in v0, or should the Builder thread real labels through? Spec language ("chain context") suggests the latter; plan implementation is the former.
5. **Plan ↔ Moon 2.x:** Plan §595-603 uses `type: library`. Plan must be edited.
6. **Plan ↔ TS5097:** Plan code samples use `./errors.ts`, `./signal.ts`, `../src/state.ts`, etc. Combined with `verbatimModuleSyntax: true` in `tsconfig.base.json` (line 20), this is rejected by tsc unless `allowImportingTsExtensions: true` is added. **The current scaffold already fails typecheck on this.** Architect must decide: add `allowImportingTsExtensions` to the base tsconfig, or rewrite all import paths to omit extensions.

---

## 3. External prior art

### 3.1 Solid.js (`createSignal`, `createEffect`, `createMemo`)

- **Equality:** Default is `===` (reference equality), **not `Object.is`** despite the spec community often conflating them. `createSignal(v, { equals: false })` opts out (always notify); `equals: (a,b)=>boolean` accepts a custom comparator.
- **Lazy vs eager:** `createMemo` is **eager / push-based** in Solid 1.x — recomputes when a dep notifies, regardless of whether anyone reads it. (Solid 2.x is moving toward push-pull, but 1.x is the deployed baseline.)
- **Effect:** `createEffect` is **deferred to next microtask / batch** (Solid uses an internal scheduler; effects run after current synchronous work completes). Disposal via `getOwner()`/`onCleanup` or by being inside a `createRoot(dispose => …)`. No standalone `dispose` returned from `createEffect`.
- **Cycle detection:** Solid will detect and throw on re-entry within a single batch (uses a `STATE_DIRTY` / `STATE_PENDING` flag set; recursive writes to a tracked dep within an effect throw `Cyclic dependency detected`).
- **API ergonomics:** Tuple `[get, set]`. Reads via function call: `count()`. No `.peek()` — uses `untrack(() => count())` instead.
- **Bundle size:** solid-js core is reported at **~7 KB gz** for the full reactivity + JSX runtime package. The pure reactivity primitives are estimated at ~2-3 KB gz, but they are not separately published.

Source: <https://docs.solidjs.com/reference/basic-reactivity/create-signal>, <https://docs.solidjs.com/concepts/signals>, <https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts>.

### 3.2 `@vue/reactivity` (`ref`, `computed`, `effect`, `watch`)

- **Equality:** `ref` uses **`Object.is`** for primitive refs. Object refs use proxy identity (`hasChanged(value, oldValue)` → `!Object.is(...)`). Vue 3.5+ has a pull-based scheduler.
- **Lazy vs eager:** `computed` is **lazy** (getter runs on first `.value` read; cached until a dep marks it dirty).
- **Effect / watchEffect:** Default `flush: 'pre'` (runs before render). `flush: 'sync'` opts into immediate execution; `'post'` after render. Returns a `WatchHandle` with `stop()`/`pause()`/`resume()`.
- **Cycle detection:** **Vue silently swallows re-entrant writes.** `notify()` checks `if (this.flags & EffectFlags.RUNNING && !(this.flags & EffectFlags.ALLOW_RECURSE)) return`. So an effect that writes to its own dep gets the write applied to the cell but **does not** trigger a recursive re-run — and does **not** throw. (Found in `packages/reactivity/src/effect.ts` on `vuejs/core@main`.) This is a *very* different posture from the plan's "throw `SignalCircularError`". The plan's posture is closer to Solid's.
- **API:** Accessor `.value`. No `.peek()` — uses `toRaw()` or unref helpers.
- **Bundle size:** `@vue/reactivity` standalone is roughly **6-7 KB gz** (varies by version). Not the primary install path; most consumers get it via `vue` (~30 KB gz with reactivity).

Source: <https://vuejs.org/api/reactivity-core.html>, <https://github.com/vuejs/core/blob/main/packages/reactivity/src/effect.ts>.

### 3.3 Preact signals (`@preact/signals-core`)

- **Equality:** Uses `Object.is` (after a strict-equality fast path). Not configurable in the public API.
- **Lazy vs eager:** `computed` is **lazy** ("Lazy by default — automatically skip signals that no one listens to"). Effects pull values when re-running.
- **Effect:** Synchronous-by-default (re-runs in the microtask in which the write happens, but no async scheduler interposes). `effect(fn)` returns a dispose function. **Has** `batch()` for grouping writes; **has** `untracked()` for non-tracking reads.
- **Cycle detection:** Tracks "currently-running" via `_flags & RUNNING` on each node and throws `Cycle detected` when a write-during-run is detected. This is the closest prior art to the plan's design.
- **API:** `signal(0)` returns an object with `.value` (read & write) and `.peek()` (untracked read). Subscribe via `signal.subscribe(fn)` is also exposed. Has lifecycle callbacks: `signal({watched, unwatched})`.
- **Bundle size:** `@preact/signals-core` is roughly **1.5 KB gz** (older versions; current may be 1.3-1.6). The integrated `@preact/signals` (with Preact bindings) is reported as **1.6 KB gz** in their blog post. Bundlephobia data was not retrievable in this scout pass — Architect should verify against the latest version directly.

Source: <https://github.com/preactjs/signals/blob/main/packages/core/README.md>, <https://preactjs.com/blog/introducing-signals/>.

### 3.4 alien-signals (StackBlitz)

- **Equality:** Documentation light; codebase uses `Object.is`-equivalent. Not configurable.
- **Lazy vs eager:** Hybrid push-pull-pull. Push-marks dirty downstream; pulls value on read; effects pull at scheduler time. State machine has `Dirty`, `Pending`, `Recursed`, `RecursedCheck` flags.
- **Effect:** Effects scoped via `effectScope()` which returns a `stopScope()` cleanup. Outer effects run before inner; inner effects auto-clean when outer re-runs.
- **Cycle detection:** Has `RecursedCheck` and `Recursed` flags that prevent infinite propagation; not documented to throw — appears to break the cycle silently (similar posture to Vue).
- **API:** **Function-call API**: `const count = signal(1); count(); count(2)` — same shape for read and write, no `.value`. Closer to Solid in feel but as a single function rather than a tuple. This is unusual.
- **Bundle size:** No specific gz figure published; described as "the lightest signal library". `alien-deepsignals` (a wrapper) is "<1 KB". Core is plausibly <1 KB but **unverified**.

Source: <https://github.com/stackblitz/alien-signals>, <https://www.npmjs.com/package/alien-signals>.

### 3.5 S.js (Adam Haile)

- **Equality:** `S.data()` always notifies (no equality check). `S.value()` notifies only when `!==` (configurable comparator). Two distinct primitives by design.
- **Lazy vs eager:** Computations are **eager** within the current "tick"; S.js's headline contribution was a glitch-free synchronous propagation. Recomputes are pushed in topological order during a tick.
- **Effect:** Sync within a tick. Cleanup via `S.cleanup()` (registers a callback that runs before the next dep change). `S.root(dispose => …)` for manual lifetime management.
- **Cycle detection:** Detects via topological-order violation; throws when a computation tries to update a dep mid-tick.
- **API:** `const d = S.data(0); d(); d(1)` — function call for read and write, like alien. `S(() => …)` for computations. No `.value`.
- **Bundle size:** Historical. Reported ~1.5 KB gz.

Source: <https://github.com/adamhaile/S>.

### 3.6 Cross-cutting summary

| Lib | Eq default | Lazy `computed`? | Effect dispose | Cycle on self-write | Read/write API | Core gz |
|---|---|---|---|---|---|---|
| Solid | `===` | **eager (push)** | via owner / `createRoot` | throws | `[get,set]`, `count()` | ~3 KB (estimated) |
| Vue | `Object.is` | **lazy** | `WatchHandle.stop()` | **silently swallowed** | `.value` | ~6-7 KB |
| Preact | `Object.is` | **lazy** | dispose fn | **throws** | `.value`, `.peek()` | ~1.5 KB |
| alien | `Object.is`-ish | **lazy (push-pull)** | `effectScope` | flag-guarded, silent | `count()` | <1 KB (unverified) |
| S.js | `!==` (configurable) | **eager (sync tick)** | `S.cleanup` / `S.root` | throws | `count()` | ~1.5 KB |
| **Plan** | **`Object.is`** | **lazy** | dispose fn | **throws** | `[get,set]` + `.value` (state) | target ≤1024 B |

The plan most closely resembles **Preact signals** in semantics, with the **Solid `[get,set]` API shape**. The size budget (1024 B) is *more aggressive* than any prior art — Preact at 1.5 KB has `batch()`, `untracked()`, lifecycle hooks, AND `.subscribe()`, none of which Phase 2 ships. So 1024 B is plausible for our reduced surface, but tight.

---

## 4. Risk register

### 4.1 Tooling

- **R-T1 [HIGH]** Moon 2.x rejects `type: library` in `packages/signals/moon.yml`. Builder will hit this on Task 6 step 7. Fix: change to `layer: library` (or remove). Also requires plan edit at line 602.
- **R-T2 [HIGH]** TS5097: every `.ts` import in the scaffold + plan code samples fails typecheck because `tsconfig.base.json` has `verbatimModuleSyntax: true` + `moduleResolution: Bundler` and lacks `allowImportingTsExtensions: true`. Reproduced today on the existing `src/index.ts`. Fix: either add the compiler option or strip `.ts` extensions from imports throughout. The former is simpler (one line, all files); the latter touches every file in the plan.
- **R-T3 [MED]** Rolldown is on `^1.0.0-rc.17` — release-candidate churn between rc.17 and 1.0 final could change config surface. Plan locks the rc; if a fresh `bun install` upgrades to a newer rc with breaking config, the scaffold may need adjustment.
- **R-T4 [MED]** `rolldown-plugin-dts` is at `^0.23.2` — 0.x version, frequent breaking changes around TS resolver. If `dts()` can't resolve `./errors.ts` imports, build will fail even when tsc passes.
- **R-T5 [LOW]** Vitest 2.x with `environment: 'jsdom'` is overkill for `@aihu/signals` (no DOM use) and adds startup cost. Not blocking, but wastes a few hundred ms per run.
- **R-T6 [LOW]** Builder worktree has no `node_modules`. Builder must run `bun install` from the worktree (or symlink) before any task in Phase 2. Bun's workspace hoisting *should* DTRT but git worktrees + bun is not battle-tested.

### 4.2 API design

- **R-A1 [MED]** Plan's cycle behavior (throw) diverges from Vue (swallow). When `@aihu/signals` is later wrapped for Vue compat (sub-project #11), throwing on cycles is a stricter contract than Vue users expect — they may write code that Vue tolerates and Aihu rejects. Spec §10.2 says "Signal circular deps throw with chain context", so we're following spec — but flag for sub-project #11.
- **R-A2 [MED]** `SignalCircularError.chain` is declared as a meaningful array but plan implementation populates it with single-element literals (`['effect']`, `['computed']`). Either drop the field or thread real labels. Half-built fields rot.
- **R-A3 [LOW]** Plan exposes `setCurrentObserver` and `peekCurrentObserver` as module-level mutable state. They're not re-exported from `index.ts`, but they are exported from `signal.ts` — so any package that does `import { setCurrentObserver } from '@aihu/signals/src/signal.ts'` breaks the encapsulation. Add `/** @internal */` or restructure.
- **R-A4 [LOW]** `$state` returns `{ value: T }` plain object. There's no way to share the same cell across two `$state` instances or convert between `signal()` and `$state()` later. If the SFC compiler ever needs to bridge the two styles in one component, the cell-sharing story is undefined.

### 4.3 Size budget

- **R-S1 [MED]** 1024 B is tighter than Preact signals. Things that could blow it:
  - Stringly-typed errors (`'circular dependency detected: ' + chain.join(' -> ')`) — every distinct string costs bytes after gzip. Today: ~80 B.
  - `peekCurrentObserver` is a one-line indirection that could be inlined.
  - `equals: false` branch generates `null` checks throughout. Could be a sentinel function instead.
  - `$state` exists alongside `signal` even though both compile to the same cell — duplication is the price.
- **R-S2 [LOW]** Sourcemap output: rolldown.config.ts says `sourcemap: true`. size-limit measures `dist/index.js` only; sourcemap files don't count against budget. Good.
- **R-S3 [LOW]** Rolldown emits a default banner / runtime helper if any helper-needing TS feature is used (e.g. `__exportStar`). Verify none slip in.

### 4.4 Test infrastructure

- **R-X1 [MED]** vitest config has `coverage.exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts']`. `index.ts` is excluded — but we're shipping symbols ONLY through `index.ts`. Coverage will under-count the public surface. Architect: confirm exclusion is intentional (treats index as a re-export shim).
- **R-X2 [MED]** fast-check has no time/sample budget set. The plan's property tests run with default settings (~100 runs). On large inputs the "effect runs equal 1 + distinct consecutive writes" test could be slow on Windows. Consider `numRuns: 50` for CI speed.
- **R-X3 [LOW]** No vitest setup file; `jsdom` env loads for every test even though signals don't touch DOM. Future packages will need DOM; signals doesn't. Could split configs but probably not worth it for one package.
- **R-X4 [LOW]** Coverage thresholds are not configured — CI will report coverage but won't fail on regressions. Not blocking; architect may want to set thresholds in Task 11.

### 4.5 Cross-package (Phase 3 implications)

- **R-C1 [HIGH]** arbor (Phase 3) will need **batching** for structural updates (a signal write that retargets multiple DOM positions should produce one DOM mutation pass, not N). Plan §542 explicitly defers batching. **The decision to defer means arbor has to ship its own batching layer or adopt sync fan-out.** Either is fine, but the Architect should pick now to avoid Phase 3 bikeshedding.
- **R-C2 [MED]** arbor will need to read-without-tracking (the equivalent of `peek` / `untrack`) when it walks the tree to dispose. Plan's signals package has no public peek/untrack. arbor will need one — either added to signals retroactively (breaks the size budget?) or arbor reaches into `setCurrentObserver`.
- **R-C3 [MED]** `MountScope.dispose()` (spec §6.3) needs to compose with effect disposal — when a mount scope tears down, every effect created within it must dispose. Phase 2's `effect()` returns a single `Dispose` fn; there's no "current scope" concept. arbor will need to wrap `effect` in a scope-collector. Doable but Architect should verify Phase 2 doesn't paint into a corner here.
- **R-C4 [LOW]** Spec §7.4 calls out future Vue-compat (`.value`, `watchEffect`). `$state` already exposes `.value`. A `watchEffect` alias of `effect` would cost ~10 bytes. Phase 2 should at minimum **not** rule out adding it later (e.g. by re-using the `EffectFn` type so an alias would just work).

---

## 5. Do-not-break list

After Phase 2 ships, all of the following must still pass:

1. **Phase 1 CI**: `bunx biome ci .` — currently green.
2. **Phase 1 CI**: `bun run test --coverage` — currently green via `passWithNoTests: true`. After Phase 2, this becomes "must run signals tests, not skip".
3. **Root `tsconfig.json` include glob**: `["packages/*/src/**/*.ts", "packages/*/tests/**/*.ts", "tests/**/*.ts"]` (lines 1-7). Any future package's `src/` and `tests/` are picked up automatically; **don't narrow this**.
4. **Root `vitest.config.ts` aliases** for `@aihu/{signals,arbor,runtime,agent}`. Each must keep resolving, even when only signals exists. (Stale aliases targeting absent files don't hurt vitest until something imports them.)
5. **`.size-limit.json`** ends Phase 2 with **only the signals row enabled** (per plan §657-672). Re-enabling the other rows is the responsibility of Phases 3-5 (Tasks 12, 20, 23, 25).
6. **`.github/workflows/plan-a.yml`** — must re-enable the three commented lines (`typecheck`, `build`, `size`) by end of Phase 2. Currently only `biome ci` and `test --coverage` run.
7. **Root `package.json` engines/devDeps** — Phase 2 should NOT add new root devDeps; rolldown, tsc, vitest, biome, fast-check, size-limit are all already pinned. If Phase 2 needs to add a runtime dep, that's a red flag (the package should be zero-dep).
8. **`bun.lock`** must remain frozen-installable in CI (`bun install --frozen-lockfile`). Any new dep changes lockfile hash; commit the regenerated lockfile.
9. **`@aihu/signals/package.json` exports map** — externals must match: `import` path, `types` path, `files: ["dist"]`. Don't accidentally publish src/.
10. **Spec `<= 4096 bytes gz` family budget** — even though family-row is disabled in `.size-limit.json` during Phase 2, the contract holds for Phase 6. Builder must keep signals ≤ 1024 B so the budget downstream isn't pre-spent.

---

## Appendix A — File:line citations

- Spec foundation floor language: `docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md:25-29`.
- Spec signal API: `…/2026-04-23-…md:148-161` (§6.5), `…:216-226` (§7.4).
- Spec size budget: `…:165-177` (§6.6), `…:393` (§11.2 gate).
- Spec runtime errors: `…:359-367` (§10.2).
- Plan Phase 2 design clarifications: `…/plans/2026-04-24-…md:534-542`.
- Plan Task 6: `…:546-684` (current scaffold matches verbatim except moon.yml).
- Plan Task 7: `…:688-858`.
- Plan Task 8: `…:862-1059`.
- Plan Task 9: `…:1063-1252`.
- Plan Task 10: `…:1256-1390`.
- Plan Task 11: `…:1394-1633`.
- Plan exit criteria: `…:1639`.
- Existing scaffold (broken `.ts` import): `packages/signals/src/index.ts:1`.
- Existing scaffold (broken Moon `type:`): `packages/signals/moon.yml:3`.
- Root tsconfig include glob: `tsconfig.json:1-7`.
- Root tsconfig.base verbatimModuleSyntax: `tsconfig.base.json:20`.
- Vitest aliases: `vitest.config.ts:15-22`.
- CI commented lines: `.github/workflows/plan-a.yml:21-26`.
- size-limit current state: `.size-limit.json:1-37`.
