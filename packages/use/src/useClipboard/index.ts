/**
 * `useClipboard` — write to the system clipboard via the async Clipboard API,
 * with a transient `copied` flag for "Copied!" UI
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters (+ a `copy`
 * action), signals under the hood. Readers in .aihu templates MUST call
 * getters with parens: `{copied()}`, never bare `{copied}`.
 *
 * SSR (`isClient === false`): `isSupported()` is `false` (via
 * `useSupported`'s SSR path), `copied()` is permanently `false`, and
 * `copy()` is a no-op that never touches `navigator` — the `isClient` no-op
 * invariant.
 */

import { signal } from '@aihu/signals'
import { defaultNavigator, isClient, tryOnScopeDispose } from '../shared/index.ts'
import { useSupported } from '../useSupported/index.ts'

export interface UseClipboardOptions {
  /** How long `copied()` stays `true` after a successful `copy()`, in ms.
   * Default `1500`. */
  copiedDuring?: number
}

export interface UseClipboardReturn {
  /** Write `text` to the clipboard. Resolves once the write settles;
   * swallows a rejected `navigator.clipboard.writeText` (e.g. denied
   * permission) rather than throwing — check `isSupported()` beforehand for
   * a UI-level guard. No-op under SSR/unsupported browsers. */
  copy: (text: string) => Promise<void>
  /** Reactive getter — `true` for `copiedDuring` ms after a successful
   * `copy()`, then resets to `false`. Read as `{copied()}` in templates
   * (parens required). */
  readonly copied: () => boolean
  /** Reactive getter — whether the async Clipboard API is available. Read
   * as `{isSupported()}` in templates (parens required). `false` under
   * SSR. */
  readonly isSupported: () => boolean
}

/**
 * Copy text to the clipboard, with a `copied()` flag for feedback UI.
 * Cleans up its reset timer with the surrounding effect scope.
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const { copiedDuring = 1500 } = options

  const isSupported = useSupported(
    () => defaultNavigator !== undefined && typeof defaultNavigator.clipboard !== 'undefined',
  )

  // SSR: static getters, no signal, no timer — copy() never touches
  // `navigator` (some SSR runtimes throw on the mere property access).
  if (!isClient) {
    const copied = (): boolean => false
    const copy = async (): Promise<void> => {}
    return { copy, copied, isSupported }
  }

  const [copied, setCopied] = signal(false)
  let resetHandle: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const clearReset = (): void => {
    if (resetHandle !== null) {
      clearTimeout(resetHandle)
      resetHandle = null
    }
  }

  const copy = async (text: string): Promise<void> => {
    if (!isSupported()) return
    try {
      await defaultNavigator?.clipboard.writeText(text)
    } catch {
      // Denied permission / non-secure context: leave `copied` untouched
      // rather than throwing out of a UI action handler.
      return
    }
    setCopied(true)
    clearReset()
    resetHandle = setTimeout(() => setCopied(false), copiedDuring)
  }

  // The reset timer is a raw `setTimeout`, not wrapped by another
  // composable — register its own teardown so a disposed scope can't fire a
  // stale `setCopied(false)` after unmount.
  tryOnScopeDispose(() => {
    if (stopped) return
    stopped = true
    clearReset()
  })

  return { copy, copied, isSupported }
}
