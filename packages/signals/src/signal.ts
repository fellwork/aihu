import { SignalCircularError } from './errors.ts'

/** @internal — node in the doubly-linked dep graph (Phase 2 / parent §9.4).
 * Each Link records one (dep, sub) edge. The same Link object is threaded
 * into two doubly-linked lists: dep.subsHead..subsTail (forward edges)
 * and sub.depsHead..depsTail (back edges). Walks are pure pointer chases
 * with no iterator allocation; unlinks are O(1).
 *
 * Implementation note: the Link is created by linkAdd in computed.read /
 * signal.read with a wave-counter dedup hint to avoid re-walking long
 * deps lists on tight reads. */
export interface Link {
  dep: Subscriber
  sub: Subscriber
  prevSub: Link | null
  nextSub: Link | null
  prevDep: Link | null
  nextDep: Link | null
}

/** @internal — base shape (Linear). No `lastWave` slot — Linear nodes
 * never read or write it. See spec-6.2-phase2-h5.md §8. */
export interface LinearSubscriber {
  notify(): void
  /** @internal */ flags: number
  /** @internal — head of the forward (subscriber-direction) list. */
  subsHead: Link | null
  /** @internal */ subsTail: Link | null
  /** @internal — head of the back-edge (dependency-direction) list. */
  depsHead: Link | null
  /** @internal */ depsTail: Link | null
  /** @internal */ recomputeIfNeeded?(): void
}

/** @internal — fan-in shape. SMI `lastWave` slot present from construction
 * (initialised to 0). Discriminated from Linear via `(flags & MERGE)`. */
export interface MergeSubscriber extends LinearSubscriber {
  /** @internal — set to current wave when this sub is reached during marking;
   * replaces the NOTIFIED bit. SMI to keep the slot off the HeapNumber path. */
  lastWave: number
}

/** @internal */
export type Subscriber = LinearSubscriber | MergeSubscriber

/** @internal */ export const RUNNING          = 0x001
/** @internal */ export const DISPOSED         = 0x002
/** @internal */ export const QUEUED           = 0x004
/** @internal */ export const STALE            = 0x008
/** @internal */ export const EFFECT           = 0x010
/** @internal */ export const MARKED           = 0x020
/** @internal — H5: set on signals/effects at construction; lazy upgrade
 * for computeds inside linkAdd on the second inbound dep edge. Once set,
 * never cleared (one-way classifier). Gates the dedup path. */
/** @internal */ export const MERGE             = 0x040
/** @internal — Option D: set on a linear-path computed during mark. Means
 * "potentially dirty; run checkDirty at effect-drain time before recomputing."
 * Not set on fan-out nodes (those take the STALE path unchanged). */
/** @internal */ export const PENDING          = 0x100

/** @internal */
let currentObserver: Subscriber | null = null

/** @internal */
export function setCurrentObserver(next: Subscriber | null): Subscriber | null {
  const prev = currentObserver
  currentObserver = next
  return prev
}

/** @internal */
export function peekCurrentObserver(): Subscriber | null {
  return currentObserver
}

/**
 * Cap on `drainBatch` re-iteration count before throwing
 * `SignalCircularError`. Each iteration corresponds to a wave of
 * effects that wrote signals, re-queueing more subscribers. Exposed for
 * tooling that wants to sanity-check whether a legitimate cascade is
 * approaching the cap; not a runtime knob.
 */
export const MAX_BATCH_ITERATIONS = 100

/** @internal */ let batchDepth = 0
/** @internal */ const batchQueue: Subscriber[] = []
const visited: Subscriber[] = []
const effectQueue: Subscriber[] = []
/**
 * @internal — monotonic wave counter. Incremented at the start of every
 * top-level signal write and at every drainBatch iteration. Subscribers
 * record their `lastWave` at mark time; later mark attempts in the same
 * wave dedup via `sub.lastWave === wave`. Replaces the NOTIFIED bit
 * (saves 6 per-wave bit-clear iteration sites in signal.ts).
 */
let wave = 0

/** @internal */
export function getBatchDepth(): number {
  return batchDepth
}

/** @internal */
export function enterBatch(): void {
  batchDepth++
}

/** @internal */
export function exitBatch(): void {
  batchDepth--
}

// ───────── Linked-list dep graph (Phase 2 / parent §9.4) ─────────

/** @internal — append an edge dep→sub to the graph if not already present.
 * O(D) dedup walk over sub's deps list (D ≤ 4 in cellx; ≤ 1 in
 * wide-fanout). Returns true if a fresh Link was added, false if an
 * edge dep→sub already existed. */
export function linkAdd(dep: Subscriber, sub: Subscriber): boolean {
  // Dedup: walk sub's back-edge list looking for an existing edge to dep.
  // The "last linked" optimisation (spec §2 Phase 2) keeps the most
  // recent dep at depsTail; many computeds re-read the same dep
  // consecutively, so walking from tail catches the common case at
  // O(1) most of the time.
  for (let l = sub.depsTail; l !== null; l = l.prevDep) {
    if (l.dep === dep) return false
  }
  // H5 MERGE-1: promote sub from Linear to Merge on its 2nd inbound dep.
  // Idempotent — re-setting on an already-Merge sub is a no-op. Must run
  // BEFORE append (depsHead non-null means a 2nd or later edge).
  if (sub.depsHead !== null) sub.flags |= MERGE
  const link: Link = {
    dep,
    sub,
    prevSub: dep.subsTail,
    nextSub: null,
    prevDep: sub.depsTail,
    nextDep: null,
  }
  // Splice into dep.subs list (tail-append).
  if (dep.subsTail) dep.subsTail.nextSub = link
  else dep.subsHead = link
  dep.subsTail = link
  // Splice into sub.deps list (tail-append).
  if (sub.depsTail) sub.depsTail.nextDep = link
  else sub.depsHead = link
  sub.depsTail = link
  return true
}

/** @internal — remove `link` from both its dep.subs list and sub.deps list. */
export function linkUnlink(link: Link): void {
  // dep.subs splice
  if (link.prevSub) link.prevSub.nextSub = link.nextSub
  else link.dep.subsHead = link.nextSub
  if (link.nextSub) link.nextSub.prevSub = link.prevSub
  else link.dep.subsTail = link.prevSub
  // sub.deps splice
  if (link.prevDep) link.prevDep.nextDep = link.nextDep
  else link.sub.depsHead = link.nextDep
  if (link.nextDep) link.nextDep.prevDep = link.prevDep
  else link.sub.depsTail = link.prevDep
}

// ───────── Mark / settle / drain pipeline ─────────

/** @internal — mark one sub with wave-counter dedup; iteratively walk
 * computed subs.
 *
 * Iterative DFS over the dep→sub graph using an explicit work stack
 * (heap-allocated) to bound JS stack depth at O(1) regardless of dep-
 * chain length.
 *
 * Option D hybrid linear/fan-out mark:
 *   - Linear path (head.nextSub === null): set PENDING on the computed,
 *     do NOT push to visited[], do NOT set STALE. Lazy — checkDirty
 *     will confirm dirtiness at effect-drain time.
 *   - Fan-out path (head.nextSub !== null): set STALE + push to visited[]
 *     (existing eager mark, unchanged from pre-Option-D). */
const markStack: Subscriber[] = []

function markOne(root: Subscriber): void {
  // H4 tail-recursive linear chase (spec-6.2-phase2.md §3 / §6). Linear-path
  // hops never enter markStack; only fan-out frontiers do. Mirrors
  // alien-signals system.mjs:95 `top:` label structure.
  // Invariants: DI-1 (dedup at top), CS-1 (PENDING on every visited sub),
  // SF-1 (STALE coexists with PENDING on fan-out exit), RC-1 unchanged.
  // Phase-1 fan-out semantics (no PENDING on fan-out nodes) are preserved by
  // splitting the dedup gate: outer-popped nodes get only MARKED, inner-chase
  // visits get MARKED | PENDING.
  const baseLen = markStack.length
  let sub: Subscriber = root
  let isChase = false
  try {
    // biome-ignore lint/suspicious/noConstantCondition: loop exits via break.
    while (true) {
      // H5 site A + chase-inner: dedup gate is type-guarded on MERGE.
      // Linear subs (≤1 inbound dep) skip both the read and the write —
      // DI-1 is vacuously satisfied (exactly one inbound mark per wave).
      if (!(sub.flags & DISPOSED) && (!(sub.flags & MERGE) || (sub as MergeSubscriber).lastWave !== wave)) {
        if (sub.flags & RUNNING) throw new SignalCircularError()
        if (sub.flags & MERGE) (sub as MergeSubscriber).lastWave = wave
        sub.flags |= isChase ? MARKED | PENDING : MARKED       // CS-1 stamp
        if (sub.flags & EFFECT) {
          effectQueue.push(sub)
        } else {
          const head = sub.subsHead
          if (head === null) {
            sub.flags |= STALE                                 // leaf
          } else if (head.nextSub !== null) {
            visited.push(sub)                                  // fan-out (SF-1)
            sub.flags |= STALE
            for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
              markStack.push(l.sub)
            }
          } else {
            // Linear path: inline-chase without touching markStack.
            if (!isChase) sub.flags |= PENDING                 // promote outer→chase
            sub = head.sub
            isChase = true
            continue
          }
        }
      }
      if (markStack.length <= baseLen) break
      sub = markStack.pop() as Subscriber
      isChase = false
    }
  } catch (e) {
    markStack.length = baseLen
    throw e
  }
}

/** @internal — phase-1 mark entry from signal.write. Walks the linked
 * sub list of a dep. */
export function propagateMark(head: Link | null): void {
  for (let l = head; l !== null; l = l.nextSub) markOne(l.sub)
}

/**
 * @internal — equality short-circuit (spec §2.6 / Phase 2 Finding 3).
 * Clears MARKED on direct effect subs (drain skips) and STALE+MARKED on
 * direct computed subs (their settle becomes a no-op).
 */
export function shallowClear(head: Link | null): void {
  for (let l = head; l !== null; l = l.nextSub) {
    const sub = l.sub
    if (sub.flags & EFFECT) sub.flags &= ~MARKED
    else sub.flags &= ~(STALE | MARKED)
  }
}

/** @internal — Option D pull-based dirtiness check for PENDING nodes.
 * Iteratively walks the dep chain of `root` backward through PENDING
 * computeds until a definitively dirty source (STALE dep, or signal
 * written in current wave) is found, or all paths are clean.
 * Clears PENDING eagerly on the false path.
 * Returns true if the effect should run; false if the chain is clean. */
function checkDirty(root: Subscriber): boolean {
  const stack: Subscriber[] = [root]
  while (stack.length > 0) {
    const node = stack.pop() as Subscriber
    for (let l = node.depsHead; l !== null; l = l.nextDep) {
      const dep = l.dep
      if (dep.flags & STALE) return true
      if (dep.flags & PENDING) {
        // Do NOT clear PENDING here — the settle step in drainEffectQueue
        // needs PENDING to be set so recomputeIfNeeded runs and cascade
        // suppression (shallowClear) can fire. PENDING is cleared by
        // recompute() when the node is actually recomputed.
        stack.push(dep)
        continue
      }
      // Signal source: dirty if written in the current wave.
      // Site D — signal hosts are constructed Merge (MERGE-2), so the field is present;
      // defensive MERGE guard narrows to MergeSubscriber for type safety.
      if (dep.recomputeIfNeeded === undefined && (dep.flags & MERGE) && (dep as MergeSubscriber).lastWave === wave) return true
    }
  }
  return false
}

/**
 * @internal — drain effectQueue, isolating user-thrown errors. Each
 * effect's `notify()` is wrapped in try/catch so a single thrown effect
 * does not strand its siblings; thrown errors accumulate in `errors` and
 * are surfaced by `_throwEffectErrors` after the wave completes.
 */
function drainEffectQueue(errors: unknown[]): void {
  for (const sub of effectQueue) {
    if (sub.flags & DISPOSED) continue
    if (!(sub.flags & MARKED)) continue
    // Option D: if effect arrived via lazy linear path, verify dirtiness.
    if (sub.flags & PENDING) {
      sub.flags &= ~PENDING
      if (!checkDirty(sub)) {
        sub.flags &= ~MARKED
        continue   // chain is clean — skip effect body
      }
      // Settle PENDING direct deps so equality-suppression (shallowClear) can
      // clear MARKED on this effect before we check it below.
      for (let l = sub.depsHead; l !== null; l = l.nextDep) {
        if (l.dep.flags & (STALE | PENDING)) l.dep.recomputeIfNeeded?.()
      }
      if (!(sub.flags & MARKED)) continue   // shallowClear suppressed cascade
    }
    sub.flags &= ~MARKED
    try {
      sub.notify()
    } catch (e) {
      errors.push(e)
    }
  }
  effectQueue.length = 0
}

/**
 * @internal — surface accumulated effect errors. Single error throws
 * directly (preserving stack); multiple errors throw as AggregateError.
 * Computed-body throws bypass this path entirely (they fail fast).
 */
function throwEffectErrors(errors: unknown[]): void {
  if (errors.length === 0) return
  if (errors.length === 1) throw errors[0]
  throw new AggregateError(errors, 'multiple effects threw during drain')
}

/**
 * @internal — phase 2 settle + phase 3 effect drain. Computeds with
 * effect subs eagerly recompute (running their equality check); effects
 * whose MARKED bit survived run in mark order.
 */
function settleAndDrain(): void {
  for (const sub of visited) sub.recomputeIfNeeded?.()
  const errors: unknown[] = []
  drainEffectQueue(errors)
  throwEffectErrors(errors)
}

/** @internal — clear MARKED (and PENDING for effects) across visited;
 * reset to recoverable state after a wave completes or aborts. */
function clearVisited(): void {
  for (const sub of visited) sub.flags &= ~(MARKED | PENDING)
  visited.length = 0
  for (const sub of effectQueue) sub.flags &= ~(MARKED | PENDING)
  effectQueue.length = 0
}

/**
 * @internal — drain the batch queue. Each iteration: pull queued subs
 * through mark + settle + run. New subs may be appended (effect write
 * during flush); re-iteration handles them. MAX_BATCH_ITERATIONS guards
 * pathological cycles.
 */
export function drainBatch(): void {
  let iterations = 0
  const errors: unknown[] = []
  try {
    while (batchQueue.length > 0) {
      if (++iterations > MAX_BATCH_ITERATIONS) {
        for (const sub of batchQueue) sub.flags &= ~QUEUED
        batchQueue.length = 0
        throw new SignalCircularError()
      }
      wave++
      const drainList = batchQueue.splice(0)
      for (const sub of drainList) {
        sub.flags &= ~QUEUED
        // Patch signal lastWave for checkDirty: walk the sub's deps and
        // set lastWave = wave on any signal source (recomputeIfNeeded ===
        // undefined) that was written this batch but hasn't been stamped yet.
        for (let l = sub.depsHead; l !== null; l = l.nextDep) {
          // Site C — signal hosts are constructed Merge (MERGE-2); the
          // defensive MERGE guard narrows to MergeSubscriber for type safety.
          const dep = l.dep
          if (dep.recomputeIfNeeded === undefined && (dep.flags & MERGE)) {
            const m = dep as MergeSubscriber
            if (m.lastWave !== wave) m.lastWave = wave
          }
        }
        markOne(sub)
      }
      for (const sub of visited) sub.recomputeIfNeeded?.()
      drainEffectQueue(errors)
      visited.length = 0
    }
  } finally {
    clearVisited()
    for (const sub of batchQueue) sub.flags &= ~QUEUED
    batchQueue.length = 0
  }
  throwEffectErrors(errors)
}

/** @internal */
function enqueueIfNeeded(sub: Subscriber): void {
  if (sub.flags & QUEUED) return
  sub.flags |= QUEUED
  batchQueue.push(sub)
}

export type Read<T> = () => T
/**
 * Write a new value or apply an updater function. The runtime
 * distinguishes by `typeof next === 'function'`, so a raw function value
 * cannot be stored without ambiguity.
 *
 * The `Exclude<U, AnyFn> & T` constraint refuses any function-typed
 * raw write at compile time when `T` itself is a function: callers of
 * `Signal<() => X>` MUST use the updater form `setX(() => () => X)`.
 * For non-function `T` the constraint is a no-op (`Exclude<U, AnyFn>`
 * is `U`). `AnyFn` is `(...args: never) => unknown` rather than the
 * banned `Function` type so the lint is silent without an inline
 * suppression — both produce identical Exclude behavior under TS's
 * structural function compatibility rules.
 *
 * Mirrors SolidJS's `Setter<T>` shape; chosen for zero runtime cost and
 * no compiler-emit changes. See `.team/phase-2/spec-signals-write-of-functions.md`.
 */
type AnyFn = (...args: never) => unknown
export type Write<T> = <U extends T>(next: (Exclude<U, AnyFn> & T) | ((prev: T) => U)) => void
export type Signal<T> = readonly [Read<T>, Write<T>]

export interface SignalOptions<T> {
  /**
   * Equality comparator applied to writes.
   * - Omitted → default `Object.is`.
   * - `false` → never short-circuit; every write notifies.
   * - Function → custom comparator; `true` means "equal, skip".
   */
  equals?: ((a: T, b: T) => boolean) | false
}

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  let value = initial
  // Linked-list host: the signal-as-dep needs subsHead/subsTail. We
  // model it as a minimal Subscriber-shaped object with no flags / no
  // notify (the dep is never marked itself; only its subs are). The
  // shape is internal; readers see it only via Link.dep.
  // H5 MERGE-2: signal hosts are constructed Merge so `lastWave` is in
  // the hidden class from birth (no late-write polymorphism).
  const host: MergeSubscriber = {
    flags: MERGE,
    subsHead: null,
    subsTail: null,
    depsHead: null,
    depsTail: null,
    lastWave: 0,
    notify() {},
  }
  const eq = options?.equals
  const equals: ((a: T, b: T) => boolean) | false = eq === undefined ? Object.is : eq

  const read: Read<T> & { [__HOST]?: Subscriber } = () => {
    const obs = currentObserver
    if (obs !== null) linkAdd(host, obs)
    return value
  }
  read[__HOST] = host

  const write: Write<T> = (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : (next as T)
    if (equals !== false && equals(value, resolved)) return
    value = resolved
    const head = host.subsHead
    if (head === null) return
    if (batchDepth > 0) {
      // Single-sub fast path (batched-writes-100 hot case): one sub, no
      // loop, no second pointer chase.
      if (head.nextSub === null) {
        enqueueIfNeeded(head.sub)
        return
      }
      // Multi-sub fan-out: walk the live list. (Effects can dispose
      // themselves mid-flush; the wave counter handles re-enqueue.)
      for (let l: Link | null = head; l !== null; l = l.nextSub) enqueueIfNeeded(l.sub)
      return
    }
    wave++
    host.lastWave = wave   // record write wave for checkDirty signal-source detection
    try {
      propagateMark(head)
      settleAndDrain()
    } finally {
      clearVisited()
    }
  }

  return [read, write] as const
}

// ───────── Test-only graph inspectors (Phase 2 properties) ─────────
//
// Property tests use these helpers to assert the dep↔sub bijection.
// They are not re-exported from index.ts (public surface is bit-
// identical to HEAD). Each `signal()` and `computed()` stamps its
// host Subscriber onto the returned read function via a non-enumerable
// symbol property; tests walk from those roots.

/** @internal — symbol used to attach the host Subscriber to a read fn
 * so property tests can inspect the underlying Link graph. */
export const __HOST: unique symbol = Symbol()

/** @internal — test-only: return the underlying Subscriber host of a
 * signal or computed read function. */
export function __hostOf<T>(read: Read<T>): Subscriber | null {
  const r = read as Read<T> & { [__HOST]?: Subscriber }
  return r[__HOST] ?? null
}

/** @internal — test-only: count outbound edges of a signal or computed. */
export function __countSubs<T>(read: Read<T>): number {
  const host = __hostOf(read)
  if (host === null) return 0
  let count = 0
  for (let l: Link | null = host.subsHead; l !== null; l = l.nextSub) count++
  return count
}

/** @internal — test-only: walk every Link reachable from `roots` (a
 * mix of signal/computed/effect Subscribers) in both directions and
 * verify the dep↔sub bijection plus prev/next chain integrity.
 * Returns { totalEdges, violations }. */
export function __inspectGraph(roots: Subscriber[]): {
  totalEdges: number
  violations: number
} {
  const seenLinks = new Set<Link>()
  let violations = 0
  // BFS-walk the graph: from each root, walk subsHead..subsTail and
  // depsHead..depsTail, collecting every Link.
  const queue: Subscriber[] = [...roots]
  const seenNodes = new Set<Subscriber>()
  while (queue.length > 0) {
    const node = queue.shift() as Subscriber
    if (seenNodes.has(node)) continue
    seenNodes.add(node)
    // Walk subs forward.
    for (let l: Link | null = node.subsHead ?? null; l !== null; l = l.nextSub) {
      seenLinks.add(l)
      if (l.dep !== node) violations++
      queue.push(l.sub)
    }
    // Walk subs backward (must reach subsHead).
    {
      let last: Link | null = null
      for (let l: Link | null = node.subsTail ?? null; l !== null; l = l.prevSub) last = l
      if (last !== (node.subsHead ?? null)) violations++
    }
    // Walk deps forward.
    for (let l: Link | null = node.depsHead ?? null; l !== null; l = l.nextDep) {
      seenLinks.add(l)
      if (l.sub !== node) violations++
      queue.push(l.dep)
    }
    // Walk deps backward (must reach depsHead).
    {
      let last: Link | null = null
      for (let l: Link | null = node.depsTail ?? null; l !== null; l = l.prevDep) last = l
      if (last !== (node.depsHead ?? null)) violations++
    }
  }
  // Bijection: every link must appear in both lists (i.e. its dep.subs
  // chain contains it AND its sub.deps chain contains it).
  for (const link of seenLinks) {
    let foundInSubs = false
    for (let l: Link | null = link.dep.subsHead ?? null; l !== null; l = l.nextSub) {
      if (l === link) {
        foundInSubs = true
        break
      }
    }
    if (!foundInSubs) violations++
    let foundInDeps = false
    for (let l: Link | null = link.sub.depsHead ?? null; l !== null; l = l.nextDep) {
      if (l === link) {
        foundInDeps = true
        break
      }
    }
    if (!foundInDeps) violations++
  }
  return { totalEdges: seenLinks.size, violations }
}
