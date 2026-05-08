import { SignalCircularError } from './errors.ts'
import {
  __HOST,
  currentObserver,
  DISPOSED,
  EFFECT,
  type Link,
  linkAdd,
  linkRecycle,
  linkUnlink,
  MARKED,
  PENDING,
  type Read,
  RUNNING,
  STALE,
  type Subscriber,
  setCurrentObserver,
  shallowClear,
} from './signal.ts'

/** @internal — true in dev/test; false in production (DCE'd by rolldown via
 * the `define` map: `'process.env.NODE_ENV': '"production"'`). */
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

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

/** @internal — K1c+ Computed class (spec-6.2-phase3.md §3.1, §3.4, §5.2).
 *
 * Per K-2: `notify` and `recomputeIfNeeded` live on the prototype, shared
 * across every Computed instance. The H5 per-instance closure literal +
 * factory-local `recompute` closure are gone; their bodies inline directly
 * into the prototype-method bodies (fn-promotion). The 5 captured factory
 * locals (`fn`, `cached`, `hasCached`, `equals`, `hasEffectSub`) are now
 * instance fields.
 *
 * Shape-stability: every Computed carries `lastWave: 0` from birth so the
 * collapsed Subscriber shape monomorphises across all roles. MERGE is NOT
 * pre-set (per MERGE-2 §4.6); `linkAdd` lazy-promotes on the 2nd inbound
 * edge. HOST is NEVER set on Computeds (per K-1 §4.7).
 *
 * RC-1 (§4.4): the `try { fn() } finally { flags &= ~(RUNNING|STALE|MARKED|
 * PENDING) }` block is preserved verbatim inside `recomputeIfNeeded` —
 * neither MERGE nor HOST are in the clear mask. */
class Computed<T> implements Subscriber {
  flags = STALE
  subsHead: Link | null = null
  subsTail: Link | null = null
  depsHead: Link | null = null
  depsTail: Link | null = null
  lastWave = 0
  fn: () => T
  cached: T | undefined = undefined
  hasCached = false
  equals: ((a: T, b: T) => boolean) | false
  hasEffectSub = false

  constructor(fn: () => T, equals: ((a: T, b: T) => boolean) | false) {
    this.fn = fn
    this.equals = equals
  }

  notify(): void {
    if (this.flags & DISPOSED) return
    if (this.flags & RUNNING) throw new SignalCircularError()
  }

  recomputeIfNeeded(): void {
    if (this.flags & DISPOSED) return
    if (!this.hasEffectSub) return
    if (!(this.flags & (STALE | PENDING))) return
    if (this.subsHead === null) return
    const hadCache = this.hasCached
    const prev = this.cached as T
    const next = this.recompute()
    this.cached = next
    this.hasCached = true
    if (hadCache && this.equals !== false && this.equals(prev, next)) {
      shallowClear(this.subsHead)
      return
    }
    // Re-assert MARKED on direct subs (linked-list walk).
    for (let l: Link | null = this.subsHead; l !== null; l = l.nextSub) {
      const sub = l.sub
      if (sub.flags & DISPOSED) continue
      if (sub.flags & EFFECT) sub.flags |= MARKED
      else sub.flags |= STALE | MARKED
    }
  }

  /** @internal — RC-1 try/finally frame (spec-6.2-phase3.md §3.4 / §4.4).
   * Was the H5 factory-local `recompute` closure; now a prototype method
   * to deduplicate the body across `recomputeIfNeeded` (settle path) and
   * `read()` (subscriber path). Adding a third prototype method does NOT
   * fragment the Computed hidden-class chain (V8 emits the prototype
   * once and shares it across all instances). The flags-clear mask is
   * UNCHANGED: `(RUNNING | STALE | MARKED | PENDING)` — neither MERGE
   * nor HOST is cleared. */
  recompute(): T {
    this.flags |= RUNNING
    const prevObserver = setCurrentObserver(this)
    try {
      return this.fn()
    } finally {
      setCurrentObserver(prevObserver)
      this.flags &= ~(RUNNING | STALE | MARKED | PENDING)
    }
  }
}

/**
 * Create a lazy derived value that recomputes only when its reactive
 * dependencies change.
 *
 * The returned read function has an optional `.dispose()` method. Call it
 * to unlink the computed from its source signals and downstream subscribers,
 * allowing it (and its `fn` closure) to be garbage-collected even if source
 * signals remain live.
 */
export function computed<T>(
  fn: () => T,
  options?: ComputedOptions<T>,
): Read<T> & { dispose(): void } {
  const equals: ((a: T, b: T) => boolean) | false = options?.equals ?? Object.is
  const node = new Computed<T>(fn, equals)

  const read: Read<T> & { [__HOST]?: Subscriber; dispose?: () => void } = () => {
    if (node.flags & RUNNING) throw new SignalCircularError()
    const observer = currentObserver
    if (observer !== null) {
      const added = linkAdd(node, observer)
      if (added && (observer.flags & EFFECT) !== 0) node.hasEffectSub = true
    }
    if (!node.hasCached || node.flags & (STALE | PENDING)) {
      node.cached = node.recompute()
      node.hasCached = true
    }
    return node.cached as T
  }

  read.dispose = () => {
    if (node.flags & DISPOSED) return
    node.flags |= DISPOSED
    // Unlink from all source signals (remove this computed from their subs lists)
    for (let l = node.depsHead; l !== null; ) {
      const next = l.nextDep
      // Splice out of dep.subs list
      if (l.prevSub) l.prevSub.nextSub = l.nextSub
      else l.dep.subsHead = l.nextSub
      if (l.nextSub) l.nextSub.prevSub = l.prevSub
      else l.dep.subsTail = l.prevSub
      linkRecycle(l)
      l = next
    }
    node.depsHead = null
    node.depsTail = null
    // Unlink downstream subscribers (computeds/effects that read this computed)
    for (let l = node.subsHead; l !== null; ) {
      const next = l.nextSub
      linkUnlink(l)
      l = next
    }
    node.subsHead = null
    node.subsTail = null
  }

  if (__DEV__) read[__HOST] = node

  return read as Read<T> & { dispose(): void }
}
