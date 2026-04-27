import { SignalCircularError } from './errors.ts'
import {
  DISPOSED,
  peekCurrentObserver,
  type Read,
  RUNNING,
  STALE,
  type Subscriber,
  setCurrentObserver,
} from './signal.ts'

export interface ComputedOptions<T> {
  /**
   * Equality comparator applied to recomputed values. When the recomputed
   * value compares equal to the previous cached value, the cascade to
   * downstream subscribers is suppressed (they don't re-run on equal
   * recomputes).
   * - Omitted → default `Object.is`.
   * - `false` → never short-circuit; always cascade on dep change.
   * - Function → custom comparator; `true` means "equal, skip cascade".
   * See spec §1.3.
   */
  equals?: ((a: T, b: T) => boolean) | false
}

export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Read<T> {
  let cached: T
  let hasCached = false
  const subs = new Set<Subscriber>()
  const eq = options?.equals
  const equals: ((a: T, b: T) => boolean) | false = eq === undefined ? Object.is : eq

  const recompute = (): T => {
    node.flags |= RUNNING
    const prevObserver = setCurrentObserver(node)
    try {
      return fn()
    } finally {
      setCurrentObserver(prevObserver)
      node.flags &= ~RUNNING
      node.flags &= ~STALE
    }
  }

  const node: Subscriber = {
    flags: STALE,
    notify() {
      if (node.flags & DISPOSED) return
      if (node.flags & RUNNING) throw new SignalCircularError()
      // If already stale, downstream was already notified on the prior write —
      // suppress the redundant cascade.
      if (node.flags & STALE) return
      node.flags |= STALE
      // No subscribers → nothing to cascade. Stay lazy.
      if (subs.size === 0) return
      // Eagerly recompute to determine whether subscribers actually need to
      // be notified. If the recomputed value is equal to the cached value
      // (under the configured comparator), suppress the cascade — downstream
      // effects/computeds shouldn't re-run on equal recomputes.
      const prev = cached
      const next = recompute()
      cached = next
      hasCached = true
      if (equals !== false && equals(prev, next)) return
      for (const sub of [...subs]) {
        sub.notify()
      }
    },
  }

  const read: Read<T> = () => {
    // Re-entry while running is a synchronous cycle.
    if (node.flags & RUNNING) throw new SignalCircularError()
    // Forward observation: register the calling observer as a sub of this computed.
    const observer = peekCurrentObserver()
    if (observer !== null) subs.add(observer)
    if (!hasCached || node.flags & STALE) {
      cached = recompute()
      hasCached = true
    }
    return cached
  }

  return read
}
