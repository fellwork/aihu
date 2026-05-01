import { SignalCircularError } from './errors.ts'
import { DISPOSED, EFFECT, MERGE, type MergeSubscriber, RUNNING, setCurrentObserver } from './signal.ts'

export type EffectFn = () => void
export type Dispose = () => void

// ───────── Effect node pool (parent §9.5; §6.2 Team-Lead override) ─────────
//
// Short-lived effects (test fixtures, arbor remounts) re-allocate the
// Subscriber node + closures on every call. The pool retains disposed
// nodes and reuses them on the next `effect()` call. The closure
// captured by `notify`/`run` is bound via `node.fn` (set fresh per
// reuse). Each dispose closure carries its own `disposed` flag so a
// late dispose() of a recycled node is a no-op for the new effect.
//
// Pool size cap: small constant to avoid retaining unbounded memory in
// long-running apps. The cap is informed by typical arbor remount
// burst size; 8 is enough to absorb a typical mount/unmount pulse
// without re-allocating.

const MAX_POOL = 8
const pool: EffectNode[] = []

interface EffectNode extends MergeSubscriber {
  fn: EffectFn | null
}

function runEffect(node: EffectNode): void {
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
  let node: EffectNode
  if (reused !== undefined) {
    node = reused
    // Reset state for reuse. subsHead/subsTail of an effect are always
    // null (effects are leaves of the dep direction); depsHead/depsTail
    // were nulled by the prior dispose's inlined dep-unlink loop.
    // H5: keep MERGE bit set so the slot stays SMI-typed across pool reuse.
    node.flags = EFFECT | MERGE
    // H5 site E: stable SMI sentinel (was Number.NaN, which forced a
    // Double-typed slot). `0` cannot collide with a live wave because
    // `wave` starts at 0 and is incremented BEFORE markOne is called.
    node.lastWave = 0
    node.fn = fn
  } else {
    node = {
      // H5 MERGE-2: effects are constructed Merge so lastWave is in the
      // hidden class from birth.
      flags: EFFECT | MERGE,
      subsHead: null,
      subsTail: null,
      depsHead: null,
      depsTail: null,
      lastWave: 0,
      fn,
      notify() {
        if (node.flags & DISPOSED) return
        if (node.flags & RUNNING) throw new SignalCircularError()
        runEffect(node)
      },
    }
  }
  runEffect(node)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    // Closure-local `disposed` flag is the only guard needed: a node
    // enters `pool` only inside this same closure's body, so a recycled
    // node cannot re-enter this closure with `disposed === false`.
    node.flags |= DISPOSED
    // Inlined unlinkAllDeps (single call site): splice every edge that
    // `node` reads out of each dep's subs list, then null deps pointers.
    for (let l = node.depsHead; l !== null; ) {
      const next = l.nextDep
      if (l.prevSub) l.prevSub.nextSub = l.nextSub
      else l.dep.subsHead = l.nextSub
      if (l.nextSub) l.nextSub.prevSub = l.prevSub
      else l.dep.subsTail = l.prevSub
      l = next
    }
    node.depsHead = null
    node.depsTail = null
    node.fn = null
    if (pool.length < MAX_POOL) pool.push(node)
  }
}
