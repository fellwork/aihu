/**
 * `usePageLeave` — reactive boolean for whether the pointer has left the
 * page/viewport, tracked via `mouseleave`/`mouseenter` on `document`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Deliberate divergence from the "object of named getters" convention: like
 * `usePrevious`/`useSupported`, there is only one output value, so this
 * returns a single BARE getter, not `{ isLeft }`.
 *
 * Reading the getter in `.aihu` templates still needs parens:
 * `{isLeft()}`, never bare `{isLeft}` (same rule as every other composable
 * getter).
 *
 * SSR (`isClient === false`): returns a static `false` getter and registers
 * no listener — the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { defaultDocument, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

/** Reactive getter — read as `{isLeft()}` in templates (parens required). */
export type UsePageLeaveReturn = () => boolean

/**
 * Track whether the pointer has left the document (`mouseleave`) versus
 * re-entered it (`mouseenter`). Cleans up with the surrounding effect scope
 * (via the underlying `useEventListener`).
 */
export function usePageLeave(): UsePageLeaveReturn {
  const doc = defaultDocument

  // SSR: static getter, no signal, no listener.
  if (!isClient || doc === undefined) {
    const isLeft = (): boolean => false
    return isLeft
  }

  const [isLeft, setIsLeft] = signal(false)

  useEventListener(doc, 'mouseleave', () => setIsLeft(true))
  useEventListener(doc, 'mouseenter', () => setIsLeft(false))

  return isLeft
}
