import { SignalCircularError } from './errors.ts'
import {
  DISPOSED,
  EFFECT,
  MARKED,
  peekCurrentObserver,
  type Read,
  RUNNING,
  STALE,
  type Subscriber,
  setCurrentObserver,
  shallowClear,
  shallowClearFired,
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
  // Set when any effect subscribes (directly). Lazy chains (computeds whose
  // subs are exclusively other computeds) skip the phase-2 recompute and
  // let downstream readers pull via STALE. As soon as an effect is sub'd,
  // we switch to eager-in-phase-2 so the equality cascade-suppression
  // check (Phase 2 Finding 3) fires before the effect runs.
  let hasEffectSub = false

  const recompute = (): T => {
    node.flags |= RUNNING
    const prevObserver = setCurrentObserver(node)
    try {
      return fn()
    } finally {
      setCurrentObserver(prevObserver)
      node.flags &= ~(RUNNING | STALE | MARKED)
    }
  }

  const node: Subscriber = {
    flags: STALE,
    subs,
    notify() {
      if (node.flags & DISPOSED) return
      if (node.flags & RUNNING) throw new SignalCircularError()
    },
    recomputeIfNeeded() {
      if (node.flags & DISPOSED) return
      if (!hasEffectSub) return
      if (!(node.flags & STALE)) return
      if (subs.size === 0) return
      const hadCache = hasCached
      const prev = cached
      const next = recompute()
      cached = next
      hasCached = true
      if (hadCache && equals !== false && equals(prev, next)) {
        shallowClear(subs)
        return
      }
      // Re-assert MARKED on direct subs only when a prior equality cascade
      // in this wave has fired (which may have cleared them). In the
      // common no-equality-clear case, MARKED is still set from phase 1
      // and this loop is a no-op — skipping it saves O(subs) work per
      // computed in shallow fan-outs (e.g. wide-fanout-100).
      if (!shallowClearFired) return
      for (const sub of subs) {
        if (sub.flags & DISPOSED) continue
        if (sub.flags & EFFECT) sub.flags |= MARKED
        else sub.flags |= STALE | MARKED
      }
    },
  }

  const read: Read<T> = () => {
    if (node.flags & RUNNING) throw new SignalCircularError()
    const observer = peekCurrentObserver()
    if (observer !== null && !subs.has(observer)) {
      subs.add(observer)
      if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
    }
    if (!hasCached || node.flags & STALE) {
      cached = recompute()
      hasCached = true
    }
    return cached
  }

  return read
}
