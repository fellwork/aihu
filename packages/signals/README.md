# @aihu/signals

> **Aihu** — agentic discovery and interaction, for human purpose.

Tiny reactive signals — the reactive primitive at the core of aihu.

Part of the **runtime core** layer of the Aihu meta-framework. Shipped to the client; sized via `bun run size`. The runtime core is dep-free and stacks under `@aihu/runtime` → `@aihu/router` → `@aihu/server` → `@aihu/app`.

<!-- BEGIN_HANDWRITTEN: prose -->
Small (≤ 1.6 kB gz) reactive primitives — the foundation layer for Aihu's arbor renderer. Two read shapes (`signal` tuple, `$state` value), one underlying cell. Sync semantics, lazy `computed`, explicit `batch`. No proxies, no scheduler queue, no global tick.

## Hello counter

```ts
import { signal, effect } from '@aihu/signals'

const [count, setCount] = signal(0)
effect(() => console.log('count =', count()))
setCount(1)            // logs "count = 1"
setCount((n) => n + 10) // logs "count = 11"
```

## Derived values with `computed`

```ts
import { signal, computed, effect } from '@aihu/signals'

const [n, setN] = signal(2)
const doubled = computed(() => n() * 2)

effect(() => console.log('doubled =', doubled())) // logs "doubled = 4"
setN(3)                                            // logs "doubled = 6"
```

`computed` is **lazy**: the body doesn't run until you read it. Subsequent reads return the cached value until a dep changes.

## Atomic updates with `batch`

```ts
import { signal, effect, batch } from '@aihu/signals'

const [name, setName] = signal('')
const [email, setEmail] = signal('')

effect(() => save(name(), email()))   // runs once per save event

batch(() => {
  setName('Ada')
  setEmail('ada@example.com')
})
// effect ran exactly once after the batch closed — not once per write.
```

`batch` returns `void`. To get a value out, capture it in a closure variable:
```ts
let id: string
batch(() => { id = insertRow(); setName('Ada') })
```

## Coming from Vue? Use `$state`

If `.value` muscle memory matters, use `$state` instead of `signal`:

```ts
import { $state, effect } from '@aihu/signals'

const count = $state(0)
effect(() => console.log(count.value))
count.value++   // works like Vue's ref
```

Same underlying cell as `signal` — pick the shape that fits your code.

## Cross-library cheat sheet

| Vue 3 | Solid | Preact Signals | aihu |
|---|---|---|---|
| `ref(0)` + `.value` | `createSignal(0)` → `[get, set]` | `signal(0)` + `.value` | `signal(0)` → `[get, set]` *or* `$state(0).value` |
| `computed(fn)` + `.value` | `createMemo(fn)` (eager) | `computed(fn)` + `.value` (lazy) | `computed(fn)` (lazy, call-shape) |
| `watchEffect(fn)` → `WatchHandle.stop()` | `createEffect(fn)` (microtask) | `effect(fn)` → dispose | `effect(fn)` → dispose (sync) |
| `nextTick` (no batch) | `batch(fn)` (returns) | `batch(fn)` (void) | `batch(fn)` (void) |

## Untrack a read

```ts
import { signal, computed, untrack } from '@aihu/signals'

const [a, setA] = signal(1)
const [b, setB] = signal(10)

const sum = computed(() => a() + untrack(() => b()))
// sum tracks `a` only; setB updates won't recompute `sum`
```

## Effect error isolation

When multiple effects fire in the same wave and one throws, sibling effects still run. The first thrown error rethrows directly; multiple thrown errors surface as `AggregateError`:

```ts
const [n, setN] = signal(0)
effect(() => { /* runs */ })
effect(() => { if (n() > 0) throw new Error('boom') })
effect(() => { /* still runs after sibling throws */ })

try { setN(1) } catch (e) { /* e is the original Error */ }
```

Computed-body throws bypass this path and continue to fail fast.

## Storing functions in signals

`Signal<T>` for function-typed `T` requires the closure-of-closure idiom:

```ts
const [getFn, setFn] = signal<() => number>(() => 5)
setFn(() => 6)            // ❌ TypeScript error
setFn(() => () => 6)      // ✅ stores the function
```

The runtime disambiguates `value` vs `updater` by `typeof === 'function'`, so a raw function is unambiguous *only* via the updater form. Mirrors SolidJS's `Setter<T>`. Detail: [`.team/phase-2/spec-signals-write-of-functions.md`](../../.team/phase-2/spec-signals-write-of-functions.md).

> **`$state<T>` for function-typed `T`** retains a pre-existing runtime quirk (the underlying write invokes the function rather than storing it). Use `signal()` directly for function-valued reactive state until the v1 fix lands.

## v0 limitations

- **Cycle errors carry no chain context.** `SignalCircularError` is thrown synchronously from the writer; richer chain info lands with devtools.
- **No `peek` / `onCleanup`.** Single-purpose primitives only; arbor's higher-level scopes live in `@aihu/arbor`.
- **Batch cascade cap.** `batch()` re-iterates up to 100 times before throwing `SignalCircularError`. The cap is internal; if tooling needs to sanity-check legitimate cascade depth in the future, we'll re-export it.
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu/signals
# or
bun add @aihu/signals
```

<sub><i>Auto-generated against `@aihu/signals@0.1.0`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.1.0` |
| **Tier** | A — Reactive runtime core — signals/computeds/effects |
| **Bundle size** | 1.75 kB (gz) — limit 1970 B |
| **Published files** | 3 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/signals@0.1.0`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |

<sub><i>Auto-generated against `@aihu/signals@0.1.0`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

_Zero runtime dependencies_ (per the [dep-free thesis](../../README.md#project-posture))_._

<sub><i>Auto-generated against `@aihu/signals@0.1.0`.</i></sub>

<!-- END_AUTOGEN: deps -->

## Server-Side Rendering (SSR)

`@aihu/signals` uses module-level reactive state (`currentObserver`, `batchQueue`, `effectQueue`, `wave`, and the link pool) that is **shared across all concurrent requests** in the same Node.js worker thread — it is not request-isolated by default.

If you use `@aihu/signals` in server-side code (via `@aihu/data`'s `resource()` or directly):

- Wrap all async operations inside effects with `untrack()` to prevent `currentObserver` from leaking across request boundaries during event-loop yields.
- Do not hold live reactive graphs between requests — dispose effects when the request completes.
- For true request isolation, instantiate signals within a request-scoped context rather than at module level.

Client-side usage (browser custom elements, arbor mounts) is unaffected — each tab is an isolated JS environment.

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [Phase 2 spec (signals)](../../.team/phase-2/spec-signals.md)
- [bench/signals](../../bench/signals/RESULTS.md)
- [@aihu/arbor](../arbor)
- [Aihu framework root](../../README.md)

<sub><i>Auto-generated against `@aihu/signals@0.1.0`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/signals@0.1.0`.</i></sub>

<!-- END_AUTOGEN: license -->
