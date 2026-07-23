/**
 * `useSupported` — wrap a feature-detection predicate into a reactive
 * boolean getter (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Deliberate divergence from the "object of named getters" convention: this
 * composable returns a single BARE getter (there is only one output value),
 * not `{ isSupported }` — mirrors `usePrevious`.
 *
 * Reading the getter in `.aihu` templates still needs parens:
 * `{supported()}`, never bare `{supported}` (same rule as every other
 * composable getter — see useMouse's module doc for the full explanation).
 *
 * SSR (`isClient === false`): returns a static getter of `false` and never
 * calls `predicate` — the feature-detection APIs a predicate probes
 * (`typeof SomeApi !== 'undefined'`, etc.) are meaningless with no
 * window/document, and calling it would risk a ReferenceError in a
 * predicate that assumes a DOM. This is the `isClient` no-op invariant.
 */

import { isClient } from '../shared/index.ts'

/** Reactive getter — read as `{supported()}` in templates (parens required). */
export type UseSupportedReturn = () => boolean

/**
 * Feature-detect once on the client via `predicate` (e.g.
 * `() => typeof IntersectionObserver !== 'undefined'`); always `false`
 * under SSR, without invoking `predicate`.
 */
export function useSupported(predicate: () => boolean): UseSupportedReturn {
  // SSR: static false, predicate never called.
  if (!isClient) {
    const isSupported = (): boolean => false
    return isSupported
  }

  const value = predicate()
  const isSupported = (): boolean => value

  return isSupported
}
