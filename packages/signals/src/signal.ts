import { SignalCircularError } from './errors.ts'

/** @internal */
export interface Subscriber {
  notify(): void
  /** @internal */ flags: number
  /** @internal */ subs?: Set<Subscriber>
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

/** @internal */ export const MAX_BATCH_ITERATIONS = 100

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

/** @internal — mark one sub with wave-counter dedup; recurse into computed subs. */
function markOne(sub: Subscriber): void {
  if (sub.flags & DISPOSED) return
  if (sub.lastWave === wave) return
  if (sub.flags & RUNNING) throw new SignalCircularError()
  sub.lastWave = wave
  sub.flags |= MARKED
  if (sub.flags & EFFECT) {
    // Effects only live in effectQueue; the drain clears MARKED when
    // shifted. Skip the visited push (saves O(N) for wide-fanout).
    effectQueue.push(sub)
    return
  }
  visited.push(sub)
  sub.flags |= STALE
  const inner = sub.subs as Set<Subscriber>
  // Restricted leaf fast path: a confirmed source-only computed
  // (HAS_COMPUTED_DEPS unset) with exactly one effect sub can settle
  // inline during marking — phase 2 dispatch becomes a STALE-cleared
  // early-return. Correctness invariant: spec §3.
  if (inner.size === 1 && !(sub.flags & HAS_COMPUTED_DEPS)) {
    let only: Subscriber | undefined
    for (const s of inner) {
      only = s
      break
    }
    if (only !== undefined && only.flags & EFFECT) {
      markOne(only)
      sub.recomputeIfNeeded?.()
      return
    }
  }
  propagateMark(inner)
}

/**
 * @internal — phase 1: mark every reachable sub once. Pure flag work; no
 * computed body runs here. Throws on RUNNING (cycle detection).
 */
export function propagateMark(subs: Set<Subscriber>): void {
  for (const sub of subs) markOne(sub)
}

/**
 * @internal — equality short-circuit (spec §2.6 / Phase 2 Finding 3).
 * Clears MARKED on direct effect subs (drain skips) and STALE+MARKED on
 * direct computed subs (their settle becomes a no-op).
 */
export function shallowClear(subs: Set<Subscriber>): void {
  for (const sub of subs) {
    if (sub.flags & EFFECT) sub.flags &= ~MARKED
    else sub.flags &= ~(STALE | MARKED)
  }
}

/**
 * @internal — phase 2 settle + phase 3 effect drain. Computeds with
 * effect subs eagerly recompute (running their equality check); effects
 * whose MARKED bit survived run in mark order.
 */
function settleAndDrain(): void {
  // Visited contains only computeds (effects skip the visited push for
  // perf; their MARKED clear happens here on the effectQueue walk).
  for (const sub of visited) sub.recomputeIfNeeded?.()
  for (const sub of effectQueue) {
    if (sub.flags & DISPOSED) continue
    if (!(sub.flags & MARKED)) continue
    sub.flags &= ~MARKED
    sub.notify()
  }
  effectQueue.length = 0
}

/** @internal — clear MARKED across visited; reset to recoverable state.
 * NOTIFIED-equivalent dedup state is invalidated by the next wave++ — no
 * iteration needed for that. */
function clearVisited(): void {
  for (const sub of visited) sub.flags &= ~MARKED
  visited.length = 0
  // Clear any leftover effectQueue entries' MARKED too (cycle-throw recovery).
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
  try {
    while (batchQueue.length > 0) {
      if (++iterations > MAX_BATCH_ITERATIONS) {
        for (const sub of batchQueue) sub.flags &= ~QUEUED
        batchQueue.length = 0
        throw new SignalCircularError()
      }
      // New wave per iteration: invalidates prior lastWave matches so
      // re-enqueued subs get re-marked next iteration.
      wave++
      const drainList = batchQueue.splice(0)
      for (const sub of drainList) {
        sub.flags &= ~QUEUED
        markOne(sub)
      }
      for (const sub of visited) sub.recomputeIfNeeded?.()
      for (const sub of effectQueue) {
        if (sub.flags & DISPOSED) continue
        if (!(sub.flags & MARKED)) continue
        sub.flags &= ~MARKED
        sub.notify()
      }
      effectQueue.length = 0
      visited.length = 0
    }
  } finally {
    clearVisited()
    for (const sub of batchQueue) sub.flags &= ~QUEUED
    batchQueue.length = 0
  }
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
  const subs = new Set<Subscriber>()
  const eq = options?.equals
  const equals: ((a: T, b: T) => boolean) | false = eq === undefined ? Object.is : eq

  const read: Read<T> = () => {
    if (currentObserver !== null) subs.add(currentObserver)
    return value
  }

  const write: Write<T> = (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : (next as T)
    if (equals !== false && equals(value, resolved)) return
    value = resolved
    if (subs.size === 0) return
    if (batchDepth > 0) {
      for (const sub of [...subs]) enqueueIfNeeded(sub)
      return
    }
    wave++
    try {
      propagateMark(subs)
      settleAndDrain()
    } finally {
      clearVisited()
    }
  }

  return [read, write] as const
}
