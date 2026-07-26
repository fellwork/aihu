# @aihu/reactive

> **Aihu** — agentic discovery and interaction, for human purpose.

Fine-grained Proxy-backed deep reactive trees on aihu signals — lazy per-(object,key) tracking nodes, plain-assignment writes, mutate/reconcile.


<!-- BEGIN_HANDWRITTEN: prose -->
Design: [`docs/plans/2026-07-24-deep-reactivity.md`](../../docs/plans/2026-07-24-deep-reactivity.md).

A Solid-shaped node model (lazily allocated per-`(object, key)` tracking cells,
allocated on first proxy touch — tracked or not) with Vue-shaped write
ergonomics (plain `obj.key = value` assignment, no `setStore(...)` path
tuples). Built entirely on the public `@aihu/signals` API — `@aihu/signals`
is `external`, so this package adds **zero bytes** to the signals core row.

```ts
import { reactive, mutate, unwrap } from '@aihu/reactive'
import { computed, effect } from '@aihu/signals'

const user = reactive({ name: 'Ada', address: { city: 'London' }, tags: ['math'] })

effect(() => console.log(user.address.city)) // tracks node(user,'address') + node(addr,'city')

user.address.city = 'Cambridge' // one flush → logs

mutate(user, (u) => {
  // ONE flush for three writes
  u.name = 'Ada L.'
  u.address.city = 'Bletchley'
  u.tags.push('crypto')
})

const initials = computed(() => user.name.split(' ').map((s) => s[0]).join(''))
// initials does NOT recompute when address.city changes.

localStorage.setItem('user', JSON.stringify(unwrap(user)))
```

`reconcile(target, next, { key? })` merges a fresh payload (e.g. a hydration
snapshot or a refetch) into `target` in place — unchanged nested values keep
their proxy identity and notify nobody; only genuinely-changed paths flush.
`key` controls array-item matching (default: index; pass a property name or a
function for keyed reordering, e.g. `{ key: 'id' }`).

`@aihu/reactive/helpers` bridges the tree ↔ tuple worlds: `toSignal`/
`toSignals` lens reactive properties as `Signal` tuples, `toReactive` goes the
other way (a `Signal<object>` viewed as a reactive-looking object),
`reactivePick`/`reactiveOmit` are read-through views (no copies), and
`reactiveComputed(fn)` keeps a reactive object in sync with `fn()` via an
effect + `reconcile` — consumers reading one key only re-run when THAT key's
value actually changes.

**Non-wrappable values pass through unchanged**: `Date`, `Map`, `Set`,
`RegExp`, class instances, DOM nodes, and frozen objects are stored raw and
are replace-only — `reactive()` does not attempt to make them deeply
reactive (see the design doc §8.8/§8.9 for the reasoning).

Nothing shipped elsewhere changes: `signal`/`computed`/`effect`, and every
composable in `@aihu/use`, keep their existing contracts verbatim. This is a
purely additive new import, not new behavior on an old one.
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu/reactive
# or
bun add @aihu/reactive
```

<sub><i>Auto-generated against `@aihu/reactive@0.2.0`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.2.0` |
| **Tier** | G — State — fine-grained Proxy-backed deep reactive trees (lazy per-key nodes, plain-assignment writes) |
| **Bundle size** | 1.28 kB (gz) — limit 1900 B |
| **Published files** | 3 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/reactive@0.2.0`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |
| `./helpers` | `./dist/helpers.js` | `—` |

<sub><i>Auto-generated against `@aihu/reactive@0.2.0`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

**Dependencies:**

- `@aihu/signals` — `workspace:*`

<sub><i>Auto-generated against `@aihu/reactive@0.2.0`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [@aihu/signals](../signals)
- [@aihu/store](../store)
- [Aihu framework root](../../README.md)

<sub><i>Auto-generated against `@aihu/reactive@0.2.0`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/reactive@0.2.0`.</i></sub>

<!-- END_AUTOGEN: license -->
