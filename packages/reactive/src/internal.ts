/**
 * `@aihu/reactive` — fine-grained Proxy-backed deep reactive trees on
 * `@aihu/signals` (docs/plans/2026-07-24-deep-reactivity.md).
 *
 * Mechanism (design §2.6/§2.7): a Solid-shaped node model — lazily allocated
 * per-(object, key) tracking nodes, one `signal(0, { equals: false })` per
 * touched key used as a pure version token (the VALUE lives on the raw
 * object; the node only carries subscription edges) — with Vue-shaped
 * write ergonomics: plain `obj.key = value` assignment through the `set`
 * trap, no `setStore(...)` path tuples.
 *
 * `@aihu/signals` is the sole dependency and is marked `external` in
 * rolldown.config.ts — this package adds zero bytes to the signals core row.
 */
import { batch, type Signal, signal } from '@aihu/signals'

// ───────── Identity maps (design §2.6) ─────────

/** raw → proxy. Stable so `reactive(o) === reactive(o)`. */
const wrapMap = new WeakMap<object, object>()
/** proxy → raw. `unwrap()` is a single lookup here — O(1), no traversal. */
const rawMap = new WeakMap<object, object>()
/** raw → per-key tracking node map. Lazily populated (design §2.7): a node
 * is allocated on the FIRST get-trap touch of a key, tracked or not. */
const nodeMap = new WeakMap<object, Map<PropertyKey, Signal<number>>>()

/** @internal — sentinel key for the per-object "shape" node: notified on
 * property add/delete, tracked by `ownKeys`/`has` (design §2.6). Never
 * collides with a real property key (own module-local symbol). */
const KEYS: unique symbol = Symbol('aihu-reactive-keys')

/** Array mutator methods that touch more than one index/length slot — run
 * inside `batch()` so e.g. `arr.push(a, b)` is one flush, not N (design
 * §2.6: "array mutating methods run inside batch()"). Intercepted directly
 * in the `get` trap rather than tracked as a plain property read: nobody
 * meaningfully subscribes to the identity of the `push` function itself. */
const ARRAY_MUTATORS = new Set<PropertyKey>([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

function getNodes(raw: object): Map<PropertyKey, Signal<number>> {
  let nodes = nodeMap.get(raw)
  if (nodes === undefined) {
    nodes = new Map()
    nodeMap.set(raw, nodes)
  }
  return nodes
}

function getOrCreateNode(
  nodes: Map<PropertyKey, Signal<number>>,
  key: PropertyKey,
): Signal<number> {
  let node = nodes.get(key)
  if (node === undefined) {
    node = signal(0, { equals: false })
    nodes.set(key, node)
  }
  return node
}

function isArrayIndexKey(key: PropertyKey): boolean {
  if (typeof key !== 'string') return false
  if (key === '') return false
  const n = Number(key)
  return Number.isInteger(n) && n >= 0 && String(n) === key
}

/** Solid's `isWrappable`, minus the collection-type carve-outs this design
 * doesn't need (design §2.2, §2.6): plain objects and arrays, not frozen. */
function isWrappable(v: object): boolean {
  if (Object.isFrozen(v)) return false
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function isPlainObjectLike(v: unknown): v is Record<PropertyKey, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function sameContainerShape(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return true
  return isPlainObjectLike(a) && isPlainObjectLike(b)
}

/** Recursively replace nested reactive proxies found inside a freshly
 * assigned plain container with their raw counterparts, IN PLACE, before
 * that container is stored on the raw tree (design §2.6/§8.4: "the raw
 * tree never contains proxies"). Plain `unwrap()` is a single WeakMap
 * lookup and only strips a DIRECTLY-assigned proxy — `outer.box = { inner:
 * someProxy }` would otherwise smuggle `someProxy` in under `box.inner`
 * since `box` itself was never a proxy. Walks only wrappable containers
 * (same class `isWrappable` recognizes); a `seen` WeakSet guards against
 * cyclic user data. */
function unwrapDeep(value: unknown, seen?: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value
  const raw = rawMap.get(value as object)
  const container = raw !== undefined ? raw : (value as object)
  if (!isWrappable(container)) return container
  const visited = seen ?? new WeakSet<object>()
  if (visited.has(container)) return container
  visited.add(container)
  const rec = container as Record<PropertyKey, unknown>
  for (const k of Reflect.ownKeys(rec)) {
    const v = rec[k]
    if (v !== null && typeof v === 'object') {
      rec[k] = unwrapDeep(v, visited)
    }
  }
  return container
}

// ───────── Proxy traps (design §2.6) ─────────

const handlers: ProxyHandler<object> = {
  get(target, key, receiver) {
    if (Array.isArray(target) && ARRAY_MUTATORS.has(key)) {
      const fn = (target as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>)[key] as (
        ...a: unknown[]
      ) => unknown
      // Apply with `this = receiver` (the proxy, not the raw target) so the
      // method's own internal index/length writes route through OUR `set`
      // trap — that's what makes `batch()` here collapse them into one
      // flush instead of bypassing tracking entirely.
      return (...args: unknown[]) => batch(() => fn.apply(receiver, args))
    }
    // First-touch allocation, tracked or not (design §2.7): the read() call
    // below is the ordinary signal reader — `if (currentObserver !== null)
    // linkAdd(...)` — so an untracked read allocates the node but no edge.
    getOrCreateNode(getNodes(target), key)[0]()
    const res = (target as Record<PropertyKey, unknown>)[key]
    return res !== null && typeof res === 'object' ? reactive(res as object) : res
  },

  set(target, key, value) {
    const isArray = Array.isArray(target)
    const rawValue = unwrapDeep(value)
    const record = target as Record<PropertyKey, unknown>
    // Add-detection MUST run before the equality short-circuit below:
    // assigning `undefined` to a key that does not yet exist has to still
    // create it (plain-JS parity, design §2.1/§2.6) — `oldValue` for a
    // missing key also reads as `undefined`, so checking `hadKey` first is
    // what tells the two cases apart.
    const hadKey = key in target
    const oldValue = record[key]
    // Equality short-circuit (design §2.6) — same Object.is rule and the
    // same "no allocation, no notify" shape signal.ts's write() already
    // applies to every tuple write. `obj.x = obj.x` is a correct no-op.
    if (hadKey && Object.is(rawValue, oldValue)) return true

    const nodes = getNodes(target)

    // Array length assignment is the one write that can silently drop (or
    // reintroduce) index properties without ever routing through
    // `deleteProperty` — handle it explicitly so effects subscribed to a
    // dropped index are notified. This is the exact path `reconcile()`'s
    // truncation uses (`proxy.length = next.length`), so fixing it here
    // fixes reconcile too (design §8.10's index-tracking model).
    if (isArray && key === 'length') {
      const oldLen = oldValue as number
      record.length = rawValue as number
      const newLen = record.length as number
      const lengthNode = getOrCreateNode(nodes, 'length')
      if (newLen < oldLen) {
        batch(() => {
          lengthNode[1]((v) => v + 1)
          for (let i = newLen; i < oldLen; i++) {
            const idxNode = nodes.get(String(i))
            if (idxNode !== undefined) idxNode[1]((v) => v + 1)
          }
        })
      } else {
        lengthNode[1]((v) => v + 1)
      }
      return true
    }

    record[key] = rawValue
    const keyNode = getOrCreateNode(nodes, key)
    if (hadKey) {
      // Plain value write on an existing key touches exactly one node —
      // no batch needed (matches tuple-write semantics: one write, one
      // flush).
      keyNode[1]((v) => v + 1)
      return true
    }
    // Add path: property add, or an array index write past the current
    // length. Both touch the key's own node AND a shape companion node
    // (KEYS for objects / length for array-index adds) — batched together
    // so the trap never produces two back-to-back synchronous drains for
    // one authored assignment (design §2.6). `ownKeys`/`has` track BOTH
    // nodes for arrays (below), so bumping `length` alone still wakes
    // Object.keys/for-in/`in` watchers on an index add.
    const companion = getOrCreateNode(nodes, isArray && isArrayIndexKey(key) ? 'length' : KEYS)
    batch(() => {
      keyNode[1]((v) => v + 1)
      companion[1]((v) => v + 1)
    })
    return true
  },

  has(target, key) {
    const nodes = getNodes(target)
    getOrCreateNode(nodes, KEYS)[0]()
    // Arrays notify index adds via the `length` node, not KEYS (see
    // `set`) — track it too so `'k' in arr` reacts to shape changes made
    // through an index write, not only through defineProperty-shaped adds.
    if (Array.isArray(target)) getOrCreateNode(nodes, 'length')[0]()
    return key in target
  },

  deleteProperty(target, key) {
    const had = key in target
    const ok = delete (target as Record<PropertyKey, unknown>)[key]
    if (had && ok) {
      const nodes = getNodes(target)
      const keyNode = nodes.get(key)
      const keysNode = getOrCreateNode(nodes, KEYS)
      batch(() => {
        if (keyNode !== undefined) keyNode[1]((v) => v + 1)
        keysNode[1]((v) => v + 1)
      })
    }
    return ok
  },

  ownKeys(target) {
    const nodes = getNodes(target)
    getOrCreateNode(nodes, KEYS)[0]()
    // See `has` above: array index adds bump `length`, not KEYS.
    if (Array.isArray(target)) getOrCreateNode(nodes, 'length')[0]()
    return Reflect.ownKeys(target)
  },
}

// ───────── Public core API (design §4.1) ─────────

/**
 * Wrap a plain object/array in a fine-grained reactive tree. Idempotent and
 * identity-stable: `reactive(o) === reactive(o)`, `reactive(reactive(o)) ===
 * reactive(o)`. Non-wrappable values (Date, Map, Set, class instances,
 * frozen objects, primitives) are returned as-is.
 */
export function reactive<T extends object>(source: T): T {
  if (source === null || typeof source !== 'object') return source
  if (rawMap.has(source as object)) return source // already a proxy
  const cached = wrapMap.get(source as object)
  if (cached !== undefined) return cached as T
  if (!isWrappable(source as object)) return source
  const proxy = new Proxy(source as object, handlers) as T
  wrapMap.set(source as object, proxy as object)
  rawMap.set(proxy as object, source as object)
  return proxy
}

/** True for a proxy produced by `reactive()`. */
export function isReactive(value: unknown): boolean {
  return value !== null && typeof value === 'object' && rawMap.has(value as object)
}

/** The raw object behind a reactive proxy (O(1), no traversal — writes
 * unwrap, so the raw tree never contains proxies). Non-proxies pass
 * through unchanged. */
export function unwrap<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const raw = rawMap.get(value as object)
    if (raw !== undefined) return raw as T
  }
  return value
}

/** Apply many writes as ONE flush. Equivalent to `batch(() => recipe(target))`
 * — the "draft" IS the reactive proxy; writes apply immediately (design
 * §8.6: NOT an Immer draft — a throwing recipe leaves partial writes, same
 * non-atomic-on-error posture `batch()` already documents). */
export function mutate<T extends object>(target: T, recipe: (draft: T) => void): void {
  batch(() => recipe(target))
}

// ───────── reconcile (design §4.1, §7.2, §9) ─────────

type ReconcileOptions = { key?: PropertyKey | ((item: unknown) => unknown) }

function reconcileInto(proxy: object, next: unknown, options?: ReconcileOptions): void {
  const raw = unwrap(proxy)
  if (Array.isArray(raw) && Array.isArray(next)) {
    // `key` must apply at every array encountered during the recursion,
    // not only a top-level array (design intent: `reconcile(state, payload,
    // { key: 'id' })` where `state.rows` is a nested array) — falling back
    // to index matching here would silently re-identity rows on a reorder.
    if (options?.key !== undefined) {
      reconcileArrayKeyed(proxy as unknown[], raw, next, options)
      return
    }
    for (let i = 0; i < next.length; i++) {
      reconcileField(proxy, i, (raw as unknown[])[i], next[i], i < raw.length, options)
    }
    if (next.length < raw.length) (proxy as unknown[]).length = next.length
    return
  }
  if (isPlainObjectLike(raw) && isPlainObjectLike(next)) {
    for (const k of Reflect.ownKeys(next)) {
      reconcileField(proxy, k, raw[k], next[k], Object.hasOwn(raw, k), options)
    }
    for (const k of Reflect.ownKeys(raw)) {
      if (!Object.hasOwn(next, k)) {
        delete (proxy as Record<PropertyKey, unknown>)[k]
      }
    }
  }
}

/** Reconcile one field. Reads for comparison come from the RAW values
 * (never through the proxy) so this can run safely inside the tracking
 * effect that drives `reactiveComputed` without the write-side of this
 * same reconcile becoming a read-side dependency of itself. Only the
 * write path (`proxy[key] = …`) touches the proxy.
 *
 * `hadKey` mirrors the `set` trap's own add-detection fix: `curVal` for a
 * key genuinely absent from `raw` reads as `undefined`, same as an
 * explicit `undefined` value would — `Object.is` alone can't tell "already
 * undefined" from "never existed" apart, so a payload adding an
 * explicitly-`undefined`-valued key would otherwise be silently dropped as
 * a no-op. */
function reconcileField(
  proxy: object,
  key: PropertyKey,
  curVal: unknown,
  nextVal: unknown,
  hadKey: boolean,
  options?: ReconcileOptions,
): void {
  if (sameContainerShape(curVal, nextVal)) {
    reconcileInto(reactive(curVal as object), nextVal, options)
  } else if (!hadKey || !Object.is(curVal, nextVal)) {
    ;(proxy as Record<PropertyKey, unknown>)[key] = nextVal
  }
}

function reconcileArrayKeyed(
  proxy: unknown[],
  raw: unknown[],
  next: unknown[],
  options: ReconcileOptions,
): void {
  const keyOpt = options.key as PropertyKey | ((item: unknown) => unknown)
  const idOf =
    typeof keyOpt === 'function'
      ? keyOpt
      : (item: unknown) => (item as Record<PropertyKey, unknown> | null)?.[keyOpt]
  const byKey = new Map<unknown, unknown>()
  for (const item of raw) byKey.set(idOf(item), item)
  const merged: unknown[] = new Array(next.length)
  for (let i = 0; i < next.length; i++) {
    const nextItem = next[i]
    const id = idOf(nextItem)
    const match = byKey.get(id)
    if (match !== undefined && sameContainerShape(match, nextItem)) {
      reconcileInto(reactive(match as object), nextItem, options)
      merged[i] = match
      // Consume the match: a duplicate key in `next` must NOT alias a
      // second array slot onto the same raw object (that would silently
      // make `proxy[i] === proxy[j]`, so a later write to one row mutates
      // the other). Unmatched duplicates fall through to a fresh value.
      byKey.delete(id)
    } else {
      merged[i] = nextItem
    }
  }
  for (let i = 0; i < merged.length; i++) {
    if (!Object.is(raw[i], merged[i])) proxy[i] = merged[i]
  }
  if (merged.length < raw.length) proxy.length = merged.length
}

/**
 * Merge `next` into `target` in place, preserving node identity for
 * unchanged values and notifying ONLY changed paths. The hydration /
 * refetch primitive. `key` controls array item matching (default: index),
 * applied recursively to every array reconcile encounters, not only a
 * top-level one.
 */
export function reconcile<T extends object>(target: T, next: T, options?: ReconcileOptions): void {
  const proxy = reactive(target)
  batch(() => {
    reconcileInto(proxy as object, next, options)
  })
}

// ───────── Test-only introspection ─────────
//
// NOT re-exported from index.ts (the "." entry stays exactly the public
// API above) — reached only via a direct relative import from tests, the
// same pattern packages/signals/src/signal.ts uses for `__hostOf` /
// `__inspectGraph`. Since index.ts never references this binding, it is
// dead-code-eliminated out of the measured `dist/index.js` (design §5,
// §12 acceptance #1/#2 — this must never move the size row).

/** @internal — test-only: the read function of the per-key tracking node
 * for `(raw, key)`, or `undefined` if that key has never been touched
 * through the proxy's `get`/`set` trap. Compose with `@aihu/signals`'
 * `__hostOf`/`__inspectGraph` to assert §2.7's allocation contract. */
export function __nodeOf(raw: object, key: PropertyKey): (() => number) | undefined {
  return nodeMap.get(raw)?.get(key)?.[0]
}
