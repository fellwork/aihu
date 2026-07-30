/**
 * `usePreferredReducedTransparency` — reactive read of the OS/browser
 * `prefers-reduced-transparency` preference, built on {@link useMediaQuery}
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{preference()}`, never bare `{preference}`.
 *
 * SSR (`isClient === false`): returns a static `'no-preference'` getter
 * without reaching into `useMediaQuery` at all — the `isClient` no-op
 * invariant, checked directly here so this composable's own source
 * references `isClient` (Tier-2 `ssr-safety.test.ts` row required).
 */

import { isClient } from '../shared/index.ts'
import { useMediaQuery } from '../useMediaQuery/index.ts'

/** The `prefers-reduced-transparency` media-feature's value vocabulary. */
export type ReducedTransparencyPreference = 'reduce' | 'no-preference'

export type UsePreferredReducedTransparencyOptions = Record<string, never>

export interface UsePreferredReducedTransparencyReturn {
  /** Reactive getter — read as `{preference()}` in templates (parens
   * required). `'no-preference'` under SSR (no viewport to evaluate the
   * query against). */
  readonly preference: () => ReducedTransparencyPreference
}

/**
 * Track the `(prefers-reduced-transparency: reduce)` media query. Cleans up
 * with the surrounding effect scope (via the underlying `useMediaQuery`
 * listener).
 */
export function usePreferredReducedTransparency(
  _options: UsePreferredReducedTransparencyOptions = {},
): UsePreferredReducedTransparencyReturn {
  // SSR: static, no query ever registered.
  if (!isClient) {
    const preference = (): ReducedTransparencyPreference => 'no-preference'
    return { preference }
  }

  const { matches } = useMediaQuery('(prefers-reduced-transparency: reduce)')
  const preference = (): ReducedTransparencyPreference => (matches() ? 'reduce' : 'no-preference')
  return { preference }
}
