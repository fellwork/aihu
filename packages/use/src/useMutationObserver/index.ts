/**
 * `useMutationObserver` — observe DOM mutations (child list, attributes,
 * character data) on a target element via `MutationObserver`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Deliberate divergence from the "object of named getters" convention: like
 * `useEventListener`, the meaningful output here is action handles, not
 * state — returns `{ stop, takeRecords }`.
 *
 * SSR (`isClient === false`): registers no observer and never invokes
 * `callback`; `stop()` is a no-op and `takeRecords()` returns `[]` — the
 * `isClient` no-op invariant.
 */

import { effect } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

export interface UseMutationObserverReturn {
  /** Disconnect the observer (and dispose the target-rebinding effect).
   * Idempotent. */
  stop: () => void
  /** Forward to the live observer's `takeRecords()` — drains its pending
   * mutation record queue without waiting for the next microtask. Returns
   * `[]` if no observer is currently attached (no target yet, or after
   * `stop()`). */
  takeRecords: () => MutationRecord[]
}

/**
 * Observe `target` for mutations matching `options` (the native
 * `MutationObserverInit` — the caller MUST set at least one of `childList`,
 * `attributes`, or `characterData` to `true`, same requirement as the
 * native `observe()` call), calling `callback` with every batch of records
 * (mirrors the native `MutationCallback` signature, plus the observer
 * instance). Cleans up with the surrounding effect scope; scopeless callers
 * keep the observer for the page's lifetime unless they call the returned
 * `stop()` themselves.
 */
export function useMutationObserver(
  target: MaybeElementGetter,
  callback: (records: MutationRecord[], observer: MutationObserver) => void,
  options: MutationObserverInit,
): UseMutationObserverReturn {
  // SSR: register nothing, callback never runs, stop/takeRecords are no-ops.
  if (!isClient) {
    return { stop: () => {}, takeRecords: () => [] }
  }

  let stopped = false
  let current: MutationObserver | null = null

  // Reactive target: the effect tracks the getter; per-run onCleanup
  // disconnects the previous observer before the re-run observes the new
  // element — the observer follows the target ($ref null → element).
  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)
    if (el == null) return
    const observer = new MutationObserver((records) => callback(records, observer))
    observer.observe(el, options)
    current = observer
    onCleanup(() => {
      observer.disconnect()
      current = null
    })
  })

  const stop = (): void => {
    if (stopped) return
    stopped = true
    disposeEffect()
  }
  tryOnScopeDispose(stop)

  const takeRecords = (): MutationRecord[] => current?.takeRecords() ?? []

  return { stop, takeRecords }
}
