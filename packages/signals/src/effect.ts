import { SignalCircularError } from './errors.ts'
import {
  DISPOSED,
  EFFECT,
  type Link,
  linkRecycle,
  MERGE,
  RUNNING,
  type Subscriber,
  setCurrentObserver,
} from './signal.ts'

export type EffectFn = () => void
export type Dispose = () => void

// ───────── Effect node pool (parent §9.5; §6.2 Team-Lead override) ─────────
//
// Short-lived effects (test fixtures, arbor remounts) re-allocate the
// Subscriber node on every call. The pool retains disposed nodes and
// reuses them on the next `effect()` call. The closure captured by
// `notify` lives on the Effect prototype (K1c+ K-2); per-instance
// `fn` is reset on reuse. Each dispose closure carries its own
// `disposed` flag so a late dispose() of a recycled node is a no-op
// for the new effect.
//
// Pool size cap: small constant to avoid retaining unbounded memory in
// long-running apps. The cap is informed by typical arbor remount
// burst size; 8 is enough to absorb a typical mount/unmount pulse
// without re-allocating.

const MAX_POOL = 8
const pool: Effect[] = []

/** @internal — K1c+ Effect class (spec-6.2-phase3.md §3.1, §3.5, §5.3).
 *
 * Per K-2: `notify` lives on the prototype, shared across every Effect
 * instance. The H5 per-instance closure is gone; its body is the
 * prototype-method body. The captured `fn` is now an instance field.
 *
 * Shape-stability: Effects are constructed Merge (per MERGE-2 §4.6) with
 * `lastWave: 0` SMI from birth. HOST is NEVER set on Effects (per K-1
 * §4.7). Pool reuse resets fields but never reassigns `notify` (it is on
 * the prototype, not an own-property — staying on prototype preserves
 * K-2 across recycling). */
class Effect implements Subscriber {
  flags = EFFECT | MERGE
  subsHead: Link | null = null
  subsTail: Link | null = null
  depsHead: Link | null = null
  depsTail: Link | null = null
  lastWave = 0
  fn: EffectFn | null

  constructor(fn: EffectFn) {
    this.fn = fn
  }

  notify(): void {
    if (this.flags & DISPOSED) return
    if (this.flags & RUNNING) throw new SignalCircularError()
    runEffect(this)
  }
}

function runEffect(node: Effect): void {
  node.flags |= RUNNING
  const prev = setCurrentObserver(node)
  try {
    const fn = node.fn
    if (fn !== null) fn()
  } finally {
    setCurrentObserver(prev)
    node.flags &= ~RUNNING
  }
}

export function effect(fn: EffectFn): Dispose {
  const reused = pool.pop()
  let node: Effect
  if (reused !== undefined) {
    node = reused
    // Reset state for reuse. subsHead/subsTail of an effect are always
    // null (effects are leaves of the dep direction); depsHead/depsTail
    // were nulled by the prior dispose's inlined dep-unlink loop.
    // K1c+: keep MERGE bit set so the slot stays SMI-typed across pool
    // reuse; HOST is never set on Effects. `notify` is on the prototype
    // (K-2) — DO NOT reassign here.
    node.flags = EFFECT | MERGE
    // H5 site E: stable SMI sentinel (was Number.NaN, which forced a
    // Double-typed slot). `0` cannot collide with a live wave because
    // `wave` starts at 0 and is incremented BEFORE markOne is called.
    node.lastWave = 0
    node.fn = fn
  } else {
    node = new Effect(fn)
  }
  runEffect(node)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    // Closure-local `disposed` flag is the only guard needed: a node
    // enters `pool` only inside this same closure's body, so a recycled
    // node cannot re-enter this closure with `disposed === false`.
    // Per spec-6.2-phase3.md §13.4: `disposed` MUST stay closure-local —
    // promoting to an instance field would break pool-reuse correctness
    // (a recycled instance would carry `disposed === true` from the prior
    // lifecycle).
    node.flags |= DISPOSED
    // Inlined unlinkAllDeps (single call site): splice every edge that
    // `node` reads out of each dep's subs list, then null deps pointers.
    for (let l = node.depsHead; l !== null; ) {
      const next = l.nextDep
      if (l.prevSub) l.prevSub.nextSub = l.nextSub
      else l.dep.subsHead = l.nextSub
      if (l.nextSub) l.nextSub.prevSub = l.prevSub
      else l.dep.subsTail = l.prevSub
      linkRecycle(l)
      l = next
    }
    node.depsHead = null
    node.depsTail = null
    node.fn = null
    if (pool.length < MAX_POOL) pool.push(node)
  }
}
