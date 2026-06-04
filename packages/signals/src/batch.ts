import { drainBatch, enterBatch, exitBatch, getBatchDepth } from './signal.ts'

/**
 * Batch a sequence of `signal` writes so subscribers fire once at the end.
 *
 * Within `fn`, every signal write defers subscriber notification: affected
 * subscribers are inserted into a module-level queue (deduplicated by
 * identity) instead of firing synchronously. When the outermost `batch` call
 * returns, the queue is drained — each queued subscriber's `notify()` runs
 * once, in insertion order. Nested `batch(() => batch(...))` calls flush only
 * at the outermost return.
 *
 * **Non-atomic on error:** If `fn` throws, any signal writes that occurred
 * before the throw are still propagated to subscribers — `batch` does not
 * roll back on exception. Callers that need atomic semantics must implement
 * snapshot-restore manually.
 *
 * Returns whatever `fn` returns (the value is captured before the queue drains
 * in the `finally`). This lets a batched action surface a result to its
 * caller — e.g. the compiler lowers `$action` handlers to `return batch(() =>
 * { … })`, so an agent driving the action receives the handler's return value
 * instead of `undefined`. Callers that batch purely for side effects can keep
 * ignoring the return.
 */
export function batch<T>(fn: () => T): T {
  enterBatch()
  try {
    return fn()
  } finally {
    if (getBatchDepth() === 1) {
      try {
        drainBatch()
      } finally {
        exitBatch()
      }
    } else {
      exitBatch()
    }
  }
}
