import { SignalCircularError } from './errors.ts'

/** @internal */
export interface Subscriber {
  notify(): void
  /** @internal */ flags: number
  /** @internal */ subs?: Set<Subscriber>
  /** @internal */ recomputeIfNeeded?(): void
}

/** @internal */ export const RUNNING = 0x1
/** @internal */ export const DISPOSED = 0x2
/** @internal */ export const QUEUED = 0x4
/** @internal */ export const STALE = 0x8
/** @internal */ export const EFFECT = 0x10
/** @internal */ export const MARKED = 0x20
/** @internal */ export const NOTIFIED = 0x40

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

/** @internal — mark one sub with NOTIFIED dedup; recurse into computed subs. */
function markOne(sub: Subscriber): void {
  if (sub.flags & (DISPOSED | NOTIFIED)) return
  if (sub.flags & RUNNING) throw new SignalCircularError()
  sub.flags |= NOTIFIED | MARKED
  visited.push(sub)
  if (!(sub.flags & EFFECT)) {
    sub.flags |= STALE
    const inner = sub.subs
    if (inner !== undefined && inner.size > 0) propagateMark(inner)
  }
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
 * whose MARKED bit survived run in visited (insertion) order.
 */
function settleAndDrain(): void {
  for (const sub of visited) sub.recomputeIfNeeded?.()
  // Effects in visited order. Mid-walk new entries (e.g. effect writes
  // outside batch fire signal.write recursively, which clears visited
  // via try/finally in signal.write) only happen via batch path.
  for (const sub of visited) {
    if (!(sub.flags & EFFECT)) continue
    if (sub.flags & DISPOSED) continue
    if (!(sub.flags & MARKED)) continue
    sub.flags &= ~MARKED
    sub.notify()
  }
}

/** @internal — clear NOTIFIED+MARKED across visited; reset to recoverable state. */
function clearVisited(): void {
  for (const sub of visited) sub.flags &= ~(NOTIFIED | MARKED)
  visited.length = 0
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
      const drainList = batchQueue.splice(0)
      for (const sub of drainList) {
        sub.flags &= ~QUEUED
        markOne(sub)
      }
      for (const sub of visited) sub.recomputeIfNeeded?.()
      // Run effects in batch insertion order, then any cascade-reached
      // effects in mark order.
      for (const sub of drainList) {
        if (sub.flags & DISPOSED) continue
        if (!(sub.flags & EFFECT)) {
          sub.flags &= ~MARKED
          continue
        }
        if (!(sub.flags & MARKED)) continue
        sub.flags &= ~MARKED
        sub.notify()
      }
      for (const sub of visited) {
        if (!(sub.flags & EFFECT)) continue
        if (sub.flags & DISPOSED) continue
        if (!(sub.flags & MARKED)) continue
        sub.flags &= ~MARKED
        sub.notify()
      }
      // Clear NOTIFIED at iteration boundary so re-enqueued subs get
      // re-marked next iteration (cap guard relies on this).
      for (const sub of visited) sub.flags &= ~NOTIFIED
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
    try {
      propagateMark(subs)
      settleAndDrain()
    } finally {
      clearVisited()
    }
  }

  return [read, write] as const
}
