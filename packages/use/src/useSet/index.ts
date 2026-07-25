/**
 * `useSet` — a reactive `Set` wrapper: signal-backed reads (`has`, `size`,
 * a `values` snapshot) plus mutations (`add`, `delete`, `clear`)
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{size()}`, never bare `{size}`.
 *
 * **Replace-don't-mutate semantics** — same contract as `useSet`'s sibling
 * `useMap`: every mutation replaces the underlying `Set` with a NEW `Set`
 * instance rather than mutating one in place. A `Set` reference captured
 * from this composable at time T is a frozen snapshot; always read
 * through the returned getters, never by holding one snapshot's identity.
 *
 * SSR (`isClient === false`): returns static getters over the initial
 * values and no-op mutators — no signal is created, matching the
 * `isClient` no-op invariant (mirrors `useCounter`/`useMap`).
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'

export interface UseSetReturn<T> {
  /** Reactive getter — read as `{size()}` in templates (parens required). */
  readonly size: () => number
  /** Reactive read — tracks the underlying signal, so an effect calling
   * `has(value)` re-runs on any `add`/`delete`/`clear` that could affect
   * it. */
  has: (value: T) => boolean
  /** Reactive getter — a fresh value array snapshot, read as `{values()}`
   * (parens required). */
  readonly values: () => T[]
  /** Add `value`. Replaces the underlying `Set` (see module doc) only when
   * `value` wasn't already present. No-op under SSR. */
  add: (value: T) => void
  /** Delete `value`; returns whether it was present. No-op (returns
   * `false`) under SSR. */
  delete: (value: T) => boolean
  /** Remove every value. No-op under SSR. */
  clear: () => void
}

/**
 * A reactive `Set<T>`, optionally seeded from `seed` (anything
 * `new Set()` itself accepts). See the module doc for the
 * replace-don't-mutate contract every mutation follows.
 */
export function useSet<T>(seed?: Iterable<T>): UseSetReturn<T> {
  const initial = new Set<T>(seed)

  // SSR: static getters over the initial values, no signal, no-op
  // mutators.
  if (!isClient) {
    return {
      size: () => initial.size,
      has: (value) => initial.has(value),
      values: () => Array.from(initial.values()),
      add: () => {},
      delete: () => false,
      clear: () => {},
    }
  }

  const [set, setSet] = signal<Set<T>>(initial)

  const size = (): number => set().size
  const has = (value: T): boolean => set().has(value)
  const values = (): T[] => Array.from(set().values())

  const add = (value: T): void => {
    const current = set()
    if (current.has(value)) return
    const next = new Set(current)
    next.add(value)
    setSet(() => next)
  }

  const remove = (value: T): boolean => {
    const current = set()
    if (!current.has(value)) return false
    const next = new Set(current)
    next.delete(value)
    setSet(() => next)
    return true
  }

  const clear = (): void => {
    if (set().size === 0) return
    setSet(() => new Set<T>())
  }

  return { size, has, values, add, delete: remove, clear }
}
