/**
 * `usePreferredReducedMotion` — reactive read of the OS/browser
 * `prefers-reduced-motion` preference, built on {@link useMediaQuery}
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * THE CANONICAL implementation of this preference. `@aihu/use/motion`'s
 * already-shipped `useReducedMotion` is now a thin backward-compatible
 * wrapper that delegates here (family -> core is the legal import
 * direction; core may never import a family).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{preference()}`, never bare `{preference}`.
 *
 * SSR (`isClient === false`): returns a static `'no-preference'` getter
 * without even reaching into `useMediaQuery` — the `isClient` no-op
 * invariant, checked directly here (not merely inherited transitively) so
 * this composable's own source references `isClient`, which is what makes a
 * Tier-2 row in `packages/use/tests/ssr-safety.test.ts` REQUIRED rather than
 * optional (the parity gate's 7th touch point).
 */

import { isClient } from '../shared/index.ts'
import { useMediaQuery } from '../useMediaQuery/index.ts'

/** The `prefers-reduced-motion` media-feature's value vocabulary — matches
 * the CSS feature directly rather than collapsing to a bare boolean, so a
 * caller can distinguish "the browser has an opinion and it's 'reduce'"
 * from a hypothetical future third value without a breaking rename. */
export type ReducedMotionPreference = 'reduce' | 'no-preference'

export type UsePreferredReducedMotionOptions = {}

export interface UsePreferredReducedMotionReturn {
  /** Reactive getter — read as `{preference()}` in templates (parens
   * required). `'no-preference'` under SSR (no viewport to evaluate the
   * query against). */
  readonly preference: () => ReducedMotionPreference
}

/**
 * Track the `(prefers-reduced-motion: reduce)` media query. Cleans up with
 * the surrounding effect scope (via the underlying `useMediaQuery`
 * listener).
 */
export function usePreferredReducedMotion(
  _options: UsePreferredReducedMotionOptions = {},
): UsePreferredReducedMotionReturn {
  // SSR: static, no query ever registered.
  if (!isClient) {
    const preference = (): ReducedMotionPreference => 'no-preference'
    return { preference }
  }

  const { matches } = useMediaQuery('(prefers-reduced-motion: reduce)')
  const preference = (): ReducedMotionPreference => (matches() ? 'reduce' : 'no-preference')
  return { preference }
}
