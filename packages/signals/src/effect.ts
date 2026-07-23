import { SignalCircularError } from './errors.ts'
import { _currentScope, _scopeAdd, _scopeRemove, _setCurrentScope, type ScopeRec } from './scope.ts'
import {
  beginTrack,
  currentObserver,
  DISPOSED,
  EFFECT,
  type Link,
  linkRecycle,
  MERGE,
  pruneDeps,
  RUNNING,
  type Subscriber,
  setCurrentObserver,
} from './signal.ts'

/** @internal — true in dev/test; false in production. Deliberately has NO
 * `typeof process` prefix (unlike signal.ts/computed.ts): the rolldown
 * `define` map replaces `process.env.NODE_ENV` with `"production"`, folding
 * this to a literal `false` so guarded branches (and their warn strings)
 * are fully DCE'd from dist. Source consumers (vitest aliases) run in Node
 * where `process` always exists. */
const __DEV__ = process.env.NODE_ENV !== 'production'

/** The effect body. `onCleanup` registers a callback that runs before the
 * NEXT re-run of this effect and again (if still pending) on dispose —
 * the per-run cleanup primitive for rebinding composables. Zero-arg
 * bodies (`() => void`) remain assignable unchanged.
 *
 * `onCleanup` registers to the CURRENTLY RUNNING effect: it is only valid
 * synchronously during this effect's own run. Stashing the registrar and
 * calling it later (async, or from another computation's run) is misuse —
 * dev builds warn and drop the callback; prod behavior is undefined. */
export type EffectFn = (onCleanup: (fn: () => void) => void) => void
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
  trackVer = 0
  fn: EffectFn | null
  /** @internal — per-run cleanup callbacks registered via the shared
   * `registerCleanup` registrar during the current run. `null` when none
   * (NEVER initialized to `[]` — that would be a per-effect allocation).
   * The ONE new field of the effect-scope plan; declared here so the
   * hidden class is stable from birth (shape contract above). Pool reuse
   * resets it to `null`. */
  cleanups: Array<() => void> | null = null

  constructor(fn: EffectFn) {
    this.fn = fn
  }

  notify(): void {
    if (this.flags & DISPOSED) return
    if (this.flags & RUNNING) throw new SignalCircularError()
    runEffect(this)
  }
}

/** @internal — the SINGLE module-level per-run cleanup registrar, passed as
 * the argument to every effect fn (zero per-run closures). During `fn`,
 * `currentObserver` IS the running Effect node (runEffect sets it), so the
 * append target is always correct — including for effects synchronously
 * re-entered from a write site. It registers to the CURRENTLY RUNNING
 * effect only: stashing it and calling from an async continuation or a
 * foreign computation's run is misuse — dev builds warn and drop the
 * callback (guard below); prod keeps the unguarded hot path (a null/
 * foreign observer is undefined behavior there). */
function registerCleanup(fn: () => void): void {
  if (__DEV__ && (currentObserver === null || !(currentObserver.flags & EFFECT))) {
    console.warn(
      '[aihu/signals] onCleanup called outside an effect run — the cleanup was not registered',
    )
    return
  }
  const node = currentObserver as Effect
  const list = node.cleanups
  if (list === null) node.cleanups = [fn]
  else list.push(fn)
}

/** @internal — run and clear pending per-run cleanups (registration order).
 * Nulls the field FIRST so the drain is idempotent: on self-dispose-mid-run
 * the dispose() call drains, and the post-run path sees `null` and skips.
 * Throw policy matches EffectScope.stop(): every cleanup runs even if an
 * earlier one throws; the first error is rethrown after the loop. */
function drainCleanups(node: Effect): void {
  const list = node.cleanups as Array<() => void>
  node.cleanups = null
  let thrown = false
  let firstErr: unknown
  for (let i = 0; i < list.length; i++) {
    try {
      ;(list[i] as () => void)()
    } catch (err) {
      if (!thrown) {
        thrown = true
        firstErr = err
      }
    }
  }
  if (thrown) throw firstErr
}

function runEffect(node: Effect): void {
  node.flags |= RUNNING
  const prev = setCurrentObserver(node)
  // P0-1 (effect-scope plan §1): this core is synchronous push — an
  // unbatched write drains the effect queue inline at the write site, so a
  // foreign effect can re-run synchronously while some scope is current
  // (e.g. a signal write during a scoped setup()). Any effect/computed
  // created inside that re-run must NOT be adopted by the write-site scope,
  // so the current scope is cleared for the duration of the run — exactly
  // parallel to setCurrentObserver above. Guarded so the no-scope path
  // costs one null compare.
  const hadScope = _currentScope !== null
  const prevScope = hadScope ? _setCurrentScope(null) : null
  try {
    const fn = node.fn
    if (fn !== null) {
      // Per-run cleanup: drain callbacks registered by the previous run
      // before re-tracking (one null check on the no-cleanup path).
      if (node.cleanups !== null) drainCleanups(node)
      beginTrack(node)
      fn(registerCleanup)
      // Self-dispose mid-run: dispose() already unlinked the deps read so
      // far, but reads AFTER the dispose() call re-linked fresh edges onto
      // the dead node. Poison trackVer so the prune below drops them all.
      // Also drain cleanups registered AFTER the self-dispose (the dispose
      // drain ran before they existed — without this they'd be silently
      // dropped). Drain BEFORE poisoning: a signal read inside a drained
      // cleanup links edges stamped with the old trackVer, which the
      // poisoned prune then drops; draining after would stamp them
      // seen === -1 === trackVer and leak the edge.
      if (node.flags & DISPOSED) {
        if (node.cleanups !== null) drainCleanups(node)
        node.trackVer = -1
      }
      // Success only: drop dep edges not re-read by this run (dynamic
      // dependency pruning). A throwing run keeps its old edges.
      pruneDeps(node)
    }
  } finally {
    setCurrentObserver(prev)
    if (hadScope) _setCurrentScope(prevScope)
    node.flags &= ~RUNNING
  }
}

/**
 * Run `fn` immediately and re-run it whenever a signal it read changes.
 * Returns a dispose handle. When an {@link effectScope} is current at the
 * CREATION site, the handle is registered with it and `stop()` disposes
 * the effect automatically.
 *
 * Ownership caveat (P0-1): the current scope is cleared for the duration
 * of EVERY effect run — including this effect's own first run — because a
 * run may be a synchronously re-entered foreign effect at a write site,
 * and the two cases are indistinguishable. Anything created INSIDE the
 * effect body (a lazily-created nested effect/computed) is therefore
 * unowned: dispose it yourself, e.g. `onCleanup(innerDispose)`.
 */
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
    // Per-run cleanup: a prior lifecycle can leave residue only in the
    // degenerate register-after-self-dispose case (dispose() drains and
    // nulls on every normal path) — reset so a recycled node never fires
    // stale cleanups.
    node.cleanups = null
  } else {
    node = new Effect(fn)
  }
  let disposed = false
  let rec: ScopeRec | null = null
  const dispose = () => {
    if (disposed) return
    disposed = true
    // Closure-local `disposed` flag is the only guard needed: a node
    // enters `pool` only inside this same closure's body, so a recycled
    // node cannot re-enter this closure with `disposed === false`.
    // Per spec-6.2-phase3.md §13.4: `disposed` MUST stay closure-local —
    // promoting to an instance field would break pool-reuse correctness
    // (a recycled instance would carry `disposed === true` from the prior
    // lifecycle).
    //
    // Scope back-pointer (effect-scope plan §1, scope-list-growth
    // mitigation): a manual dispose swap-removes this handle's entry from
    // its owning scope's list; during scope.stop() the removal is a no-op
    // (the stop drain owns the list). Lives on the handle wrapper — NEVER
    // a new field on the pooled Effect node.
    if (rec !== null) {
      _scopeRemove(rec)
      rec = null
    }
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
    // Per-run cleanup drain — BEFORE fn-null and pool push so a pending
    // cleanup never observes a recycled node. drainCleanups nulls the
    // field first (idempotent), runs every callback, rethrows the first
    // error after the loop; on throw this node forfeits pool reuse
    // (harmless — it is fully unlinked and DISPOSED).
    if (node.cleanups !== null) drainCleanups(node)
    node.fn = null
    // RUNNING gate: a self-dispose-mid-run must NOT pool the node — it is
    // still the executing node, and a same-run `effect()` would pop it,
    // reset its flags (erasing DISPOSED, so the outer run's trackVer
    // poison never fires), and cross-wire two lifecycles onto one node.
    // A mid-run-disposed node simply forfeits pooling (GC'd). One bit-test
    // on the cold dispose path.
    if (!(node.flags & RUNNING) && pool.length < MAX_POOL) pool.push(node)
  }
  // Scope registration (guarded — no scope active ⇒ path unchanged): the
  // scope stores the dispose HANDLE, never the pooled node. Registered
  // BEFORE the first run so a first-run throw's dispose() also removes
  // the entry; the first run itself cannot re-enter the scope (P0-1
  // clears it for the duration of runEffect).
  if (_currentScope !== null) rec = _scopeAdd(dispose)
  // First-run cleanup: if the initial synchronous run throws, the caller
  // never receives the dispose handle, so any dep edges linked before the
  // throw would keep the broken effect subscribed forever (every later
  // signal write would re-run the throwing fn at the write site). Dispose
  // the node before propagating so the throw leaves no live subscription.
  // A cleanup that throws during this recovery dispose is swallowed: the
  // caller must receive the ORIGINAL fn error, never a masking cleanup
  // error (dispose still completed — drainCleanups runs every callback
  // before rethrowing, and the rethrow is what we drop here).
  try {
    runEffect(node)
  } catch (err) {
    try {
      dispose()
    } catch {
      /* swallowed — the original fn error below must not be masked */
    }
    throw err
  }
  return dispose
}
