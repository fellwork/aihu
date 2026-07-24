# Deep / structural reactivity for aihu — design

**Date:** 2026-07-24
**Status:** PROPOSED — awaiting founder approval, not ratified
**Scope:** A new `@aihu/reactive` package (fine-grained Proxy-backed reactive trees) built
on `@aihu/signals`' public API, plus the `@aihu/store` setup-store detection gap that
follows from it. Written against the actual core at
`/Users/smcguirt/conductor/workspaces/aihu/gwangju/packages/signals/src/` (signal.ts,
computed.ts, effect.ts, scope.ts, batch.ts, untrack.ts) and the surrounding packages
(`arbor`, `store`, `use`, `compiler`) as of 2026-07-24.
**Depends on / extends:**
[`2026-07-24-use-categorical-parity.md`](./2026-07-24-use-categorical-parity.md) (the
`@aihu/use`/`@aihu/store` package boundaries this design places itself against) and
[`2026-07-24-lifecycle-ownership-dx.md`](./2026-07-24-lifecycle-ownership-dx.md) (sibling
proposal — no shared code, but both are new-surface-area design docs against the same
signals/runtime core and both resolve open blockers from the same backlog).

## Open decisions for the founder

Approving this document commits to:

1. **Creating a new package, `@aihu/reactive`** (zero bytes added to `@aihu/signals` —
   the guarded core row does not move). See §3 for why it is its own package rather than a
   `@aihu/signals` subpath or a `@aihu/store` addition.
2. **A follow-on gap in `@aihu/store`**: `isReactive()` must be added to
   `collectSetupShape`/`SetupStateKeys` before a reactive object returned from a setup
   store is detected as state and serialized — today it is silently dropped (§7.2 item 3).
   This is not optional cleanup; it is required before deep state is usable in a setup
   store at all.

This design resolves the open blocker tracked as **FEL-391** (deep reactivity).

**Verdict on the ruling:** BUILD IT is correct. But the shape matters more than the
verdict, and one premise in the brief is factually wrong (Solid's `createStore` *is*
Proxy-based — §2.2). The recommendation below is a Solid-shaped node model with Vue-shaped
write ergonomics, shipped **outside** `@aihu/signals` so the core row does not move by one
byte.

---

## 0. Executive summary

| Decision | Answer |
| --- | --- |
| Mechanism | Proxy-backed tree, **lazily allocated per-(object,key) tracking nodes** (Solid's node model), **plain-assignment writes** (Vue's ergonomics), `mutate()` for explicit batching |
| Home | **New package `@aihu/reactive`**, `@aihu/signals` as a dependency marked `external`. Not core. Not `@aihu/store`. |
| Cost to `@aihu/signals` | **0 bytes.** Core `dist/index.js` unchanged; the 2350 B row is untouched (current actual: 2273 B). |
| Cost of the new layer | ~1.7 kB gz for `@aihu/reactive` (own row, proposed limit **1900 B** — see §5 on the `reconcile` re-estimate); helper entries 150–400 B each |
| Interop | Same graph. `effect()`/`computed()` auto-track deep reads through the existing `linkAdd`. `effectScope` unaffected (reactive trees own no effects). |
| Breaking changes | **None.** `signal()`, `useLocalStorage`, every shipped composable keep the replace contract verbatim. Purely additive. |

---

## 1. What the core actually is (read, not assumed)

Facts that constrain everything downstream:

1. **The graph is a doubly-linked (dep, sub) edge list**, not a Set-of-observers.
   `linkAdd(dep, sub)` in `signal.ts:169` appends a pooled `Link` into both
   `dep.subsHead..subsTail` and `sub.depsHead..depsTail`. A "dep" is any object with the
   `Subscriber` shape — `signal()` constructs one as a **bare object literal**
   (`signal.ts:508`, `flags: MERGE | HOST`), not a class. **Anything that can produce a
   `Subscriber`-shaped host participates in the graph.** That is the hook a deep layer
   needs, and it is already reachable through the public `signal()` factory.

2. **Tracking is read-time and observer-global.** `read()` is
   `if (currentObserver !== null) linkAdd(host, obs); return value`. There is no
   per-signal registration API — so a Proxy `get` trap that calls a node's `read()` gets
   automatic `effect`/`computed` tracking *for free*, with no changes to mark/settle/drain.

3. **Writes flush synchronously at the write site** unless `batchDepth > 0`
   (`signal.ts:532–551`: enqueue when batching, otherwise `wave++; propagateMark(head);
   drainEffectQueue()`). **There is no microtask auto-batching.** This is the single most
   important constraint on the design: Vue survives free deep mutation because it defers
   to a microtask; aihu would run a full effect drain per mutated property.

4. **`Object.is` is the default `equals`** on both `signal` (`signal.ts:517`) and
   `computed` (`computed.ts:159`), and the equality short-circuit is load-bearing
   (`shallowClear` + the `CONFIRMED` bit). Any deep design must define what identity means
   for a deep node or it will silently defeat this machinery.

5. **`effectScope` owns disposal only** (`scope.ts`), storing dispose *handles*. Reactive
   objects create no effects, so they need no scope integration — but anything built on top
   that *does* create an effect (`reactiveComputed`) must register with the current scope.

6. **The renderer binds through effects.** `materialize.ts:101–116`: a text leaf whose
   value is a `[getter]` tuple is wired with `mountEffect(() => textNode.nodeValue =
   String(get()))`. Any reactive read inside that getter is tracked. **The renderer needs
   zero changes to benefit from deep reactivity.**

7. **`@aihu/use` is the precedent for the packaging answer**: multi-entry rolldown,
   `external: ['@aihu/signals']`, one `.size-limit.json` row per subpath
   (`packages/use/rolldown.config.ts`). Size rows are measured by re-bundling the entry
   with rolldown and gzipping (`scripts/sync-readme.ts:210–230`) — imports are followed, so
   nothing hides in a shared chunk.

### 1.1 The live bug that makes this more than ergonomics

`packages/arbor/src/structural.ts:_reconcileEach` (lines 126–186):

```js
for (let i = 0; i < items.length; i++) {
  const k = kfn(items[i])
  if (sc.has(k)) continue        // ← key already mounted: row is NOT re-grown
  ...
  appendedNodes: _mc(lgrow(items[i]!, i), ...)
}
```

and the compiler emits the row body as `each(items, key, (item, i) => { … })`
(`packages/compiler/src/codegen/template_emit.rs:653`) — **`item` is captured by value at
grow time.**

Consequence under the current "replace, don't mutate" contract: replacing a list with new
item objects that carry the **same keys** does not re-grow the rows, and the row bodies
still close over the *old* item objects. **The DOM shows stale field values.** The only
working idioms today are (a) make the key include the mutable field, which destroys row
identity/focus/animation, or (b) make every per-row field its own signal by hand.

I found **no test covering this** in `packages/arbor/tests/structural.test.ts`. This is a
correctness gap, not a nicety — and fine-grained per-property reactivity fixes it with no
renderer change, because the row body's thunks would read through a tracked proxy.

**Action item regardless of which design lands:** add a regression test for "same key,
changed field".

---

## 2. Mechanism — evaluated, then chosen

### 2.1 Vue `reactive()` — rejected as the model, adopted for ergonomics

Full Proxy on every reachable object, free mutation, a global
`WeakMap<target, Map<key, Dep>>`, plus collection handlers for Map/Set/WeakMap and
`ref` auto-unwrapping.

- **Size:** `baseHandlers` + `collectionHandlers` + dep bookkeeping is ~5–6 kB gz. 3–4×
  the entire aihu signals core.
- **Fatal against this core:** free mutation assumes deferred flush. In aihu,
  `user.first = 'a'; user.last = 'b'` is **two full synchronous effect drains** — two
  renders. Vue never pays that because it schedules.
- **Ref auto-unwrap** is a documented footgun and would collide with signal tuples.
- **Adopted anyway:** the *authoring* ergonomics. `user.name = 'x'` must work, because the
  ratified state-model spec (`docs/plans/state-model/40-spec.md` §1 point 5) says
  "**Writes stay plain assignment** … No setters, no `.set`, no `setX(v)` in authored
  code." A design requiring `setStore('user','name','x')` in `.aihu` files contradicts a
  ratified spec.

### 2.2 Solid `createStore` — adopted as the node model (correcting the brief)

The brief says Solid's store is "the closest prior art to a signals-tuple system with NO
Proxy-on-everything." **That is not accurate.** `createStore` returns a Proxy
(`solid-js/store/src/store.ts`); reads go through a `get` trap; nested plain objects are
wrapped on read and memoized via a `$PROXY`/`$RAW` symbol pair. What Solid *doesn't* do:

- it does **not** pre-create a signal per property — nodes are allocated **lazily, on the
  first tracked read** (`getDataNodes`/`getDataNode`), so an untouched 10 000-key tree costs
  zero nodes;
- it only wraps **plain objects and arrays** (`isWrappable`) — `Date`, `Map`, `Set`, class
  instances, DOM nodes pass through raw;
- it **unwraps on write**, so the underlying raw tree never contains proxies.

All three are adopted verbatim. What is **rejected** is Solid's *write* surface —
`setStore('todos', t => t.id === 1, 'done', true)` path tuples and the separate `produce`
import. It is hard to type, hard to read, and contradicts the ratified plain-assignment
rule above.

### 2.3 Immutable + structural sharing — rejected

One root signal, `produce`-style copy-on-write, reads via hand-written selector computeds.

- Attractively cheap in the core (`signal(root, { equals: false })` + a ~600 B produce, or
  +4 kB for Immer).
- **Rejected because** it *is* essentially the status quo the founder rejected: read
  granularity requires the author to declare a `computed` per field (selector explosion),
  object-slice equality is identity so a naive produce invalidates every selector on any
  write, and it does **not** unblock `useForm`/`useObject`, which need to aggregate over
  *arbitrary user-supplied keys* not known at authoring time.
- **Partially adopted:** `mutate(obj, draft => …)` is a produce-shaped façade — but it
  writes through, it does not copy.

### 2.3a `signal(obj, { equals: customFn })` — rejected as an alternative, not competing ground

This design does not invent the idea of comparing more than reference identity — `signal()`
already accepts a custom `equals` comparator or `equals: false` (`signal.ts:486–494`), and
`computed()` exposes the same shape via `ComputedOptions.equals` (`computed.ts:40`). Worth
naming explicitly so the proposal isn't mistaken for claiming new core ground: `signal(obj,
{ equals: deepEqual })` already gives whole-object deep-equality writes *today*, with zero
new bytes and zero new package. It is rejected as an alternative to the tree model — not
because it doesn't work, but because it solves a different problem:

- It has **no per-key read granularity** — any deep-equal write recomputes every downstream
  reader of `obj`, because there is exactly one node (the signal itself) for the whole
  object. `effect(() => user.name)` and `effect(() => user.address)` are indistinguishable
  subscribers.
- It has **no `for…in`/`Object.keys`/dynamic-key reactivity** — a `deepEqual` comparator
  changes *whether* a write notifies, not *what granularity* a read subscribes at.
- Its **cost is O(tree) per write** (a deep-equal walk on the old and new whole value), which
  gets worse as the tree grows, exactly inverted from the node model's O(touched keys).

This is why the chosen mechanism needs *per-key* nodes rather than one whole-object signal
with a fancier comparator — the two are complementary primitives, not competitors, and nothing
here proposes changing what `equals` means on the existing APIs. To close the loop the earlier
draft left open: the per-key **version-token nodes are `signal(0, { equals: false })`**
(stated in §2.6) — i.e. every bump is unconditionally treated as a change, consistent with a
node's job being pure subscription plumbery, not a value carrying its own meaning. The
node's `equals: false` is unrelated to, and does not bypass, the *tree's* own `set`-trap
equality check (§2.6) — the trap decides *whether* to bump the token at all; once it decides
to bump, the token itself never short-circuits.

### 2.4 Explicit path/lens signals — rejected as primary, adopted as the bridge

`lens(root, 'a', 'b')` returning a `Signal<T>`. ~200 B, no Proxy, fully typed with variadic
tuples. Rejected as the mechanism: no `for…in`/`Object.keys` reactivity, no dynamic keys, and
every field costs an authored declaration. **Adopted as `toSignal(obj, key)`** — the
tuple↔tree bridge (§4.3), which is exactly what `useForm` field accessors need.

### 2.5 Compiler-lowered property access — rejected

aihu has a Rust compiler and already ships a write-rewrite pass design
(`state-model/40-spec.md` §4.3, generalizing `expr/prop_write.rs`), so `user.name` could be
lowered to node calls. Rejected as the *mechanism*:

- it cannot cover library code — `@aihu/use`, `@aihu/store`, plain `.ts` composables never
  pass through the compiler, and those are exactly the consumers that are blocked today;
- it cannot see through function boundaries, dynamic keys, or values escaping into helpers;
- it would make `.aihu` semantics diverge from TypeScript semantics, which the state-model
  spec explicitly set out to *end* ("every declaration is valid TypeScript").

Worth revisiting later as a *peephole optimization* for statically-known paths, on evidence.

### 2.6 Chosen mechanism

> **A Proxy-backed reactive tree with lazily-allocated per-(object, key) tracking nodes
> built on the public `@aihu/signals` API, plain-assignment writes through the `set` trap,
> and `mutate()` as the batching façade.**

Concretely:

- `wrap: WeakMap<raw, proxy>` and `raws: WeakMap<proxy, raw>` — stable bidirectional
  identity, cycle-safe by construction.
- `nodes: WeakMap<raw, Map<key, Signal<void>>>` — one tracking cell per touched key,
  created **on every `get` trap invocation for that key, tracked or not** (see §2.7 for why
  this is the correct and only implementable gate). Each node is `signal(0, { equals: false
  })` used as a pure version token: the *value* lives in the raw object, the node only
  carries subscription edges. (Value-in-raw, not value-in-node, keeps `unwrap()` O(1) and
  keeps non-reactive consumers of the raw correct.)
- Per-object **`KEYS` node** notified on add/delete, tracked by `ownKeys`/`has` — makes
  `Object.keys`, `for…in`, spread, and `JSON.stringify` reactive to shape changes.
- Arrays: a `length` node plus index nodes. Mutating methods run inside `batch()` so
  `arr.push(x)` is one flush, not two.
- `isWrappable(v)` = plain object (prototype is `Object.prototype` or `null`) or `Array`,
  **and not frozen** (frozen/non-configurable trips Proxy invariants). Everything else —
  `Date`, `Map`, `Set`, `RegExp`, class instances, DOM nodes, functions, signal tuples'
  member functions — passes through raw.
- **Unwrap on write:** `set` stores `unwrap(value)`, so the raw tree never contains
  proxies, and `unwrap()` is a single WeakMap lookup with no traversal.
- **`set` trap equality — coherent with core write semantics, not a new rule.** Before
  bumping a key's version token, `set` does `Object.is(unwrap(incoming), currentRawSlot)`
  and returns early (no allocation beyond the node lookup, no notify) when equal — the same
  short-circuit `signal.ts:526–528` already applies to every tuple write (`if (equals !==
  false && equals(value, resolved)) return`), and the same `Object.is` NaN-safety. This is
  not new machinery, just the existing rule restated for the trap: `obj.x = obj.x` must
  **not** trigger a synchronous effect drain, exactly as `set(get())` does not for a signal
  tuple today.
- **`set`/`deleteProperty` batch whenever more than one node is touched.** A plain value
  write on an *existing* key touches one node (no batch needed — matches tuple-write
  semantics: one write, one flush). But a property **add** or **delete** touches two nodes
  (the key's own node **and** the `KEYS` node), and an array index write past the current
  length touches two (the index node **and** `length`) — both cases wrap the pair in
  `batch()` internally so the trap never produces two back-to-back synchronous drains for
  what is authored as one assignment. This is the same reasoning §2.6 already applies to
  array mutating methods (`arr.push` batches index + `length`); it is generalized here to
  every add/delete path, object or array, not only the array-method fast path.

### 2.7 Node allocation, precisely — resolving the tracked-read contradiction

An earlier draft of this design said nodes are allocated "only on a tracked read
(`currentObserver !== null`)". **That statement does not survive contact with the public
API and is corrected here.** `currentObserver` is `@internal` in `signal.ts:107` and is
**not** re-exported from `packages/signals/src/index.ts` (the public surface is `batch`,
`computed`, `effect`, `effectScope`/`getCurrentScope`/`onScopeDispose`/`runWithoutScope`/
`runWithScope`, `signal`, `untrack`, plus types). There is no public way for a `get` trap
running outside `@aihu/signals` to ask "is this read tracked?" — `getCurrentScope()` answers
a different question (effect *scope*, not the tracking observer) and per the effect-run
contract is cleared during every effect body anyway. So "gate allocation on
`currentObserver !== null`" and "depend on `@aihu/signals` via its public API only" cannot
both hold. Given the choice, this design keeps the public-API constraint and changes the
gate:

> **A tracking node for `(object, key)` is allocated on the *first `get` trap invocation*
> for that key — tracked or untracked. There is no cheaper public signal than "a property
> was read through the proxy at all."**

What this means concretely:

- **Tracked read** (`effect`/`computed` body currently running): the trap calls the node's
  `read()`. That call is the ordinary public `signal()` reader — `if (currentObserver !==
  null) linkAdd(host, obs)` — which is exactly the auto-tracking hook §1 point 2 describes.
  No difference from the original design.
- **Untracked read** (plain `user.name` outside any effect, or inside `untrack()`): the trap
  still calls the node's `read()` to return the value. The node is allocated (if not
  already) as a side effect of the *first* such read, but `read()`'s own `if (currentObserver
  !== null)` guard means the call **no-ops the link** — no edge is added, nothing to
  propagate later. The byte and object-allocation cost (one `Signal<void>` tuple + one
  `Map` entry) is paid; the graph-edge cost is not. This is a widening of when a node is
  *created*, not a change to when it *notifies* — allocation and linkage are already
  decoupled in the underlying `signal()` primitive itself, so this reuses an existing
  no-op path rather than inventing one.
- **Write to a key that has no node yet** (nothing ever read that key through the proxy):
  `set` still needs to notify the `KEYS` node (shape may matter to `for…in`/`ownKeys`
  watchers) but there is no per-key node to bump — because nothing has ever subscribed to
  that key, there is nothing to notify, so the per-key notify step for an unread key is
  correctly a no-op by construction, not a design gap. The node is allocated lazily on
  whichever comes first: a read, or (for symmetry, so a later read of an already-written key
  doesn't need special-casing) a write also allocates-if-absent so the version token exists
  to be bumped for any future reader. Either way, the **first proxy touch of a given key**
  (read or write) is what allocates its node — never construction of the tree, never a
  read of a *different* key, and never an untouched key.
- **Practical effect on the size budget:** this is *wider* than "tracked-read only", so the
  worst case (a hot path that reads a deep tree entirely outside effects, e.g. server-side
  string rendering that walks every field) allocates a full node set even though no graph
  edges are created. §9 already documents `unwrap()` as the hot-path escape hatch for
  exactly this shape of cost; that guidance now carries the allocation cost too, not just
  the trap-dispatch cost. This does **not** change the `@aihu/reactive` package's own byte
  estimate (§5) — node allocation is runtime *memory*, not build-time *bytes* — but it does
  correct the SSR claim in §9 ("nodes are allocated only when `currentObserver !== null`"),
  which is updated to match this section.
- **Why not spend a few bytes on a public `isTracking()` export instead?** Considered and
  rejected for wave 1: it would cost ~30–40 B gz against the measured **77 B** headroom
  (§3), turning "byte-identical core, hard acceptance criterion" into "core row grows by
  ~40 B, still under the 2350 B limit" — a real, avoidable weakening of the one guarantee
  this whole arc promises every existing consumer. Revisit only if the read-outside-effects
  allocation cost proves material on evidence (§11 item 8 already flags a lower-level
  optimization pass as a deferred follow-on; an `isTracking()` export would ride the same
  future PR, re-measured then).

---

## 3. Scope / home — a new package, `@aihu/reactive`

**Not `@aihu/signals` core.** 77 B of real headroom (measured: `gzip -9` of
`packages/signals/dist/index.js` = **2273 B** against the 2350 B row). A ~1.7 kB layer
is a ~75% core-size increase paid by every consumer, including ones that never touch it.
Non-starter.

**Not a `@aihu/signals/store` subpath**, despite the attraction of sharing internals. Two
concrete blockers found in the build:

1. Multi-entry rolldown hoists shared modules into a chunk that `dist/index.js` then
   imports. `scripts/sync-readme.ts` re-bundles the entry, so the shared chunk *is* counted
   — meaning the core row absorbs chunk-boundary boilerplate against 77 B of headroom.
2. `packages/signals/scripts/mangle-dist.mjs` post-processes **`dist/index.js` only**. A
   chunked build would leave the shared graph fields unmangled in the chunk, silently
   regressing the core row.
   And the alternative — a *separate* rolldown pass that inlines `signal.ts` into the store
   entry — is a **correctness catastrophe**: two copies of `currentObserver`, `batchQueue`,
   `wave`, and the link pool. A store in copy B would be invisible to `effect()` from copy A.

**Not `@aihu/store`.** I read it: `defineStore`, a per-scope registry, SSR
serialize/hydrate, plugins, persist (`packages/store/src/{store,registry,ssr,persist}.ts`).
That is *Pinia*: application-scoped named stores. Deep reactivity is a **value primitive**.
Putting it there would force `@aihu/use`'s `useForm` to depend on a registry + SSR +
plugin system to get a reactive object. Wrong direction — `@aihu/store` should be a
**consumer** (§7.2), not the host.

**Therefore:** a new package that mirrors the `@aihu/use` / `@aihu/store` pattern exactly.

```jsonc
// packages/reactive/package.json (sketch)
{
  "name": "@aihu/reactive",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".":         { "types": "./dist/index.d.ts",    "import": "./dist/index.js" },
    "./helpers": { "types": "./dist/helpers.d.ts",  "import": "./dist/helpers.js" }
  },
  "dependencies": { "@aihu/signals": "workspace:*" }
}
```

```ts
// packages/reactive/rolldown.config.ts (sketch)
export default defineConfig({
  input: { index: 'src/index.ts', helpers: 'src/helpers/index.ts' },
  output: { dir: 'dist', format: 'esm', entryFileNames: '[name].js', sourcemap: true },
  external: ['@aihu/signals'],   // ← the whole point: core measured once, shared at runtime
  plugins: [dts()],
})
```

```jsonc
// .size-limit.json additions
{ "name": "@aihu/reactive",         "path": "packages/reactive/dist/index.js",
  "limit": "1900 B", "gzip": true, "ignore": ["@aihu/signals"] },
{ "name": "@aihu/reactive/helpers", "path": "packages/reactive/dist/helpers.js",
  "limit": "700 B",  "gzip": true, "ignore": ["@aihu/signals", "@aihu/reactive"] }
```

Landing checklist the repo will demand (from `tests/check-size-rows.test.ts` and the
release ritual): add `@aihu/reactive` to `scripts/check-size-rows.ts` `classify()` as
**browser-eligible**; add both size rows; add the package to `publish-all.sh`'s `PKGS`
list (**it silently skips unlisted packages**); `sync-readme --check` is the real CI gate.

---

## 4. API surface

### 4.1 Core entry — `@aihu/reactive`

```ts
/** Wrap a plain object/array in a fine-grained reactive tree. Idempotent and
 *  identity-stable: reactive(o) === reactive(o), reactive(reactive(o)) === reactive(o).
 *  Non-wrappable values (Date, Map, Set, class instances, frozen objects, primitives)
 *  are returned as-is. */
export function reactive<T extends object>(source: T): T

/** True for a proxy produced by reactive(). */
export function isReactive(value: unknown): boolean

/** The raw object behind a reactive proxy (O(1), no traversal — writes unwrap,
 *  so the raw tree never contains proxies). Non-proxies pass through. */
export function unwrap<T>(value: T): T

/** Apply many writes as ONE flush. Equivalent to batch(() => recipe(target)) —
 *  the "draft" IS the reactive proxy, writes apply immediately (see §8.6). */
export function mutate<T extends object>(target: T, recipe: (draft: T) => void): void

/** Merge `next` into `target` in place, preserving node identity for unchanged
 *  values and notifying ONLY changed paths. The hydration / refetch primitive.
 *  `key` controls array item matching (default: index). */
export function reconcile<T extends object>(
  target: T,
  next: T,
  options?: { key?: keyof any | ((item: unknown) => unknown) },
): void
```

### 4.2 Helpers entry — `@aihu/reactive/helpers`

```ts
/** Lens a single property as a signal tuple — the tree → tuple bridge. */
export function toSignal<T extends object, K extends keyof T>(t: T, k: K): Signal<T[K]>

/** Every own key as a signal tuple. Destructure-safe (each tuple is a live lens). */
export function toSignals<T extends object>(t: T): { [K in keyof T]: Signal<T[K]> }

/** Signal-of-object → reactive-looking view. Whole-value read granularity;
 *  writes go through the tuple's setter with a shallow copy. The tuple → tree bridge. */
export function toReactive<T extends object>(source: Signal<T>): T

/** Read-through views — no copies, tracking is preserved. */
export function reactivePick<T extends object, K extends keyof T>(s: T, ...keys: K[]): Pick<T, K>
export function reactiveOmit<T extends object, K extends keyof T>(s: T, ...keys: K[]): Omit<T, K>

/** A reactive object kept in sync with `fn()` by an effect + reconcile.
 *  Scope-owned: disposed by the enclosing effectScope. Per-key granularity —
 *  consumers that read one key only re-run when THAT key changes. */
export function reactiveComputed<T extends object>(fn: () => T): T
```

### 4.3 Representative usage

```ts
import { reactive, mutate, unwrap } from '@aihu/reactive'
import { computed, effect } from '@aihu/signals'

const user = reactive({ name: 'Ada', address: { city: 'London' }, tags: ['math'] })

effect(() => console.log(user.address.city))   // tracks node(user,'address') + node(addr,'city')

user.address.city = 'Cambridge'  // one flush → logs
mutate(user, u => {              // ONE flush for three writes
  u.name = 'Ada L.'
  u.address.city = 'Bletchley'
  u.tags.push('crypto')
})

const initials = computed(() => user.name.split(' ').map(s => s[0]).join(''))
// initials does NOT recompute when address.city changes — that is the point.

localStorage.setItem('user', JSON.stringify(unwrap(user)))
```

The `each` fix, with no renderer change:

```html
{#each todos as todo (todo.id)}
  <li class:done={todo.done}>{todo.title}</li>
{/each}
```
```ts
const todos = reactive([{ id: 1, title: 'ship', done: false }])
todos[0].done = true   // ONLY the class binding on row 1 re-runs.
                       // No array replacement, no reconcile, no stale-capture bug (§1.1).
```

`useForm`, the currently-blocked case:

```ts
export function useForm<T extends Record<string, unknown>>(
  initial: T,
  validate: (values: T) => Partial<Record<keyof T, string>>,
) {
  const values  = reactive({ ...initial })
  const touched = reactive({} as Record<keyof T, boolean>)
  const errors  = reactiveComputed(() => validate(values))   // per-KEY granularity via reconcile
  const isValid = computed(() => Object.keys(errors).length === 0)
  const isDirty = computed(() =>
    Object.keys(initial).some(k => !Object.is(values[k], initial[k as keyof T])))

  const field = <K extends keyof T>(k: K) => ({
    value:    () => values[k],                                  // tracks node(values, k) ONLY
    setValue: (v: T[K]) => { values[k] = v; touched[k] = true }, // 2 writes, 2 flushes → wrap in mutate() if hot
    error:    () => errors[k as string],                        // tracks node(errors, k) ONLY
    touched:  () => touched[k] === true,
  })

  return { values, errors, isValid, isDirty, field, reset: () => reconcile(values, initial) }
}
```

Typing in field `email` re-runs: the `email` input binding, the `validate` aggregate, and
— because `reactiveComputed` reconciles — only the error bindings whose message actually
changed. Under the current contract this requires either N hand-declared signals or a
whole-form re-render.

---

## 5. Size budget — quantified

| Piece | est. gz |
| --- | --- |
| `wrap`/`unwrap`/`isReactive` + 2 WeakMaps + `isWrappable` | ~180 B |
| `get`/`set`/`has`/`deleteProperty`/`ownKeys` traps (incl. `Object.is` equality check + add/delete batching, §2.6) | ~500 B |
| lazy node map + `KEYS` node + notify | ~220 B |
| array `length`/index handling + batched mutators | ~200 B |
| `mutate` (`batch` re-export shape) | ~40 B |
| `reconcile` (object + keyed-array merge) | ~550 B |
| **`@aihu/reactive` total** | **~1.7 kB**, row at **1900 B** |
| `toSignal`/`toSignals`/`toReactive` | ~180 B |
| `reactivePick`/`reactiveOmit` | ~150 B |
| `reactiveComputed` | ~160 B |
| **`@aihu/reactive/helpers` total** | **~490 B**, row at **700 B** |

**On the `reconcile` line specifically:** the original estimate of ~330 B was optimistic.
`reconcile` is the least-compressible piece in the package — branchy keyed-array-diff logic
with few repeated patterns — and Solid's own keyed `reconcile` (the closest working
prior art) is meaningfully larger than 330 B post-mangle. The row above (**1900 B**, up from
the original 1600 B) reflects that honestly rather than papering over it with a tight limit
the actual implementation would immediately blow through. **Before wave 1 lands:**
prototype-measure `reconcile` for real. If it lands materially over this estimate (say,
past ~700 B on its own), the mitigation is to split it into its own subpath —
`@aihu/reactive/reconcile` — following the exact per-row pattern `@aihu/use` already
establishes (§1 point 7), rather than inflating the core row further; §11 question 5 (is
`reconcile` in wave 1 at all) is the more fundamental version of this same open question and
should be settled first, since deferring `reconcile` entirely removes this line from the
core estimate altogether.

**Tree-shaking:** the layer is a separate package with `sideEffects: false` and
`external: ['@aihu/signals']`. A consumer who never imports it pays **exactly zero** —
not "tree-shaken to near-zero", *zero*, because the bytes are not in the module graph at
all. Within the package, `reconcile` and the helpers are individually shakeable (pure
function exports, no cross-references from the traps).

**Acceptance criterion (hard):** `@aihu/signals/dist/index.js` gzip is **byte-identical**
before and after this arc. Any PR in this arc that moves the `@aihu/signals` row is wrong
by construction.

---

## 6. Interop with the existing primitives

**Does `effect()` auto-track deep property reads?** **Yes**, with no changes to
`effect.ts`. The `get` trap calls the node's read function, which is the ordinary
`signal` read — `if (currentObserver !== null) linkAdd(host, obs)`. Same `Link` pool,
same `markOne`, same `drainEffectQueue`, same `MERGE`/`CONFIRMED`/`PENDING` machinery, same
dynamic dep pruning via `beginTrack`/`pruneDeps` (a conditional branch that stops reading
`user.address` correctly drops that edge on the next run).

**Granularity.** `effect(() => user.address.city)` links **two** nodes:
`node(userRaw, 'address')` and `node(addressRaw, 'city')`. Replacing `user.address`
wholesale *or* mutating `.city` both invalidate — which is the correct and expected
semantics.

**`computed()`.** Works unchanged. `computed(() => user.address)` returns the memoized
child proxy; because that proxy identity is stable, the default `Object.is` equality
suppresses the downstream cascade unless the property is *reassigned*. Deep reactivity
therefore strengthens, rather than defeats, the existing equality short-circuit.

**`untrack()` / `batch()`.** Unchanged. `mutate()` is `batch()` plus a name.
`untrack(() => user.x)` reads without linking, as expected.

**`effectScope()`.** A reactive tree owns no effects and needs no disposal — nodes live in
a `WeakMap` keyed by the raw object and are collected with it; subscriber edges are spliced
out from the dep side by the existing `effect` dispose loop (`effect.ts:247–255`). Only
`reactiveComputed` creates an effect, and it registers with the current scope like any
other effect (so a component's `connectedCallback` scope tears it down on disconnect).

**Signal tuples inside a reactive tree.** No auto-unwrapping (Vue's `ref` unwrap is a
footgun and the state-model spec explicitly prizes not having a props/state object that can
lose reactivity on destructure). A tuple stored in a reactive object is an `Array`, so the
array itself gets proxied — but element reads return the raw functions (functions are not
wrappable), so `const [get, set] = obj.sig` still destructures to the real pair and
`get()` tracks normally. Degrades gracefully; documented, not special-cased.

**`@aihu/store` (Pinia-style).** Additive integration, §7.2.

---

## 7. Migration and breaking changes

### 7.1 Nothing shipped breaks

- `signal()` / `computed()` / `effect()` / `batch()` / `untrack()` / `effectScope()`:
  **unchanged, not one line.**
- `useLocalStorage` and all 24 shipped composables keep the replace-the-whole-value
  contract **verbatim**. They return `{ value, setValue }` object-of-getters and continue
  to work exactly as documented. **This is not a breaking change**, because deep
  reactivity arrives as a *new import*, not as new behavior on an old one.
- No `@aihu/signals` version bump is required at all (a separate package adds nothing to
  its surface). `@aihu/reactive` ships at `0.1.0`.

### 7.2 Opt-in follow-ons (each additive, each its own PR)

1. **`useLocalStorage(key, obj, { deep: true })`** → returns a reactive object plus an
   effect that serializes `unwrap()` on any deep change. New option, new size row for that
   entry; default path untouched. Same pattern applies to a future `useSessionStorage`.
2. **`@aihu/store` hydration adopts `reconcile`.** Today `applyState`
   (`packages/store/src/store.ts:53–60`) writes every key through its signal setter
   (`writeValue`, `store.ts:48`) inside a `batch`. Those setters already `Object.is`-
   short-circuit (`signal.ts:526–528`), so **unchanged primitive-valued keys already
   notify nobody today** — the claim that hydration "invalidates every subscriber even
   for unchanged values" is overstated as originally written and is corrected here.
   The real, narrower win: JSON hydration payloads mint **fresh object/array identities**
   for every object-valued key on every hydration, so `Object.is` on those keys is always
   `false` even when the payload is deeply identical to current state — `reconcile`
   prevents that spurious invalidation for object-valued state by preserving unchanged
   nested identities and notifying only genuinely-changed paths. It does **not** fix
   `$subscribe`'s single aggregate snapshot effect (`store.ts:139–152`), which re-runs on
   *any one* key changing regardless of how surgically the underlying keys were written —
   that is a separate, coarser subscription shape `reconcile` does not touch.
   Behavior-compatible, opt-in per store.
3. **`@aihu/store` setup-store state detection.** `instantiateSetup`
   (`store.ts:190–197`) detects state as a `k`/`setK` **function pair**. A reactive object
   returned from a setup store is not a function, so it is currently assigned verbatim and
   **never serialized**. Adding `isReactive()` detection to `collectSetupShape` +
   `SetupStateKeys` is required before deep state is usable in a setup store. **This is
   the one genuine gap that must be tracked, not discovered later.**
4. **`state-model` spec amendment (open, §9).** Whether `reactive` becomes an 8th
   compiler-recognized `@state` wrapper — `let user = reactive({ … })` — or stays a plain
   runtime import used as `const user = reactive({ … })`. The ratified wrapper list is
   `state | prop | derived | action | resource | stream | controller`; adding one is a spec
   change and needs founder sign-off. **I am not assuming it.** Note that the ratified
   §4.3 write-rewrite pass already handles `x.y = v` correctly *without* an amendment,
   because a proxy `set` trap needs no rewriting — only bare `state()` bindings do.

---

## 8. Semantics, sharp edges, and the tradeoffs I am ACCEPTING

**8.1 Identity / `Object.is` for a deep node.** A reactive proxy is memoized per raw
object, so `Object.is(user.address, user.address)` is `true` across reads and across
unrelated writes; it becomes `false` only when the property is **assigned a different raw
object**. `unwrap(p) === raw`. Two structurally equal but distinct raws remain unequal —
identical to today's `Object.is` semantics on signal values. Structural equality is *not*
introduced anywhere; `reconcile` is the explicit, opt-in tool for "make this tree look like
that payload without changing identities."

**8.2 Proxy is required.** Rules out very old engines. Non-issue: custom elements + shadow
DOM already set the floor above that.

**8.3 Read-path cost.** Every deep read is a trap (~5–10× a plain property read) plus, on
the *first* read of a key — tracked or not, see §2.7 — one node allocation (edges are only
added when the read is tracked, but the node object itself is created either way). Deep
trees are for state ergonomics, not inner loops, and this is doubly true for reads made
entirely outside effects (e.g. a full-tree SSR walk): they still pay one allocation per
key touched. `unwrap()` is the documented escape hatch for hot paths.

**8.4 Identity duality.** Proxy vs raw is two ways to name one object. Mitigated by
unwrap-on-write (the raw tree stays pure) and by `unwrap()` before handing values to
`structuredClone` / `postMessage` / IndexedDB / third-party libs that use `instanceof` or
private class fields.

**8.5 Two write dialects coexist.** Signal tuples replace; reactive trees mutate. Bridged
by `toSignal`/`toReactive`. Accepted as the cost of not breaking anything.

**8.6 Synchronous flush per write — the sharpest edge.** `for (const t of todos) t.done =
true` is N full effect drains. Mitigations, in order: action bodies already get a `batch()`
wrapper (state-model §4.3); `mutate()` for imperative code; array mutators wrapped
internally. **`mutate()` is NOT Immer**: writes apply immediately and a throwing recipe
leaves partial writes — same non-atomic-on-error posture `batch()` already documents
(`batch.ts:13–16`). True draft/rollback would cost ~800 B and is not proposed.

**8.7 Node accumulation.** One node per *touched* key, retained for the object's lifetime.
Bounded by property count; Solid makes the same trade.

**8.8 Non-plain objects are not reactive.** `Map`, `Set`, `Date`, class instances, DOM
nodes are stored raw and are replace-only. Vue spends ~1 kB on collection handlers; I
would not spend it without evidence.

**8.9 Frozen objects are not wrapped**, to stay inside Proxy invariants for
non-configurable, non-writable own properties.

**8.10 Arrays index-track.** A full `arr.map()` inside an effect creates a node per index.
Accepted; `arr.length` + key-based `each` keep the common path cheap.

---

## 9. SSR and custom-element implications

- **No module-level mutable state** in the layer other than `WeakMap`s keyed by object
  identity, so a per-request tree cannot leak into another request. This matches the
  isolation contract `@aihu/store` already tests
  (`packages/store/tests/ssr-isolation.test.ts`).
- **Nodes are allocated on first proxy touch of a key, tracked or not (§2.7).** Server-side
  string emission that reads outside an effect still pays one node allocation per key it
  touches — the same `Signal<void>` tuple + `Map` entry a tracked read would create — but
  because `read()`'s own `currentObserver !== null` guard no-ops the link step, it allocates
  **no graph edges**, so there is nothing for a later mutation to notify and nothing that
  can leak across an unrelated request. `unwrap()` remains the documented escape hatch when
  even the node-allocation cost matters (e.g. a full-tree SSR walk on a hot path).
- **`reactive()` in `connectedCallback`.** Component setup runs inside
  `connectedCallback`; `reactive()` there is a plain call with no lifecycle hooks and no
  scope registration, so it is safe in the synchronous upgrade path — including the
  `runWithoutScope` path arbor uses for child-element upgrades (`scope.ts:227`).
- **Hydration** is `reconcile(state, serverPayload)` on the client — identity-preserving,
  notifying only genuinely-changed paths. This is strictly better than today's `applyState`
  specifically for **object-valued** keys, where fresh JSON identities defeat `Object.is`
  on every hydration (§7.2 item 2); primitive-valued keys already short-circuit correctly
  today via the signal setter's own equality check, so `reconcile`'s win there is a wash,
  not a regression fix.
- **Serialization.** `JSON.stringify(proxy)` works (the traps are transparent), but
  `unwrap()` first is the documented form — cheaper and immune to future trap changes.
- **Shadow DOM / attributes:** no interaction. Deep values are properties, never
  attributes; nothing here touches attribute reflection or `observedAttributes`.

---

## 10. What I would NOT build

- Vue's wider suite: `shallowReactive`, `readonly`/`shallowReadonly`, `markRaw`,
  `customRef`, `triggerRef`, `watch({ deep: true })` traversal-diffing.
- Map / Set / WeakMap collection traps (revisit on evidence).
- Reactive class instances, getters with `this` semantics, `Date`/`RegExp` reactivity.
- A real Immer draft layer with rollback (§8.6).
- Immutable structural sharing as the mechanism (§2.3).
- Compiler auto-lowering of deep property access (§2.5).
- Any second scheduler, microtask batching, or async flush. The core's "synchronous
  explicit flush only" contract stays intact.
- Auto-unwrapping of signal tuples nested inside reactive objects (§6).

---

## 11. Open questions for the founder

1. **Package name and home.** `@aihu/reactive` — or fold into `@aihu/signals` as a
   subpath and accept the mangle-script + chunking work in §3? I recommend the package.
2. **`@state` wrapper.** Does `reactive` become an 8th compiler-recognized wrapper
   (a `state-model/40-spec.md` amendment), or stay a plain runtime import?
3. **Naming collision.** `@aihu/store` (Pinia) vs. any export named `store`. I chose
   `reactive()` for the primitive specifically to avoid it — confirm.
4. **`mutate()` semantics.** Write-through inside `batch()` (proposed, ~40 B) vs. a real
   copy-on-write draft with rollback (~800 B)?
5. **Scope of wave 1.** Is `reconcile` in wave 1 (it is what makes `reactiveComputed` and
   hydration work) or deferred?
6. **`@aihu/store` deep-state detection** (§7.2 item 3) — same arc, or a tracked follow-on?
7. **`each` verification.** Confirm by test that `_reconcileEach`'s own reads
   (`items.length`, `items[i]` for keys) do not over-invalidate when only a row *field*
   changes — expected to be fine (field writes touch neither `length` nor an index node),
   but it is load-bearing and currently untested.
8. **Internal-node optimization.** Later, if benchmarks justify it: replace the
   `signal()`-per-node with a bare `Subscriber` literal + direct `linkAdd`/`propagateMark`,
   which drops 2 closures + 1 tuple per node. That needs an `@internal` shared chunk and a
   re-measured core row — deliberately deferred, not designed in.

---

## 12. Acceptance criteria (if this is built)

1. `@aihu/signals/dist/index.js` gzip is byte-identical to `main`.
2. `@aihu/reactive` ≤ 1900 B gz; `/helpers` ≤ 700 B gz; both rows added and green under
   `sync-readme --check`.
3. `check-size-rows` classifies `@aihu/reactive` as browser-eligible; `publish-all.sh`
   `PKGS` updated.
4. An `effect` reading `a.b.c` re-runs on a write to `c`, on replacement of `b`, and **not**
   on a write to an unrelated sibling.
5. `effectScope().stop()` disposes a `reactiveComputed` and leaves no edges
   (assert via the existing `__inspectGraph` helper, `signal.ts:589`).
6. Keyed `each` regression test: same key, changed field → DOM updates (the §1.1 gap).
7. SSR isolation test mirroring `packages/store/tests/ssr-isolation.test.ts`: two
   concurrent "requests" never observe each other's trees.
8. `reconcile` preserves proxy identity for unchanged nodes and notifies only changed paths.
9. Node allocation matches §2.7: reading a key outside any effect (or inside `untrack()`)
   allocates that key's node but adds **no** graph edge — assert via `__inspectGraph`
   (`signal.ts:589`) that an untracked-only read leaves the node's `subsHead`/`subsTail`
   `null`, and that a subsequent write to that key does not enqueue or run any effect.
10. `obj.x = obj.x` (equal value, re-assigned) does **not** trigger an effect drain;
    a property add/delete and an out-of-bounds array index write each produce exactly
    one flush, not two (§2.6).
