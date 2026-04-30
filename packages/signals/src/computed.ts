import { SignalCircularError } from './errors.ts'
import {
  __HOST,
  DISPOSED,
  EFFECT,
  HAS_COMPUTED_DEPS,
  type Link,
  linkAdd,
  MARKED,
  peekCurrentObserver,
  PENDING,
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
  // let downstream readers pull via STALE.
  let hasEffectSub = false

  const recompute = (): T => {
    node.flags |= RUNNING
    const prevObserver = setCurrentObserver(node)
    try {
      return fn()
    } finally {
      setCurrentObserver(prevObserver)
      node.flags &= ~(RUNNING | STALE | MARKED | PENDING)
    }
  }

  const node: Subscriber = {
    flags: STALE,
    subsHead: null,
    subsTail: null,
    depsHead: null,
    depsTail: null,
    notify() {
      if (node.flags & DISPOSED) return
      if (node.flags & RUNNING) throw new SignalCircularError()
    },
    recomputeIfNeeded() {
      if (node.flags & DISPOSED) return
      if (!hasEffectSub) return
      if (!(node.flags & (STALE | PENDING))) return
      if (node.subsHead === null) return
      const hadCache = hasCached
      const prev = cached
      const next = recompute()
      cached = next
      hasCached = true
      if (hadCache && equals !== false && equals(prev, next)) {
        shallowClear(node.subsHead)
        return
      }
      // Re-assert MARKED on direct subs (linked-list walk).
      for (let l: Link | null = node.subsHead; l !== null; l = l.nextSub) {
        const sub = l.sub
        if (sub.flags & DISPOSED) continue
        if (sub.flags & EFFECT) sub.flags |= MARKED
        else sub.flags |= STALE | MARKED
      }
    },
  }

  const read: Read<T> & { [__HOST]?: Subscriber } = () => {
    if (node.flags & RUNNING) throw new SignalCircularError()
    const observer = peekCurrentObserver()
    if (observer !== null) {
      const added = linkAdd(node, observer)
      if (added) {
        if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
        // Computed-observer reading a computed source: mark observer as
        // having computed deps so markOne's restricted leaf fast path
        // skips it forever (parent spec §3 sufficiency invariant).
        else if (observer.recomputeIfNeeded !== undefined) observer.flags |= HAS_COMPUTED_DEPS
      }
    }
    if (!hasCached || node.flags & (STALE | PENDING)) {
      cached = recompute()
      hasCached = true
    }
    return cached
  }
  read[__HOST] = node

  return read
}
