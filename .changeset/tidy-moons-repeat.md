---
'@aihu/use': minor
'@aihu/compiler': patch
---

`watch` → `useWatch`, and a new `useKeyedAsync` composable.

**BREAKING (`@aihu/use`, pre-1.0): `watch` is renamed to `useWatch`.**

`watch` was the only export in the package that did not follow the `useX`
convention — 66 of 67 composables were `useX`, and it was the sole holdout,
kept via the `gen-use.ts --bare` escape hatch it was also the only user of.

The original justification was the Vue precedent (Vue's core reactivity API
is `watch`, not `useWatch`). That argument does not survive the location:
Vue's `watch` is bare because it lives in the reactive CORE, alongside
`effect`/`computed`. This one lives in `@aihu/use` — the composables package
— where VueUse's own convention (and this package's) is `useX` without
exception. It cannot move to `@aihu/signals` instead: it depends on
`isClient`/`tryOnScopeDispose` and its SSR no-op contract is a `@aihu/use`
house rule, while `@aihu/signals` is deliberately platform-free. So it
belongs in `use`, and therefore it should be `useWatch`.

Two hazards retire with the old name:

- The auto-import registry entry carried a standing comment about `watch`
  being "a slightly higher collision-risk bare identifier than the rest of
  this registry (e.g. chokidar's `watch`, a locally named variable)". With
  `useWatch` the risk is gone and the comment is deleted.
- aihu already has a separate `$watch` state macro (v1-preserved). Two
  different `watch` concepts in one language was an avoidable ambiguity.

Migration — mechanical, and the compiler will not silently paper over it
(a bare `watch(` call no longer auto-imports):

```ts
// before
import { watch } from '@aihu/use/watch'
import type { WatchOptions, WatchCallback } from '@aihu/use'
watch(source, cb, { immediate: true })

// after
import { useWatch } from '@aihu/use/useWatch'
import type { UseWatchOptions, UseWatchCallback } from '@aihu/use'
useWatch(source, cb, { immediate: true })
```

Behavior is unchanged: still lazy by default, still `Object.is`-gated on the
source VALUE (not dependency changes), still runs its callback untracked,
still a documented SSR no-op. The exported `Dispose` type is now re-exported
from `@aihu/signals` rather than redeclared — structurally identical, one
fewer duplicated alias across packages.

**NEW: `useKeyedAsync(key, fn, options)`** — an async resource whose identity
is a reactive key. Fills the gap `useAsync`/`useAsyncAbortable` deliberately
leave open: those are "last call wins", but the previous call's `data` stays
visible while a new call is in flight (stale-while-revalidate). That is
correct for a plain re-fetch and wrong once the call's IDENTITY has changed —
a payload keyed to an abandoned identity is not merely outdated, it can be
actively wrong to render (e.g. re-anchoring word-level annotations to the
wrong verse during the async window while navigating). `useKeyedAsync` clears
to `initialData` the instant `key()` changes, before `fn` is called, and
aborts the superseded key's in-flight request. Returns
`{ data, error, isLoading, isFinished, reload }`; `reload()` re-fetches the
current key WITHOUT clearing (a refresh, not a navigation).

`@aihu/compiler`: `USE_COMPOSABLES` registry updated for both names (the
platform binaries bump accordingly).
