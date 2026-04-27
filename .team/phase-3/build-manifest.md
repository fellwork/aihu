# Build manifest — Phase 3 (`@scribe/arbor`)

Append-only log of files created/modified per task, with verification results. Mirrors Phase 2's `.team/phase-2/build-manifest.md` format.

**Spec:** `.team/phase-3/spec-arbor.md` (binding)
**Branch:** `phase-3/arbor-implementation`
**Worktree:** `C:/git/fellwork-worktrees/scribe-arbor-task-12`

---

<!-- Builder appends one section per task here. Format mirrors Phase 2:

## Task <N> — <description>

**Commit:** `<sha>`
**Files:**
- `<path>` — created|modified — <one-line purpose>

**Verification:**
- `moon run :typecheck` — PASS|FAIL
- `moon run :build` — PASS|FAIL, `dist/index.js <X> B gz`
- `bun run size` — PASS|FAIL, <actual> / <budget> B
- `bun run test` — <N>/<M> passing
- `bunx biome ci .` — PASS|FAIL

-->

## Task 12.5 — `untrack` prep (signals)

Per spec §1.1 (Team Lead Call 1). Authorized addition to `@scribe/signals` ahead of arbor source work. Also includes the CI trigger fix per spec §3.3 + Learning #5 — without `phase-*/**` in the push trigger, this branch produces no CI signal until a PR is opened.

**Commit:** `e3ac1ce`
**Files:**
- `packages/signals/src/untrack.ts` — created — `untrack<T>(fn): T` saves/restores observer via `setCurrentObserver`; verbatim implementation per spec §1.1.
- `packages/signals/src/index.ts` — modified — `export { untrack } from './untrack.ts'` (one line, alphabetical position).
- `packages/signals/tests/untrack.test.ts` — created — 3 unit tests verbatim from spec §1.1: no-dep, returns value, restores observer.
- `.github/workflows/plan-a.yml` — modified — added `'phase-*/**'` to `on.push.branches` so phase-3 branches get CI signal on push (Learning #5).

**Verification:**
- `bun run test packages/signals/tests/untrack.test.ts` — PASS, 3/3 (failed before export added — TDD confirmed)
- `bun run test` — PASS, **39/39** across 7 files (was 36/36 across 6; +3 untrack tests)
- `bun run typecheck` — PASS
- `bun run build` — PASS, `signals/dist/index.js` 716 B gz (was 698 B; +18 B for the untrack export)
- `bun run size` — PASS, **716 B / 1024 B** budget (308 B headroom)
- `bunx biome ci .` — PASS (initial run flagged organize-imports on the new test file — sorted to `effect, signal, untrack`; re-run clean)

---

## Task 12 — Scaffold `@scribe/arbor`

Per spec §3.1 + §5 (Task 12 file-level change list). Establishes `@scribe/arbor` as a workspace package with build/typecheck/size gates wired through Moon + size-limit. Source surface lands now: `errors.ts` (ArborError class hierarchy), `types.ts` (public type aliases), `node.ts` (internal Branch/Leaf runtime constructors with shape-locked fields per §2.9 + frozen `EMPTY_CHILDREN`). Index re-exports only the errors and types — primitives (`branch`, `leaf`, `mount`, `when`, `each`) follow in Tasks 13–18.

**Commit:** `99dfffb`
**Files:**
- `packages/arbor/package.json` — created — manifest mirroring signals' shape; dep on `@scribe/signals: workspace:*`; `scripts: { build, typecheck }`.
- `packages/arbor/tsconfig.json` — created — extends `../../tsconfig.base.json`; `rootDir: "."`, `outDir: "dist"`, `noEmit: true`, explicit `lib: ["ES2022", "DOM", "DOM.Iterable"]` per spec §3.1 because arbor touches the DOM.
- `packages/arbor/moon.yml` — created — `language: typescript` + `layer: library` (Moon 2.x).
- `packages/arbor/rolldown.config.ts` — created — copy of signals' rolldown config: ESM + sourcemap + dts.
- `packages/arbor/src/index.ts` — created — placeholder re-exports: `ArborError`, `ArborNotImplementedError` (values) + 8 type aliases (`AgentContext`, `AttrMap`, `Branch`, `ChildList`, `EventHandler`, `Leaf`, `Node`, `Snapshot`).
- `packages/arbor/src/errors.ts` — created — `ArborError` + `ArborNotImplementedError` per spec §1.8; comment notes that `code` and dev-mode `origin` fields land with devtools (matches signals' errors.ts pattern).
- `packages/arbor/src/types.ts` — created — public type definitions per spec §1: `Branch`, `Leaf`, `Node`, `AttrMap`, `ChildList`, `EventHandler`, `AgentContext`, `Snapshot`. `MountScope` deliberately not here — lives in `mount.ts` later (spec §5 final index).
- `packages/arbor/src/node.ts` — created — internal `_makeBranch`, `_makeTextLeaf`, `_makeElementLeaf` runtime constructors with shape-locked fields per §2.9 (always-present `null` for absent values); exports frozen module-level `EMPTY_CHILDREN`.
- `.size-limit.json` — modified — added `@scribe/arbor` row at 2048 B gz limit per spec §3.2; signals row preserved.
- `bun.lock` — modified — `bun install` registered the new workspace member (lockfile updated automatically).

**Verification:**
- `bun run typecheck` — PASS (`arbor:typecheck` 5.4s, signals unchanged)
- `bun run build` — PASS, `arbor/dist/index.js` 0.85 kB raw / **134 B gz**; signals unchanged
- `bun run size` — PASS, **signals 716 B / 1024 B**, **arbor 134 B / 2048 B** (1.91 kB headroom for primitives in Tasks 13–18)
- `bun run test` — PASS, 39/39 (no arbor tests yet; signals untouched)
- `bunx biome ci .` — PASS (one info-level diagnostic on `ArborError` constructor's `noUselessConstructor` — kept verbatim per spec §1.8 mandate; biome treats as info, exit 0)

---

## Task 13 — `leaf()` and `leaf.element()`

Per spec §1.3 + §5 (Task 13). `LeafFactory` interface (callable + `.element` method) lands as a thin delegation layer over the internal `_makeTextLeaf` / `_makeElementLeaf` constructors that batch 1 placed in `node.ts`. The callable form forwards `Signal<string> | string` directly — `Array.isArray` is the discriminant the consuming materialize step (Task 16) will use, so no detection logic lives here. `leaf.element(tag, attrs?)` normalizes omitted `attrs` to `null` before calling the internal factory, preserving the §2.9 shape-lock.

**Mount-coupled tests deferred:** Spec §4 lists 5 tests; tests #2–#5 require `mount()` (Task 16) which is not yet implemented. Per Builder Option A, the mount-coupled tests are deferred to Task 16's batch where they land naturally alongside `mount()` in `mount.test.ts`. The shape/discriminant/value-storage subset (9 tests) covers everything testable now.

**Commit:** `<task-13-sha>`
**Files:**
- `packages/arbor/src/leaf.ts` — created — `LeafFactory` + `leaf` const; delegates to internal `_makeTextLeaf` / `_makeElementLeaf`; ~30 source lines.
- `packages/arbor/tests/leaf.test.ts` — created — 9 unit tests across two `describe` blocks (text leaves: kind, leafKind, value preservation, shape-lock null tag/attrs, signal-tuple identity; element leaves: kind, leafKind, tag/attrs/value preservation, omitted-attrs normalization to null).
- `packages/arbor/src/index.ts` — modified — added `export { leaf } from './leaf.ts'` (one line, alphabetical position after `errors.ts`). `Leaf` type re-export unchanged from Task 12.

**Verification:**
- `bun run test packages/arbor/tests/leaf.test.ts` — PASS, **9/9** (9 failures before `leaf` export added — TDD confirmed)
- `bun run test` — PASS, **48/48** across 8 files (was 39/39 across 7; +9 leaf tests)
- `bun run typecheck` — PASS (`arbor:typecheck` 7s)
- `bun run build` — PASS, `arbor/dist/index.js` 1.85 kB raw / **249 B gz** (was 134 B; +115 B for the `leaf` factory + delegation)
- `bun run size` — PASS, **signals 716 B / 1024 B**, **arbor 249 B / 2048 B** (1.8 kB headroom)
- `bunx biome ci .` — PASS (still only the pre-existing `noUselessConstructor` info from `errors.ts`; no new diagnostics)

---
