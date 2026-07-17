---
"@aihu/signals": minor
"@aihu/arbor": minor
---

Reactivity correctness pass on @aihu/signals + hot-path refinement of @aihu/arbor.

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
