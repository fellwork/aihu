import { SignalCircularError } from './errors.ts'
import {
  DISPOSED,
  EFFECT,
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
  // Monotonic: once any effect subscribes (directly or indirectly) to this
  // computed, the notify() path stays eager forever. This keeps Phase 2
  // Finding 3 (equality-cascade-suppression) intact for any computed observed
  // by an effect, while computeds whose subs are exclusively other computeds
  // can lazy-propagate STALE marks without running their bodies — see
  // spec §2.4. TODO(post-arbor): re-evaluate as a refcounted variant if real
  // arbor scenarios show the monotonic approximation over-paying.
  let hasEffectSub = false

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
      // suppress the redundant cascade. (Unchanged from Phase 2.)
      if (node.flags & STALE) return
      node.flags |= STALE
      // No subscribers → nothing to cascade. Stay lazy. (Unchanged.)
      if (subs.size === 0) return

      if (hasEffectSub) {
        // Eager path: at least one effect-sub depends on whether the
        // recomputed value differs. Recompute now, equality-test, decide
        // whether to cascade. This preserves Phase 2 Finding 3
        // (equality-cascade-suppression).
        const prev = cached
        const next = recompute()
        cached = next
        hasCached = true
        if (equals !== false && equals(prev, next)) return
        for (const sub of [...subs]) sub.notify()
      } else {
        // Lazy path: subs are only other computeds. Propagate STALE marks
        // without running our body. The downstream computeds will lazily
        // recompute when something reads them. No equality check fires here
        // — it fires later, at the eager-path computed (or at the read site
        // for an unsubscribed pull).
        //
        // Iterating `subs` directly (no [...subs] snapshot) is safe because
        // the lazy path only sets a STALE bit and recurses; no body runs,
        // no dispose can fire, no mutation of `subs` occurs during
        // iteration. If a future change introduces side effects on the
        // lazy path, this iteration must switch to a snapshot — see
        // spec §2.4 / §7.2.
        for (const sub of subs) sub.notify()
      }
    },
  }

  const read: Read<T> = () => {
    // Re-entry while running is a synchronous cycle.
    if (node.flags & RUNNING) throw new SignalCircularError()
    // Forward observation: register the calling observer as a sub of this computed.
    const observer = peekCurrentObserver()
    if (observer !== null) {
      if (!subs.has(observer)) {
        subs.add(observer)
        // Cache `hasEffectSub` at sub-add time so the notify hot path is one
        // boolean read instead of a Set walk + bit-AND per sub. The Set
        // already dedupes, but the `has()` guard avoids re-paying the
        // EFFECT bit-test on every read of an already-subscribed observer.
        if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
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
