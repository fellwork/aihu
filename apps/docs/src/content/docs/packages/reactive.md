# @aihu/reactive

Fine-grained, Proxy-backed deep reactive trees on aihu signals — lazily allocated per-`(object, key)` tracking nodes, plain-assignment writes, and in-place `mutate` / `reconcile`.

Built entirely on the public [`@aihu/signals`](/docs/api-reference) API. `@aihu/signals` is `external` to this package's bundle, so `@aihu/reactive`'s own size row carries **no duplicate copy of signals** — you pay for the node model, not a second reactivity core.

## Install

```bash
bun add @aihu/reactive
# or
npm install @aihu/reactive
```

## The model

A Solid-shaped node model — tracking cells are allocated lazily per `(object, key)` on first proxy touch, tracked or not — with Vue-shaped write ergonomics: plain `obj.key = value` assignment, no `setStore(...)` path tuples.

```ts
import { reactive, mutate, unwrap } from '@aihu/reactive'
import { computed, effect } from '@aihu/signals'

const user = reactive({
  name: 'Ada',
  address: { city: 'London' },
  tags: ['math'],
})

effect(() => console.log(user.address.city))
// tracks node(user,'address') + node(address,'city')

user.address.city = 'Cambridge' // one flush → logs
```

Because tracking is per-key, a computed reading one property does not re-run when a sibling changes:

```ts
const initials = computed(() =>
  user.name.split(' ').map((s) => s[0]).join(''),
)
// initials does NOT recompute when address.city changes.
```

## Batching writes — `mutate`

`mutate(target, fn)` collapses every write in `fn` into a single flush:

```ts
mutate(user, (u) => {
  // ONE flush for three writes
  u.name = 'Ada L.'
  u.address.city = 'Bletchley'
  u.tags.push('crypto')
})
```

## Merging fresh data — `reconcile`

`reconcile(target, next, { key? })` merges a fresh payload — a hydration snapshot, a refetch — into `target` **in place**. Unchanged nested values keep their proxy identity and notify nobody; only genuinely-changed paths flush.

```ts
import { reconcile } from '@aihu/reactive'

reconcile(list, await refetch(), { key: 'id' })
```

`key` controls array-item matching. The default is index; pass a property name or a function for keyed reordering.

## Escaping the proxy — `unwrap`

`unwrap` returns the raw underlying object, which is what you want before serializing:

```ts
localStorage.setItem('user', JSON.stringify(unwrap(user)))
```

`isReactive(value)` reports whether a value is one of this package's proxies.

## Values that are not wrapped

**Non-wrappable values pass through unchanged.** `Date`, `Map`, `Set`, `RegExp`, class instances, DOM nodes, and frozen objects are stored raw and are **replace-only** — `reactive()` does not attempt to make them deeply reactive.

To update one, assign a new value rather than mutating in place:

```ts
user.updatedAt = new Date()      // ✓ flushes
user.updatedAt.setHours(0)       // ✗ raw mutation, notifies nobody
```

See §8.8 / §8.9 of the [design doc](https://github.com/fellwork/aihu/blob/main/docs/plans/2026-07-24-deep-reactivity.md) for the reasoning.

## Helpers — `@aihu/reactive/helpers`

The helpers entry bridges the tree and tuple worlds:

| Export | What it does |
|---|---|
| `toSignal(target, key)` | Lens a single reactive property as a `Signal` tuple. |
| `toSignals(target)` | Lens every own property as a `Signal` tuple. |
| `toReactive(signal)` | The other direction — a `Signal<object>` viewed as a reactive-looking object. |
| `reactivePick(target, ...keys)` | Read-through view of a subset of keys. No copy. |
| `reactiveOmit(target, ...keys)` | Read-through view with keys excluded. No copy. |
| `reactiveComputed(fn)` | Keeps a reactive object in sync with `fn()` via an effect + `reconcile`. Consumers reading one key only re-run when **that** key's value actually changes. |

```ts
import { reactivePick, reactiveComputed } from '@aihu/reactive/helpers'

const identity = reactivePick(user, 'name', 'tags')

const summary = reactiveComputed(() => ({
  label: `${user.name} — ${user.address.city}`,
  tagCount: user.tags.length,
}))
// reading summary.tagCount does not re-run when label changes
```

## Compatibility

Nothing shipped elsewhere changes. `signal` / `computed` / `effect`, and every composable in [`@aihu/use`](/docs/packages/use), keep their existing contracts verbatim. `@aihu/reactive` is additive.

## How it relates

- [`@aihu/signals`](/docs/api-reference) — the substrate. `@aihu/reactive` is a node model built on the public signals API, not a parallel reactivity system.
- [`@aihu/use`](/docs/packages/use) — composables returning flat getter objects. Reach for `@aihu/reactive` when the state is a nested tree and you want per-key tracking through it.

Design notes: [`docs/plans/2026-07-24-deep-reactivity.md`](https://github.com/fellwork/aihu/blob/main/docs/plans/2026-07-24-deep-reactivity.md). The package README is the authoritative reference: [packages/reactive](https://github.com/fellwork/aihu/tree/main/packages/reactive).
