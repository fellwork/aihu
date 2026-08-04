/**
 * Reactivity guide body. Adapted from the real
 * apps/docs/src/content/docs/guides/reactivity.md. The low-level
 * @aihu/signals API (signal/computed/effect/batch/untrack) is unchanged
 * by the dialect migration — only the "$state accessor" section described
 * a retired SFC-level shorthand (the collection-form $prop:/$computed:
 * macro bag) that no longer exists; it is rewritten below to describe the
 * current @state model (plain state()/prop()/derived() bindings,
 * no accessor bag). Fenced code uses the ~~~ delimiter and inline code
 * uses <code> tags so the source carries no raw backticks in the body
 * (the one JS-template-literal sample below escapes its backticks/${ as
 * \` and \${ since the whole export is itself a template literal).
 */
export const REACTIVITY = `# Reactivity

<code>@aihu/signals</code> provides the reactive foundation for the entire aihu framework. It uses a push-based, synchronous execution model: when a signal is written, all dependent effects run immediately.

## <code>signal&lt;T&gt;(initialValue)</code>

Creates a writable reactive cell:

~~~typescript
import { signal } from '@aihu/signals'

const count = signal(0)

count()       // read: returns 0
count(1)      // write: sets to 1, flushes effects
~~~

Signals are the atomic unit of state. They are not wrapped in objects or proxies — call them as functions to read or write.

## <code>computed&lt;T&gt;(fn)</code>

Derives a read-only signal from other signals:

~~~typescript
import { signal, computed } from '@aihu/signals'

const count = signal(0)
const doubled = computed(() => count() * 2)

doubled() // 0
count(5)
doubled() // 10
~~~

Computed signals are lazily evaluated and memoized. They re-evaluate only when a tracked dependency changes.

## <code>effect(fn)</code>

Runs a side effect whenever tracked signals change. Returns a dispose function:

~~~typescript
import { signal, effect } from '@aihu/signals'

const name = signal('world')
const dispose = effect(() => {
  console.log('Hello,', name())
})
// Logs: "Hello, world"

name('aihu')
// Logs: "Hello, aihu"

dispose() // stops the effect
~~~

Effects run synchronously after each signal write. They auto-track all signals read during their execution.

To clean up resources when an effect re-runs, return a cleanup function:

~~~typescript
const dispose = effect(() => {
  const id = setInterval(() => tick(), 1000)
  return () => clearInterval(id)  // called before next run or on dispose
})
~~~

## <code>batch(fn)</code>

Defers effect flushes until the batch function returns:

~~~typescript
import { signal, effect, batch } from '@aihu/signals'

const a = signal(0)
const b = signal(0)

effect(() => console.log(a(), b()))

batch(() => {
  a(1)  // no flush yet
  b(2)  // no flush yet
})
// Now effects flush once with a=1, b=2
~~~

<code>batch</code> is useful when updating multiple signals that drive the same derived computation — it prevents intermediate renders. This is the preferred pattern for atomic multi-signal updates.

## <code>untrack(fn)</code>

Reads signals inside <code>fn</code> without subscribing to them. Re-entrancy safe:

~~~typescript
import { signal, effect, untrack } from '@aihu/signals'

const count = signal(0)
const multiplier = signal(2)

effect(() => {
  // Only subscribes to count, not multiplier
  const m = untrack(() => multiplier())
  console.log(count() * m)
})
~~~

<code>untrack</code> is re-entrancy safe — calling it from inside an <code>effect</code> or another <code>untrack</code> works correctly.

## Reactivity inside <code>@state</code>

<code>@state</code> blocks don't reach for the raw <code>@aihu/signals</code> primitives directly — they use the wrapper intrinsics built on top of them: <code>state()</code> for private working values, <code>prop()</code> for the component's public host-settable surface, <code>derived()</code> for memoized computed values, and <code>action()</code> for named, agent-invocable operations. Every declared name is just a plain local binding in scope for the rest of the block and the template — there is no separate accessor bag to qualify through; you read and write <code>count</code>, not <code>state.count</code>.

## Reactive patterns

### Computed chains

Computeds can depend on other computeds:

~~~typescript
const base = signal(10)
const doubled = computed(() => base() * 2)
const quadrupled = computed(() => doubled() * 2)
~~~

Only <code>base</code> is a writable signal; the derived chain updates automatically. Each computed is memoized — intermediate computeds don't re-run unless their own dependencies change.

### Effects with cleanup

Return a cleanup function from <code>effect</code> to dispose resources before the next run:

~~~typescript
const url = signal('/api/data')

effect(() => {
  const controller = new AbortController()
  fetch(url(), { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
  return () => controller.abort()
})
~~~

The cleanup runs when <code>url</code> changes (before the next fetch starts) and when the effect is disposed.

### The <code>batch</code> pattern for atomic updates

When multiple signals feed a single derived value, use <code>batch</code> to prevent intermediate states:

~~~typescript
const hue = signal(215)
const saturation = signal(70)
const lightness = signal(55)

const color = computed(() =>
  \`hsl(\${hue()} \${saturation()}% \${lightness()}%)\`
)

// Without batch: color re-computes 3 times
// With batch: color re-computes once
batch(() => {
  hue(0)
  saturation(100)
  lightness(50)
})
~~~

## Push-based semantics

aihu signals are push-based: effects run synchronously after each signal write (or after a <code>batch</code> completes). There is no scheduler, no microtask queue, and no async rendering pipeline. This makes behavior predictable and side effects easy to reason about.
`
