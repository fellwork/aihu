import { signal } from './signal.ts'

export interface LatticeSignal<T> {
  read(): T
  merge(value: T): void
  commit(): boolean
}

/**
 * Create a signal that accumulates writes via a monotonic merge function and
 * only notifies subscribers when commit() observes an actual change.
 *
 * WARNING: When `T` is an object type, the `commit()` reference-equality check
 * requires `merge()` to return the same reference to suppress no-op writes —
 * otherwise every `merge()` triggers a signal write. Use primitive types or be
 * explicit about reference identity in the merge function.
 */
export function latticeSignal<T>(mergeFn: (a: T, b: T) => T, initial: T): LatticeSignal<T> {
  const [read, write] = signal(initial)
  let pending = initial
  return {
    read,
    merge(v) { pending = mergeFn(pending, v) },
    commit() {
      if (pending === read()) return false
      write(() => pending)
      return true
    },
  }
}

export function boolLatticeSignal(initial: boolean): LatticeSignal<boolean> {
  return latticeSignal((a, b) => a || b, initial)
}

export function maxLatticeSignal(initial: number): LatticeSignal<number> {
  return latticeSignal((a, b) => (a > b ? a : b), initial)
}
