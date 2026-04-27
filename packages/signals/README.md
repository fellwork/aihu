# @scribe/signals

Tiny (~1 KB gz) reactive primitives — the foundation layer for Scribe's arbor renderer. Two read shapes (`signal` tuple, `$state` value), one underlying cell. Sync semantics, lazy `computed`, explicit `batch`. No proxies, no scheduler queue, no global tick.

## Hello counter

```ts
import { signal, effect } from '@scribe/signals'

const [count, setCount] = signal(0)
effect(() => console.log('count =', count()))
setCount(1)            // logs "count = 1"
setCount((n) => n + 10) // logs "count = 11"
```

## Derived values with `computed`

```ts
import { signal, computed, effect } from '@scribe/signals'

const [n, setN] = signal(2)
const doubled = computed(() => n() * 2)

effect(() => console.log('doubled =', doubled())) // logs "doubled = 4"
setN(3)                                            // logs "doubled = 6"
```

`computed` is **lazy**: the body doesn't run until you read it. Subsequent reads return the cached value until a dep changes.

## Atomic updates with `batch`

```ts
import { signal, effect, batch } from '@scribe/signals'

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
import { $state, effect } from '@scribe/signals'

const count = $state(0)
effect(() => console.log(count.value))
count.value++   // works like Vue's ref
```

Same underlying cell as `signal` — pick the shape that fits your code.

## Cross-library cheat sheet

| Vue 3 | Solid | Preact Signals | scribe |
|---|---|---|---|
| `ref(0)` + `.value` | `createSignal(0)` → `[get, set]` | `signal(0)` + `.value` | `signal(0)` → `[get, set]` *or* `$state(0).value` |
| `computed(fn)` + `.value` | `createMemo(fn)` (eager) | `computed(fn)` + `.value` (lazy) | `computed(fn)` (lazy, call-shape) |
| `watchEffect(fn)` → `WatchHandle.stop()` | `createEffect(fn)` (microtask) | `effect(fn)` → dispose | `effect(fn)` → dispose (sync) |
| `nextTick` (no batch) | `batch(fn)` (returns) | `batch(fn)` (void) | `batch(fn)` (void) |

## v0 limitations

- **Cycle errors carry no chain context.** `SignalCircularError` is thrown synchronously from the writer; richer chain info lands with devtools.
- **No `untrack` / `peek` / `onCleanup`.** Single-purpose primitives only; arbor's higher-level scopes live in `@scribe/arbor`.
