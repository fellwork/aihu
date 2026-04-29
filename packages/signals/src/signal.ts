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

/** @internal */
export interface Subscriber {
  notify(): void
  /** @internal */ flags: number
  /** @internal — head of the forward (subscriber-direction) list. */
  subsHead: Link | null
  /** @internal */ subsTail: Link | null
  /** @internal — head of the back-edge (dependency-direction) list. */
  depsHead: Link | null
  /** @internal */ depsTail: Link | null
  /** @internal */ recomputeIfNeeded?(): void
  /** @internal — set to current wave when this sub is reached during marking; replaces the NOTIFIED bit. */
  lastWave?: number
}

/** @internal */ export const RUNNING = 0x1
/** @internal */ export const DISPOSED = 0x2
/** @internal */ export const QUEUED = 0x4
/** @internal */ export const STALE = 0x8
/** @internal */ export const EFFECT = 0x10
/** @internal */ export const MARKED = 0x20
/**
 * @internal — set on a computed observer the first time it reads another
 * computed during its body. One-way (once true, stays true). Used by
 * markOne's restricted leaf fast path to confirm the computed has only
 * source-signal deps (sufficient, not necessary, for the inline-recompute
 * correctness invariant — see wide-fanout-recovery-v2-spec.md §3).
 */
/** @internal */ export const HAS_COMPUTED_DEPS = 0x80

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

/** @internal — splice every edge that `node` reads (its depsHead..depsTail)
 * out of each dep's subs list. Used by effect dispose (§6.3 ACCEPTED).
 * After this call, node.depsHead and depsTail are null. */
export function unlinkAllDeps(node: Subscriber): void {
  for (let l = node.depsHead; l !== null; ) {
    const next = l.nextDep
    // Splice from dep.subs list.
    if (l.prevSub) l.prevSub.nextSub = l.nextSub
    else l.dep.subsHead = l.nextSub
    if (l.nextSub) l.nextSub.prevSub = l.prevSub
    else l.dep.subsTail = l.prevSub
    l = next
  }
  node.depsHead = null
  node.depsTail = null
}

// ───────── Mark / settle / drain pipeline ─────────

/** @internal — mark one sub with wave-counter dedup; iteratively walk
 * computed subs.
 *
 * Iterative DFS over the dep→sub graph using an explicit work stack
 * (heap-allocated) to bound JS stack depth at O(1) regardless of dep-
 * chain length. Pre-order traversal matches the prior recursive shape
 * exactly so the order of pushes into `visited` / `effectQueue` is
 * preserved — the cellx 4×4 and effect-dedup tests assert exact run
 * counts that depend on settle order.
 *
 * Each work-stack entry is a `Subscriber` whose interpretation is
 * disambiguated by its slot in a parallel `markKindStack`:
 *   - MARK_KIND_MARK      — enter the sub: dedup, mark, push children
 *                            in reverse list order (LIFO pop yields
 *                            the same forward `nextSub` traversal as
 *                            the recursive `for (l = head; l; …)`).
 *   - MARK_KIND_RECOMPUTE — post-action used by the restricted-leaf
 *                            fast path: after the lone effect child
 *                            is marked, call the parent's
 *                            `recomputeIfNeeded` inline (parent spec
 *                            §3 sufficiency invariant — same behavior
 *                            as the recursive version's
 *                            `sub.recomputeIfNeeded?.()` immediately
 *                            after the recursive call).
 *
 * Two parallel arrays of primitives (Subscriber refs and a number)
 * avoid per-frame object allocation on the hot path. */
const markStackSubs: Subscriber[] = []
const markStackKinds: number[] = []
const MARK_KIND_MARK = 0
const MARK_KIND_RECOMPUTE = 1

function markOne(root: Subscriber): void {
  // Watermark for re-entrant safety: a recompute fired inline by the
  // restricted-leaf fast path can synchronously trigger another signal
  // write → propagateMark → markOne. Each call drains only the frames
  // it pushed, leaving outer-call frames untouched on the shared
  // module arrays.
  const baseLen = markStackSubs.length
  markStackSubs.push(root)
  markStackKinds.push(MARK_KIND_MARK)
  try {
    while (markStackSubs.length > baseLen) {
      const sub = markStackSubs.pop() as Subscriber
      const kind = markStackKinds.pop() as number
      if (kind === MARK_KIND_RECOMPUTE) {
        sub.recomputeIfNeeded?.()
        continue
      }
      if (sub.flags & DISPOSED) continue
      if (sub.lastWave === wave) continue
      if (sub.flags & RUNNING) throw new SignalCircularError()
      sub.lastWave = wave
      sub.flags |= MARKED
      if (sub.flags & EFFECT) {
        effectQueue.push(sub)
        continue
      }
      visited.push(sub)
      sub.flags |= STALE
      const head = sub.subsHead
      if (head === null) continue
      // Restricted leaf fast path: a confirmed source-only computed
      // (HAS_COMPUTED_DEPS unset) with exactly one effect sub settles
      // inline during marking. Single-edge case: head.nextSub === null.
      // Iteratively: push the post-action recompute first, then the
      // child mark — LIFO popping fires the child mark before the
      // recompute, mirroring the recursive
      // `markOne(head.sub); sub.recomputeIfNeeded?.()` sequence.
      if (head.nextSub === null && !(sub.flags & HAS_COMPUTED_DEPS) && head.sub.flags & EFFECT) {
        markStackSubs.push(sub)
        markStackKinds.push(MARK_KIND_RECOMPUTE)
        markStackSubs.push(head.sub)
        markStackKinds.push(MARK_KIND_MARK)
        continue
      }
      // General forward-walk fan-out: push children in reverse list
      // order (tail → head via prevSub) so LIFO popping yields the
      // same nextSub-forward pre-order as the recursive walk. The
      // list is doubly-linked and `sub` is the dep that owns it, so
      // `sub.subsTail` is the live tail.
      for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
        markStackSubs.push(l.sub)
        markStackKinds.push(MARK_KIND_MARK)
      }
    }
  } catch (e) {
    // On error (e.g. SignalCircularError) drain only the frames this
    // call pushed so outer markOne invocations keep their pending
    // work intact. clearVisited() in the caller's finally block
    // handles per-sub flag reset.
    markStackSubs.length = baseLen
    markStackKinds.length = baseLen
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

/** @internal — clear MARKED across visited; reset to recoverable state. */
function clearVisited(): void {
  for (const sub of visited) sub.flags &= ~MARKED
  visited.length = 0
  for (const sub of effectQueue) sub.flags &= ~MARKED
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
export type Write<T> = (next: T | ((prev: T) => T)) => void
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
  const host: Subscriber = {
    flags: 0,
    subsHead: null,
    subsTail: null,
    depsHead: null,
    depsTail: null,
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
export const __HOST: unique symbol = Symbol('scribe.signals.host')

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
