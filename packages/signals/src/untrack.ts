import { setCurrentObserver } from './signal.ts'

/**
 * Evaluate `fn()` outside any reactive tracking context.
 *
 * Saves the current observer slot (whatever computation currently owns the
 * call stack — may be `null`, an effect node, or a computed node), sets the
 * observer to `null` for the duration of `fn`, then restores the previous
 * observer in a `finally` block. Signal reads inside `fn` are invisible to
 * the calling computation: no dependency edges are created for those reads.
 *
 * Composes correctly with `batch`: `untrack` does not touch `batchDepth`,
 * so writes inside `fn` still enqueue rather than fire synchronously.
 *
 * Spec: `.team/phase-3/spec-arbor.md` §1.1.
 */
export function untrack<T>(fn: () => T): T {
  const prev = setCurrentObserver(null)
  try {
    return fn()
  } finally {
    setCurrentObserver(prev)
  }
}
