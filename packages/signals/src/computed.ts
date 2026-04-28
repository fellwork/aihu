import { SignalCircularError } from './errors.ts'
import {
  DISPOSED,
  EFFECT,
  HAS_COMPUTED_DEPS,
  MARKED,
  peekCurrentObserver,
  type Read,
  RUNNING,
  STALE,
  type Subscriber,
  setCurrentObserver,
  shallowClear,
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
    // subs starts undefined (Phase 0 single-sub fast path).
    notify() {
      if (node.flags & DISPOSED) return
      if (node.flags & RUNNING) throw new SignalCircularError()
    },
    recomputeIfNeeded() {
      if (node.flags & DISPOSED) return
      if (!hasEffectSub) return
      if (!(node.flags & STALE)) return
      if (node.subs === undefined) return
      const hadCache = hasCached
      const prev = cached
      const next = recompute()
      cached = next
      hasCached = true
      if (hadCache && equals !== false && equals(prev, next)) {
        shallowClear(node.subs)
        return
      }
      // Re-assert MARKED on direct subs unconditionally. Inlined dispatch
      // (single vs Set) — this is in the cellx hot path for every L4 → L1
      // computed with a downstream effect.
      const s = node.subs
      if (s !== undefined) {
        if (s instanceof Set) {
          for (const sub of s) {
            if (sub.flags & DISPOSED) continue
            if (sub.flags & EFFECT) sub.flags |= MARKED
            else sub.flags |= STALE | MARKED
          }
        } else if (!(s.flags & DISPOSED)) {
          if (s.flags & EFFECT) s.flags |= MARKED
          else s.flags |= STALE | MARKED
        }
      }
    },
  }

  const read: Read<T> = () => {
    if (node.flags & RUNNING) throw new SignalCircularError()
    const observer = peekCurrentObserver()
    if (observer !== null) {
      // Inlined subAdd-with-dedup. `cur` is undefined / single / Set.
      const cur = node.subs
      let added = false
      if (cur === undefined) {
        node.subs = observer
        added = true
      } else if (cur instanceof Set) {
        if (!cur.has(observer)) {
          cur.add(observer)
          added = true
        }
      } else if (cur !== observer) {
        node.subs = new Set<Subscriber>([cur, observer])
        added = true
      }
      if (added) {
        if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
        // Computed-observer reading a computed source: mark observer as
        // having computed deps so markOne's restricted leaf fast path
        // skips it forever (spec §3 sufficiency invariant). Only
        // computeds expose `recomputeIfNeeded`; effects don't, so this
        // is the canonical "observer is a computed" probe.
        else if (observer.recomputeIfNeeded !== undefined) observer.flags |= HAS_COMPUTED_DEPS
      }
    }
    if (!hasCached || node.flags & STALE) {
      cached = recompute()
      hasCached = true
    }
    return cached
  }

  return read
}
