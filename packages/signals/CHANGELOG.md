# @aihu/signals

## 0.5.0

### Minor Changes

- [#549](https://github.com/fellwork/aihu/pull/549) [`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the lifecycle-ownership DX contract
  (docs/plans/2026-07-24-lifecycle-ownership-dx.md), scoped to `@aihu/signals`

  - `@aihu/runtime` only:

  * **`@aihu/signals/lifecycle`** — a new tree-shakable subpath (own
    `.size-limit.json` row, separate rolldown entry, 0 B added to the guarded
    `@aihu/signals` index row): a DOM-free ownership CONTRACT — a
    `LifecycleHost` interface (`connected: () => boolean`,
    `onCommit(fn): void`), a `WeakMap<EffectScope, LifecycleHost>`, an
    `@internal` `_attachLifecycleHost(scope, host)`, and `getLifecycleHost()`
    resolving via the public `getCurrentScope()`.
  * **`@aihu/runtime`** owns the rAF-coalesced commit queue and the
    per-connection `connected` signal, and attaches the `LifecycleHost` in
    `_build()` right after `_componentScopes.set`. `SetupContext` gains a
    `connected: () => boolean` field. A new bare `onCommit` export runs a
    registered callback once, after the next layout/paint opportunity,
    coalesced across every component into one `requestAnimationFrame` per
    frame; it is `_cur`-gated (setup-only), a tighter window than
    `LifecycleHost.onCommit` (valid during setup OR inside an `onMount` body).
    `connected` is created once inside `_build()`, so it is identical on the
    normal-connect path and the hydration path (`define-element.ts`'s
    hydration branch calls `_build()` directly and bypasses
    `define-component`'s `connectedCallback`); it latches to `false` inside
    `_stopComponentScope()` — the real shared teardown choke point — rather
    than being duplicated across `disconnectedCallback`.
  * The `@aihu/runtime` `.size-limit.json` row moves from 4500 B to 4750 B —
    `onCommit` + the per-instance `connected` signal are load-bearing per the
    design (§6.4). Measured with `@aihu/signals/lifecycle` correctly
    `ignore`d (see below): 4319 B → 4717 B, +398 B for this arc (higher than
    the design's own ~130 B estimate, but real — the review-fix follow-ups
    below account for the delta over the arc's initial 4630 B measurement:
    the fail-loud `SCR-R0014` check, `_dropCommitsFor`, and their regression
    tests all add bytes to the guarded row).

  **Review-fix follow-ups (same unreleased arc, not a separate release):**

  - `onCommit` (the bare `@aihu/runtime` export) now fails loud with
    `RuntimeError('SCR-R0014', ...)` instead of silently dropping the
    callback when `_cur` is set but the current scope has diverged from the
    component root scope — reachable from inside a synchronous `effect()`
    body during setup (signals P0-1 clears the current scope for every
    effect run) or a nested `effectScope().run()` during setup. Matches the
    design's stated contract (§7.2) and `onMount`'s fail-loud sibling
    behavior. New regression test in `packages/runtime/tests/commit.test.ts`.
  - `SetupContext.connected` is REQUIRED again, matching the approved design
    (§4.1) — the prior `connected?:` widening was justified by a
    misdiagnosis of the compiler's host-less SSR stubs (their `ctx` param is
    unannotated, so `SetupContext` was never the checked type there; verified
    with a full-workspace `bun run typecheck`, zero regressions).
  - The rAF-coalesced commit queue now drops a component's queued `onCommit`
    entries at disposal (`_dropCommitsFor`, `commit.ts`), not just at flush
    time — previously a disconnect in a suspended/hidden background tab
    (where `requestAnimationFrame` may never fire) left the queue retaining
    the dead scope and its closure's captures indefinitely. New regression
    tests assert immediate release.
  - `@aihu/signals/lifecycle` is now excluded (`ignore`) from the
    `@aihu/runtime` `.size-limit.json` measurement — it was being
    double-counted (inlined into the measured bundle despite being a real,
    separately-published external import in the actual `rolldown.config.ts`
    build), which is what actually accounted for most of the budget overshoot
    this row's limit bump was covering for.
  - `packages/signals/scripts/mangle-dist.mjs` now mangles every emitted
    `dist/*.js` file (not just `index.js`) with the same replacement table —
    `dist/` is no longer a single self-contained file, and mangling only one
    file would silently desync property names the moment a mangled field's
    declaration and its access land in different emitted files.
  - **No shared chunk on the reactivity hot path.** `rolldown.config.ts`
    builds `index` and `lifecycle` as two INDEPENDENT single-entry builds
    rather than one multi-entry build. A multi-entry build hoisted `scope.ts`
    into a shared `scope-<hash>.js` chunk, putting `getCurrentScope` /
    `setCurrentScope`, the scope cleanup register/unregister pair, and the
    live `_currentScope` binding across a module boundary that the minifier
    cannot inline through — an interleaved A/B against `main` (n=12 fresh
    processes per arm) measured a range-DISJOINT slowdown on `dynamic-deps`,
    with a byte-identical control arm at ~0 %. `dist/lifecycle.js` instead
    takes `getCurrentScope` as an EXTERNAL import of the sibling entry
    (`import{getCurrentScope}from"./index.js"`), which keeps exactly ONE
    `_currentScope` instance — duplicating `scope.ts` into both bundles would
    give the package two, and a scope entered through `@aihu/signals` would
    be invisible to `getLifecycleHost()`. `dist/index.js` is now
    `cmp`-byte-identical to `main`'s, and the same A/B puts `dynamic-deps` at
    −0.3 % and `creation-1to1000` at +0.4 % (both ranges overlapping `main`).
    The `@aihu/signals/lifecycle` size row measures 170 B (limit 300 B); the
    guarded `@aihu/signals` row returns to 2232 B.
  - `packages/signals/tests/lifecycle.test.ts` adds a source-level guard
    asserting `src/index.ts` never imports `src/lifecycle.ts` and that no
    other non-lifecycle source file references the `LifecycleHost`
    attach/read symbols — the design (§6.4) calls this a hard acceptance
    criterion, and the guarded size row alone is not a sufficient backstop at
    today's headroom (a cross-import would still pass the row).

  **Doc-discrepancy note (tracked as FEL-401):** the design doc claims
  `_stopComponentScope()` was already shared by both real
  `disconnectedCallback` forms in `define-component.ts` — that was false;
  neither called it (it was only reachable from the two
  `connectedCallback` throw-recovery paths and the hydration disconnect
  bridge). Both `disconnectedCallback` bodies now route through
  `_stopComponentScope()` too, which is what actually makes the `connected`
  flip work on every real teardown path, not a doc correction.

  **Deliberately deferred, NOT shipped here:** `useConnected()` and
  `tryOnCommit()` on `@aihu/use` — that package is being restructured by a
  concurrent workstream. `@aihu/use` still has no dependency on
  `@aihu/runtime` or on this new subpath. Also not shipped: `useMounted()`
  (the design shows it degenerates to a constant `true` — there is no
  observable moment where `mounted === false` in aihu), the compiler surface
  for `onCommit` (§2.4, `.aihu` template lowering), and the §3 DOM-move /
  `moveBefore()` remedy — all out of scope for this track.

## 0.4.0

### Minor Changes

- [#524](https://github.com/fellwork/aihu/pull/524) [`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2) Thanks [@srmcguirt](https://github.com/srmcguirt)! - feat(runtime): bind the component root to an effect scope (effect-scope plan §2)

  Every component instance now opens a DETACHED root `effectScope` around its
  `setup()` call; onMount bodies run inside it; the scope stops on disconnect
  (before `MountScope.dispose()` — DOM removal last), on HMR replace, on
  setup-throw, and (via the new define-element bridge) on hydrated-component
  disconnect. Effects/computeds created by composables during setup or onMount
  are automatically disposed on unmount — no manual dispose.

  - `@aihu/signals`: new `runWithoutScope(fn)` — run `fn` with no current scope
    (the explicit opt-out mirror of `runWithScope`).
  - `@aihu/arbor`: `mount()`/`hydrate()` wrap their synchronous effect wiring
    (including error-handler fallbacks) in `runWithoutScope`, so binding effects
    are owned by the MountScope exclusively and are never adopted by a component
    scope — even for a child custom element upgrading synchronously inside a
    parent's scoped `setup()`/`onMount` (P0-2b).

  BEHAVIOR CHANGES:

  - (a) `onCleanup` inside an `effect()` body now throws SCR-R0011 — the current
    scope is cleared for every effect run (P0-1), and the old behavior was itself
    a bug (it only worked on the effect's first run and risked cross-component
    mis-registration). Use the effect's per-run `onCleanup` argument instead.
    `onCleanup` also throws under a STOPPED current scope (async re-entry after
    the owner stopped) instead of silently dropping the callback — and is newly
    LEGAL inside `onMount` bodies and plain `effectScope.run()` frames.
  - (b) Unified-LIFO teardown order (ratified P0-3): everything the component
    owns — composable effect/computed handles, `onCleanup` callbacks, and
    onMount-returned teardowns — lives in ONE component-scope list drained LIFO
    by `scope.stop()`. This REVERSES the previous order (onCleanup FIFO in setup
    order, then onMount teardowns): onMount teardowns now run first (registered
    last), then setup-time cleanups in reverse registration order. All teardown
    still runs before DOM removal.

- [#522](https://github.com/fellwork/aihu/pull/522) [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db) Thanks [@srmcguirt](https://github.com/srmcguirt)! - feat(signals): effect scope + per-run cleanup

  First-class disposal owner for the composables foundation (effect-scope plan §1):

  - `effectScope` / `getCurrentScope` / `runWithScope` / `onScopeDispose` — a
    capturable disposal owner (effects, computeds, child scopes, cleanups). LIFO
    `stop()`, collect-run-all-rethrow-first errors, parent cascade + `detached`
    opt-out, O(1) swap-remove so the disposer list does not grow under churn.
  - Per-run effect cleanup: `EffectFn` widened to `(onCleanup) => void` (zero-arg
    bodies stay assignable), one nullable `cleanups` field, a single module-level
    registrar (zero per-run closures), drained on all dispose/re-run paths.

  The no-scope, no-cleanup path is behaviorally unchanged and adds only a handful
  of guarded compares with zero allocation (bench: cellx flat, no >10% p50
  regression across any workload). Disposal ownership only — the scope never
  carries context or error propagation.

## 0.3.0

### Minor Changes

- [#413](https://github.com/fellwork/aihu/pull/413) [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Reactivity correctness pass on @aihu/signals + hot-path refinement of @aihu/arbor.

  Signals — four correctness fixes, each with regression tests:

  - **Diamond graphs with equality suppression no longer miss updates.** The
    equality short-circuit (`shallowClear`) was last-settled-dep-wins: an
    unchanged computed dep could erase the mark contributed by a sibling dep
    that DID change (a written signal or a changed computed), silently skipping
    the effect run or leaving a sibling computed serving a stale cache. A new
    internal `CONFIRMED` flag records "an actual value change reached this sub";
    confirmed marks are immune to equality suppression.
  - **Dynamic dependency pruning.** Effects and computeds now drop dep edges
    they did not re-read on their latest run (`cond() ? a() : b()` unsubscribes
    from `a` after switching to `b`). Previously stale deps notified forever —
    extra effect runs and recomputes on every write to an abandoned branch.
  - **An effect whose first run throws is disposed before the throw
    propagates.** Previously the partially-linked effect stayed subscribed with
    no dispose handle, re-throwing from every later signal write.
  - **A computed whose recompute throws stays STALE.** The next read retries
    `fn()` instead of silently serving the previous cached value.

  Removed (nothing in the repo consumed them): the `$state`/`State` value-shape
  wrapper (use `signal()`; `@aihu/runtime`'s `$state` SFC macro is unrelated and
  unaffected) and arbor's never-thrown `ArborError` export.

  Perf: `drainBatch` no longer allocates a retired array per flush wave
  (index-chunked drain), drain loops are iterator-free, and arbor resolves the
  property-vs-attribute split once at bind time instead of re-running
  `namespaceURI` + `key in el` checks on every reactive attr update.

  **Lattice removed from the core.** `latticeSignal` / `boolLatticeSignal` /
  `maxLatticeSignal` (and the `LatticeSignal` type) are gone from `@aihu/signals`.
  Its only consumer was `@aihu-plugin/data`'s `createResource`, where both uses were
  plain signals in disguise — the bool coalescer is recreated per fetch (so its
  monotone merge was never exercised) and the max signal is a +1 counter. Both are
  migrated to plain `signal()`; equal-write suppression gives the same
  invalidate() coalescing for free. Frees the core of an unused abstraction.

## 0.2.0

### Minor Changes

- [#326](https://github.com/fellwork/aihu/pull/326) [`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix agent-driven `$action`/`$prop` lowering on the capability-bridge (client) path:

  - `batch(fn)` now returns its callback's value (was typed and implemented as `void`). The compiler lowers a `$action` handler to `return batch(() => { … })`, so an agent driving the action now receives the handler's return value instead of `undefined`. Callers that batch purely for side effects are unaffected.
  - The compiler emits writable-`$prop` write invokers as `(v) => name.set(v)` (the prop signal's setter) instead of `(v) => { name = v }`, which reassigned the `const` prop binding — a `TypeError` that also never reached the signal. Applied across the server `__agentBinding`, the client `__agentDispatcher` export, and the in-setup `_registerAgentDispatcher`.

  Net: over the capability bridge an agent can now read computed/prop state, drive actions and receive their return values, and write props — no `serialize()`-snapshot workaround. (A separate, deeper gap — `@state` macros not lowered at all in the server/universal build, breaking headless `__agentBinding` dispatch — is tracked in TODOS.md.)
