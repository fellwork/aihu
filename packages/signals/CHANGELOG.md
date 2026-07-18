# @aihu/signals

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
