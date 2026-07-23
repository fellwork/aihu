---
"@aihu/signals": minor
---

feat(signals): effect scope + per-run cleanup

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
