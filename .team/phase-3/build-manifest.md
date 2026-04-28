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

**Commit:** `7853253`
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

## Task 14 — `branch()`

Per spec §1.2 + §5 (Task 14). `branch(tag, attrs?, children?)` lands as a thin delegation layer over the internal `_makeBranch` constructor in `node.ts`. Two normalizations happen here so the §2.9 shape-lock is preserved at the boundary: omitted `attrs` becomes `null` (NOT `undefined`), and omitted `children` becomes the frozen module-level `EMPTY_CHILDREN` reused across every childless branch (saves a per-call allocation per spec §2.9). Null-tag branches are accepted directly — runtime defensiveness for `null` tag with non-empty attrs lands in v1 per spec §1.2; the compiler never emits that combination.

**Mount-coupled tests deferred:** Spec §4 lists 4 tests; tests #2–#4 require `mount()` (Task 16) which is not yet implemented. Per Builder Option A, mount-coupled tests are deferred to Task 16's batch where they land naturally alongside `mount()` in `mount.test.ts`. The shape/storage/identity-preservation subset (9 tests) covers everything testable now.

**Commit:** `9d6639a`
**Files:**
- `packages/arbor/src/branch.ts` — created — `branch()` factory; delegates to internal `_makeBranch` with `??` fallbacks for the §2.9 shape-lock; ~25 source lines.
- `packages/arbor/tests/branch.test.ts` — created — 9 unit tests across two `describe` blocks (element branches: kind, tag preservation, omitted-attrs/children normalization, EMPTY_CHILDREN identity sharing across calls, frozen-children invariant, attrs object identity, children array contents; fragment/null-tag: tag stays null, children stored on the node).
- `packages/arbor/src/index.ts` — modified — added `export { branch } from './branch.ts'` (one line, alphabetical position before `errors.ts`). `Branch` and `ChildList` type re-exports unchanged from Task 12.

**Verification:**
- `bun run test packages/arbor/tests/branch.test.ts` — PASS, **9/9** (9 failures before `branch` export added — TDD confirmed)
- `bun run test` — PASS, **57/57** across 9 files (was 48/48 across 8; +9 branch tests)
- `bun run typecheck` — PASS (`arbor:typecheck` 5.4s)
- `bun run build` — PASS, `arbor/dist/index.js` 4.13 kB raw / **285 B gz** (was 249 B; +36 B for the `branch` factory)
- `bun run size` — PASS, **signals 716 B / 1024 B**, **arbor 285 B / 2048 B** (1.76 kB headroom for Tasks 15–18)
- `bunx biome ci .` — PASS (still only the pre-existing `noUselessConstructor` info from `errors.ts`; no new diagnostics)

---

## Task 15 — AttrMap binding (`_applyAttrs` + `_setAttrOrProp`)

Per spec §1.2 + §2.4 + §2.7 + §5 (Task 15). The internal AttrMap binding lands as `attrs.ts`: `_applyAttrs` walks each `[key, value]` entry and dispatches in three-path precedence order (event handler → reactive signal → static primitive); `_setAttrOrProp` resolves the property-vs-attribute split via `key in el` per spec §2.4. Path keys per §2.7 are constructed as `<pathBase>.attr:<key>` so sub-projects #6 (resumable hydration) and #7 (agent live-binding) can address subscriptions later.

**Option C (dependency injection) for `mountEffect`.** `_applyAttrs` accepts `mountEffect` as a function parameter rather than importing from `mount.ts` (which doesn't exist yet — Task 16). This keeps the module testable in isolation against a spy and avoids any forward-reference / circular-import shape between `attrs.ts` and `mount.ts`. The signature `MountEffectFn = (disposers, fn, path) => void` is also exported as `/** @internal */`. Task 16's `_materialize` will pass the real `_mountEffect` through.

**Mount-coupled tests deferred:** Spec §4 lists 6 tests; the signal-firing test (#4: signal write updates `getAttribute`) requires the real `_mountEffect` and is deferred to Task 16's `mount.test.ts`. The directly-testable subset (9 tests) covers `_setAttrOrProp`'s three-path mechanics (attr write, property write, `String()` coercion) plus `_applyAttrs`'s three detection paths (event listener + dispatch verification, reactive path's mountEffect invocation + path-key shape, static-primitive path, on*-vs-static precedence, null no-op, multi-key path-suffix construction).

**Index unchanged.** `_applyAttrs` and `_setAttrOrProp` are `/** @internal */` and never re-exported. Per Learning #13 only public symbols re-export. Confirmed `git diff packages/arbor/src/index.ts` is empty for this task. The `AttrMap` and `EventHandler` type re-exports listed in spec §5 already shipped in Task 12's index.

**Commit:** `e407a76`
**Files:**
- `packages/arbor/src/attrs.ts` — created — `_applyAttrs(el, attrs, disposers, pathBase, mountEffect)` + `_setAttrOrProp(el, key, value)` + exported `MountEffectFn` type alias; ~108 lines (≈ 50 SLOC + JSDoc), well under the 150-line cap.
- `packages/arbor/tests/attrs.test.ts` — created — 9 unit tests across two `describe` blocks. `_setAttrOrProp` block: static attr write, property assignment for `disabled`, `String()` coercion of numbers. `_applyAttrs` block: event handler registration + dispatch, static-primitive path, reactive path with `<pathBase>.attr:<key>` path-key verification, `on*`-takes-precedence-over-static corner case, null-attrs no-op, multi-key path-suffix construction.

**Verification:**
- `bun run test packages/arbor/tests/attrs.test.ts` — PASS, **9/9** (failed before `attrs.ts` existed — TDD confirmed)
- `bun run test` — PASS, **66/66** across 10 files (was 57/57 across 9; +9 attrs tests)
- `bun run typecheck` — PASS (`arbor:typecheck` 2.1s after `as never` casts on the fake-Signal test fixtures to bypass `Signal<unknown>`'s strict tuple variance)
- `bun run build` — PASS, `arbor/dist/index.js` 4.13 kB raw / **285 B gz** — UNCHANGED from Task 14, confirming `attrs.ts` is fully tree-shaken from the public bundle (it has no consumer until `materialize.ts` lands in Task 16)
- `bun run size` — PASS, **signals 716 B / 1024 B**, **arbor 285 B / 2048 B** (1.76 kB headroom for Tasks 16–18)
- `bunx biome ci .` — PASS, exit 0 (still only the pre-existing `noUselessConstructor` info from `errors.ts`; no new diagnostics)

---

## Task 16 — `mount()` + `MountScope` + `_materialize` + scope collector + telemetry

Per spec §1.4 + §1.5 + §2.2 + §2.3 + §2.7 + §2.8 + §5 (Task 16). `mount()` materializes synchronously into the host (`Element | ShadowRoot`), wires reactive subscriptions through `_mountEffect`, and returns a `MountScope` exposing `dispose`/`agent`/`serialize`. Path keys per §2.7 flow through every `_mountEffect` registration as `<rootId>.<index-chain>.<binding-kind>` (e.g. `0.0.text`, `0.1.attr:class`). Telemetry hooks per §2.8 emit at five reactivity boundaries (`mount-start`, `mount-end`, `effect-create`, `effect-fire`, `effect-dispose`); production observer is a no-op slot and `_setMountObserver` is the dev-plugin override seam.

`_materialize` is a small (≤ 100 SLOC) recursive walk per spec §2.3 with four cases (text leaf, element leaf, branch with tag, fragment branch with null tag). The fragment case appends children directly to host and returns the flat list of DOM nodes for disposal-time removal. Branch+tag wraps children inside `createElement(tag)` with attrs applied via `_applyAttrs` (the Task 15 DI seam — `mount.ts`'s `_mountEffect` is now the real consumer).

Disposal is wired in this commit (LIFO + DOM removal + idempotency) since the synchronous `dispose` contract is needed for the spec test "scope.dispose() does not throw." Task 17's commit only appends the four verification tests.

`agent` returns the frozen `Object.freeze({ _brand: 'AgentContext' as const })` stub; `serialize()` throws `ArborNotImplementedError('serialize()')`.

**Folded-in mount-coupled tests (Builder Option A).** Tests deferred from Tasks 13/14/15 land in `mount.test.ts` alongside the spec tests for Task 16. Total in this file (Task 16 commit): 16 tests.

**Telemetry tree-shake verification.** Per spec §2.8 the production observer should tree-shake to zero bytes; in practice five `_observeMount` call sites survive Rolldown + esbuild minification because each call constructs a `Date.now()` literal (impure expression — minifier preserves). Overhead is ~100-200 B, not the spec's ~5 B target. Not blocking — arbor headroom is 913 B. Builder note in `.team/phase-3/builder-notes.md` documents the `__DEV__`-constant fallback for when budget tightens.

**Commit:** `<sha-pending>`
**Files:**
- `packages/arbor/src/materialize.ts` — created — `_materialize(node, host, disposers, pathBase, mountEffect)` recursive walk; ~95 source lines.
- `packages/arbor/src/mount.ts` — created — `mount()`, `MountScope`, `_mountEffect`, `_observeMount`, `_setMountObserver`, `_activeMountDisposers`, `MountTelemetry` interface; LIFO disposal + DOM removal + idempotency baked in (Task 17 verifies); ~135 source lines.
- `packages/arbor/src/index.ts` — modified — added `mount` value re-export and `MountScope` type re-export.
- `packages/arbor/tests/mount.test.ts` — created — 16 tests across six `describe` blocks: Task 16 spec tests (5 + one exactly-once propagation), folded leaf integration tests (4 covering Tasks 13#2-#5), folded branch integration tests (3 covering Tasks 14#2-#4), folded attrs integration tests (1 covering Task 15#4), telemetry hooks (1 covering §2.8), path keys (1 covering §2.7).
- `.team/phase-3/builder-notes.md` — created — non-blocking note on telemetry tree-shaking partial elimination + `_activeMountDisposers` `export let` rationale.

**Verification:**
- `bun run test packages/arbor/tests/mount.test.ts` — PASS, **16/16**
- `bun run test` — PASS, **82/82** across 11 files (was 66/66 across 10; +16 mount tests)
- `bun run typecheck` — PASS (`arbor:typecheck` ~3s)
- `bun run build` — PASS, `arbor/dist/index.js` 12.22 kB raw / **1.14 kB gz** (was 285 B; +855 B for `mount.ts` + `materialize.ts` + telemetry hooks + DI wiring of `_applyAttrs`)
- `bun run size` — PASS, **signals 716 B / 1024 B**, **arbor 1.14 kB / 2.05 kB** (913 B headroom for Tasks 17 + 18 + 19)
- `bunx biome ci .` — PASS, exit 0 (only the pre-existing `noUselessConstructor` info from `errors.ts`; no new diagnostics)
- **Telemetry tree-shake check:** five `_observeMount` literals (`mount-start`, `mount-end`, `effect-create`, `effect-fire`, `effect-dispose`) survive minification — see `.team/phase-3/builder-notes.md`. ~100-200 B overhead vs. spec's ~5 B target. Not blocking.

---
