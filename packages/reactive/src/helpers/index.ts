/**
 * `@aihu/reactive/helpers` — the tree ↔ tuple bridge (design
 * docs/plans/2026-07-24-deep-reactivity.md §4.2).
 *
 * Imports the core (`@aihu/reactive`) by package NAME rather than a
 * relative path, and that self-import is marked `external` in
 * rolldown.config.ts (mirroring `@aihu/signals` being external to the
 * core row) — so this entry measures only the helper-specific code, never
 * a duplicate copy of the trap machinery.
 */
import { reactive, reconcile } from '@aihu/reactive'
import { effect, type Signal } from '@aihu/signals'

/** Lens a single property as a signal tuple — the tree → tuple bridge.
 * Reads track the SAME per-key node the proxy's `get` trap would create
 * (it IS that trap); writes go through the proxy's `set` trap. */
export function toSignal<T extends object, K extends keyof T>(t: T, k: K): Signal<T[K]> {
  const read = () => t[k]
  const write = (next: unknown) => {
    t[k] = typeof next === 'function' ? (next as (prev: T[K]) => T[K])(t[k]) : (next as T[K])
  }
  return [read, write] as unknown as Signal<T[K]>
}

/** Every own key as a signal tuple. Destructure-safe (each tuple is a live
 * lens). */
export function toSignals<T extends object>(t: T): { [K in keyof T]: Signal<T[K]> } {
  const out = {} as { [K in keyof T]: Signal<T[K]> }
  for (const k of Object.keys(t) as Array<keyof T>) {
    out[k] = toSignal(t, k)
  }
  return out
}

/** Signal-of-object → reactive-looking view. Whole-value read granularity;
 * writes go through the tuple's setter with a shallow copy. The tuple →
 * tree bridge. */
export function toReactive<T extends object>(source: Signal<T>): T {
  const [read, write] = source
  return new Proxy({} as T, {
    get(_t, key) {
      return (read() as Record<PropertyKey, unknown>)[key]
    },
    set(_t, key, value) {
      write((prev) => ({ ...(prev as object), [key]: value }) as T)
      return true
    },
    has(_t, key) {
      return key in (read() as object)
    },
    deleteProperty(_t, key) {
      write((prev) => {
        const next = { ...(prev as object) } as Record<PropertyKey, unknown>
        delete next[key]
        return next as T
      })
      return true
    },
    ownKeys() {
      return Reflect.ownKeys(read() as object)
    },
    getOwnPropertyDescriptor(_t, key) {
      const obj = read() as Record<PropertyKey, unknown>
      if (!(key in obj)) return undefined
      return { enumerable: true, configurable: true, value: obj[key] }
    },
  }) as T
}

/** Read-through view over a subset of keys — no copies, tracking is
 * preserved (each read forwards to the source proxy's own trap). */
export function reactivePick<T extends object, K extends keyof T>(s: T, ...keys: K[]): Pick<T, K> {
  const keySet = new Set<PropertyKey>(keys)
  return new Proxy({} as Pick<T, K>, {
    get(_t, key) {
      return keySet.has(key) ? (s as Record<PropertyKey, unknown>)[key] : undefined
    },
    has(_t, key) {
      return keySet.has(key) && key in (s as object)
    },
    ownKeys() {
      return [...keySet] as (string | symbol)[]
    },
    getOwnPropertyDescriptor(_t, key) {
      if (!keySet.has(key)) return undefined
      return {
        enumerable: true,
        configurable: true,
        value: (s as Record<PropertyKey, unknown>)[key],
      }
    },
  }) as Pick<T, K>
}

/** Read-through view omitting a subset of keys — no copies, tracking is
 * preserved. */
export function reactiveOmit<T extends object, K extends keyof T>(s: T, ...keys: K[]): Omit<T, K> {
  const omitSet = new Set<PropertyKey>(keys)
  return new Proxy({} as Omit<T, K>, {
    get(_t, key) {
      return omitSet.has(key) ? undefined : (s as Record<PropertyKey, unknown>)[key]
    },
    has(_t, key) {
      return !omitSet.has(key) && key in (s as object)
    },
    ownKeys() {
      return Reflect.ownKeys(s as object).filter((k) => !omitSet.has(k))
    },
    getOwnPropertyDescriptor(_t, key) {
      if (omitSet.has(key)) return undefined
      return {
        enumerable: true,
        configurable: true,
        value: (s as Record<PropertyKey, unknown>)[key],
      }
    },
  }) as Omit<T, K>
}

/** A reactive object kept in sync with `fn()` by an effect + `reconcile`.
 * Scope-owned: `effect()` registers with the current scope like any other
 * effect, so the enclosing `effectScope` disposes it. Per-key granularity
 * — consumers that read one key only re-run when THAT key changes,
 * because `reconcile` notifies only the keys that actually changed. */
export function reactiveComputed<T extends object>(fn: () => T): T {
  const target = reactive({} as T)
  effect(() => {
    const next = fn()
    reconcile(target, next)
  })
  return target
}
