/**
 * `useMap` — a reactive `Map` wrapper: signal-backed reads (`get`, `has`,
 * `size`, and `entries`/`keys`/`values` snapshots) plus mutations (`set`,
 * `delete`, `clear`) (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{size()}`, never bare `{size}`.
 *
 * **Replace-don't-mutate semantics (deliberate, document this to callers):**
 * every mutation (`set`/`delete`/`clear`) replaces the underlying `Map`
 * with a NEW `Map` instance — it never calls `.set`/`.delete`/`.clear` on
 * the map object a caller may have captured earlier. A `Map` reference
 * pulled out of this composable at time T is a frozen snapshot; it will
 * NOT reflect a mutation made at time T+1. Always read through the
 * returned getters (`get`/`has`/`size`/`entries`/`keys`/`values`), never by
 * holding onto one snapshot's identity. This is what makes every read
 * naturally reactive (a plain signal swap) instead of requiring manual
 * dirty-marking on in-place `Map` mutation.
 *
 * SSR (`isClient === false`): returns static getters over the initial
 * entries and no-op mutators — no signal is created, matching the
 * `isClient` no-op invariant (there is no listener/timer/observer here
 * either way; the SSR branch exists only to skip the signal allocation,
 * mirroring `useCounter`).
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'

export interface UseMapReturn<K, V> {
  /** Reactive getter — read as `{size()}` in templates (parens required). */
  readonly size: () => number
  /** Reactive read — tracks the underlying signal, so an effect calling
   * `get(key)` re-runs on any `set`/`delete`/`clear` that could affect it. */
  get: (key: K) => V | undefined
  /** Reactive read, same tracking as `get`. */
  has: (key: K) => boolean
  /** Reactive getter — a fresh `[key, value]` array snapshot, read as
   * `{entries()}` (parens required). */
  readonly entries: () => Array<[K, V]>
  /** Reactive getter — a fresh key array snapshot. */
  readonly keys: () => K[]
  /** Reactive getter — a fresh value array snapshot. */
  readonly values: () => V[]
  /** Set `key` to `value` — replaces the underlying `Map` (see module
   * doc). No-op under SSR. */
  set: (key: K, value: V) => void
  /** Delete `key`; returns whether it was present. Replaces the underlying
   * `Map` only when it actually removes an entry. No-op (returns `false`)
   * under SSR. */
  delete: (key: K) => boolean
  /** Remove every entry. No-op under SSR. */
  clear: () => void
}

/**
 * A reactive `Map<K, V>`, optionally seeded from `seed` (anything
 * `new Map()` itself accepts). See the module doc for the
 * replace-don't-mutate contract every mutation follows.
 */
export function useMap<K, V>(seed?: Iterable<readonly [K, V]>): UseMapReturn<K, V> {
  const initial = new Map<K, V>(seed)

  // SSR: static getters over the initial entries, no signal, no-op
  // mutators.
  if (!isClient) {
    return {
      size: () => initial.size,
      get: (key) => initial.get(key),
      has: (key) => initial.has(key),
      entries: () => Array.from(initial.entries()),
      keys: () => Array.from(initial.keys()),
      values: () => Array.from(initial.values()),
      set: () => {},
      delete: () => false,
      clear: () => {},
    }
  }

  const [map, setMap] = signal<Map<K, V>>(initial)

  const size = (): number => map().size
  const get = (key: K): V | undefined => map().get(key)
  const has = (key: K): boolean => map().has(key)
  const entries = (): Array<[K, V]> => Array.from(map().entries())
  const keys = (): K[] => Array.from(map().keys())
  const values = (): V[] => Array.from(map().values())

  const set = (key: K, value: V): void => {
    const current = map()
    if (current.has(key) && current.get(key) === value) return
    const next = new Map(current)
    next.set(key, value)
    // Functional-updater form — `Map`/generic `V` could itself be
    // function-shaped, so a bare `next` is ambiguous against `Write<T>`'s
    // updater overload (see useLocalStorage/useDebounced).
    setMap(() => next)
  }

  const remove = (key: K): boolean => {
    const current = map()
    if (!current.has(key)) return false
    const next = new Map(current)
    next.delete(key)
    setMap(() => next)
    return true
  }

  const clear = (): void => {
    if (map().size === 0) return
    setMap(() => new Map<K, V>())
  }

  return { size, get, has, entries, keys, values, set, delete: remove, clear }
}
