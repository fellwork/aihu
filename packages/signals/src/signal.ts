import { SignalCircularError } from './errors.ts'

/**
 * Internal — never re-exported from index.ts.
 *
 * A reactive computation that subscribes to one or more signals.
 * `flags` is a packed bitfield (see flag bits below) used by effect/computed
 * to coordinate cycle detection, disposal, and batch dedup.
 */
/** @internal */
export interface Subscriber {
  notify(): void
  /** @internal — packed bitfield (RUNNING | DISPOSED | QUEUED | STALE) */
  flags: number
}

/** @internal */ export const RUNNING = 0x1
/** @internal */ export const DISPOSED = 0x2
/** @internal */ export const QUEUED = 0x4
/** @internal */ export const STALE = 0x8

/** @internal — module-level current observer for dependency capture. */
let currentObserver: Subscriber | null = null

/** @internal — swap and return the previous observer. */
export function setCurrentObserver(next: Subscriber | null): Subscriber | null {
  const prev = currentObserver
  currentObserver = next
  return prev
}

/** @internal — non-destructive read of the current observer. */
export function peekCurrentObserver(): Subscriber | null {
  return currentObserver
}

// --- batch internals ----------------------------------------------------
//
// Module-level batch state (spec §2). Re-exported as `/** @internal */` so
// `batch.ts` can drive the depth + drain loop. Never re-exported from index.ts.

/** @internal */ export const MAX_BATCH_ITERATIONS = 100

/** @internal */ let batchDepth = 0
/** @internal */ const batchQueue: Subscriber[] = []

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

/** @internal */
export function drainBatch(): void {
  let iterations = 0
  while (batchQueue.length > 0) {
    if (++iterations > MAX_BATCH_ITERATIONS) {
      // Reset queue + flags so the system is recoverable post-throw, then bail.
      for (const sub of batchQueue) sub.flags &= ~QUEUED
      batchQueue.length = 0
      throw new SignalCircularError()
    }
    const sub = batchQueue.shift() as Subscriber
    sub.flags &= ~QUEUED
    if (!(sub.flags & DISPOSED)) sub.notify()
  }
}

/** @internal — append `sub` to the batch queue if not already queued. */
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
    // Snapshot to avoid mutation during iteration if a sub disposes itself mid-notify.
    if (batchDepth > 0) {
      for (const sub of [...subs]) enqueueIfNeeded(sub)
    } else {
      for (const sub of [...subs]) sub.notify()
    }
  }

  return [read, write] as const
}
