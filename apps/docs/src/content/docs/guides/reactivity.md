# Reactivity

`@aihu/signals` provides the reactive foundation for the entire aihu framework. It uses a push-based, synchronous execution model: when a signal is written, all dependent effects run immediately.

## `signal<T>(initialValue)`

Creates a writable reactive cell:

```typescript
import { signal } from '@aihu/signals'

const count = signal(0)

count()       // read: returns 0
count(1)      // write: sets to 1, flushes effects
```

Signals are the atomic unit of state. They are not wrapped in objects or proxies — call them as functions to read or write.

## `computed<T>(fn)`

Derives a read-only signal from other signals:

```typescript
import { signal, computed } from '@aihu/signals'

const count = signal(0)
const doubled = computed(() => count() * 2)

doubled() // 0
count(5)
doubled() // 10
```

Computed signals are lazily evaluated and memoized. They re-evaluate only when a tracked dependency changes.

## `effect(fn)`

Runs a side effect whenever tracked signals change. Returns a dispose function:

```typescript
import { signal, effect } from '@aihu/signals'

const name = signal('world')
const dispose = effect(() => {
  console.log('Hello,', name())
})
// Logs: "Hello, world"

name('aihu')
// Logs: "Hello, aihu"

dispose() // stops the effect
```

Effects run synchronously after each signal write. They auto-track all signals read during their execution.

To clean up resources when an effect re-runs, return a cleanup function:

```typescript
const dispose = effect(() => {
  const id = setInterval(() => tick(), 1000)
  return () => clearInterval(id)  // called before next run or on dispose
})
```

## `batch(fn)`

Defers effect flushes until the batch function returns:

```typescript
import { signal, effect, batch } from '@aihu/signals'

const a = signal(0)
const b = signal(0)

effect(() => console.log(a(), b()))

batch(() => {
  a(1)  // no flush yet
  b(2)  // no flush yet
})
// Now effects flush once with a=1, b=2
```

`batch` is useful when updating multiple signals that drive the same derived computation — it prevents intermediate renders. This is the preferred pattern for atomic multi-signal updates.

## `untrack(fn)`

Reads signals inside `fn` without subscribing to them. Re-entrancy safe:

```typescript
import { signal, effect, untrack } from '@aihu/signals'

const count = signal(0)
const multiplier = signal(2)

effect(() => {
  // Only subscribes to count, not multiplier
  const m = untrack(() => multiplier())
  console.log(count() * m)
})
```

`untrack` is re-entrancy safe — calling it from inside an `effect` or another `untrack` works correctly.

## Lattice signals

Lattice signals are merge-monotone reactive cells. They are useful for collaborative state where multiple sources update the same value and the result should be the "join" of all inputs.

### `latticeSignal<T>(merge, initial)`

General-purpose lattice signal with a custom merge function:

```typescript
import { latticeSignal } from '@aihu/signals'

const versions = latticeSignal<Set<string>>(
  (a, b) => new Set([...a, ...b]),
  new Set()
)
```

### `boolLatticeSignal(initial?)`

Boolean OR-merge lattice signal. Once set to `true`, stays `true`:

```typescript
import { boolLatticeSignal } from '@aihu/signals'

const ready = boolLatticeSignal(false)
ready(true)  // true
ready(false) // still true — OR merge
```

### `maxLatticeSignal(initial?)`

Numeric max-merge lattice signal. Monotonically increases:

```typescript
import { maxLatticeSignal } from '@aihu/signals'

const highScore = maxLatticeSignal(0)
highScore(42)
highScore(10)  // stays 42 — max merge
```

## `$state` accessor

`$state` is a shorthand accessor for the component state bag in SFCs. Inside `@state` blocks, all declared props and computeds are available on `$state` without qualification.

## Reactive patterns

### Computed chains

Computeds can depend on other computeds:

```typescript
const base = signal(10)
const doubled = computed(() => base() * 2)
const quadrupled = computed(() => doubled() * 2)
```

Only `base` is a writable signal; the derived chain updates automatically. Each computed is memoized — intermediate computeds don't re-run unless their own dependencies change.

### Effects with cleanup

Return a cleanup function from `effect` to dispose resources before the next run:

```typescript
const url = signal('/api/data')

effect(() => {
  const controller = new AbortController()
  fetch(url(), { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
  return () => controller.abort()
})
```

The cleanup runs when `url` changes (before the next fetch starts) and when the effect is disposed.

### The `batch` pattern for atomic updates

When multiple signals feed a single derived value, use `batch` to prevent intermediate states:

```typescript
const hue = signal(215)
const saturation = signal(70)
const lightness = signal(55)

const color = computed(() =>
  `hsl(${hue()} ${saturation()}% ${lightness()}%)`
)

// Without batch: color re-computes 3 times
// With batch: color re-computes once
batch(() => {
  hue(0)
  saturation(100)
  lightness(50)
})
```

## Push-based semantics

aihu signals are push-based: effects run synchronously after each signal write (or after a `batch` completes). There is no scheduler, no microtask queue, and no async rendering pipeline. This makes behavior predictable and side effects easy to reason about.
