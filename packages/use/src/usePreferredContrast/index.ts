/**
 * `usePreferredContrast` — reactive read of the OS/browser
 * `prefers-contrast` preference, built on {@link useMediaQuery}
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{preference()}`, never bare `{preference}`.
 *
 * Implementation note: `prefers-contrast` has no single enum-valued media
 * feature to query — each of its four values (`more`/`less`/`custom`/
 * `no-preference`) is its own boolean media query. This composable runs
 * three independent `useMediaQuery` calls (one each for `more`/`less`/
 * `custom`) and derives the combined value; `no-preference` is the fallback
 * when none match. Three listeners, not one — slightly heavier than a
 * single-query composable, but there is no smaller correct implementation.
 *
 * SSR (`isClient === false`): returns a static `'no-preference'` getter
 * without reaching into `useMediaQuery` at all — the `isClient` no-op
 * invariant, checked directly here so this composable's own source
 * references `isClient` (Tier-2 `ssr-safety.test.ts` row required).
 */

import { isClient } from '../shared/index.ts'
import { useMediaQuery } from '../useMediaQuery/index.ts'

/** The `prefers-contrast` media-feature's value vocabulary. */
export type ContrastPreference = 'more' | 'less' | 'custom' | 'no-preference'

export type UsePreferredContrastOptions = {}

export interface UsePreferredContrastReturn {
  /** Reactive getter — read as `{preference()}` in templates (parens
   * required). `'no-preference'` under SSR (no viewport to evaluate the
   * query against). */
  readonly preference: () => ContrastPreference
}

/**
 * Track the `prefers-contrast` media feature (`'more' | 'less' | 'custom' |
 * 'no-preference'`). Cleans up with the surrounding effect scope (via the
 * three underlying `useMediaQuery` listeners).
 */
export function usePreferredContrast(
  _options: UsePreferredContrastOptions = {},
): UsePreferredContrastReturn {
  // SSR: static, no query ever registered.
  if (!isClient) {
    const preference = (): ContrastPreference => 'no-preference'
    return { preference }
  }

  const { matches: more } = useMediaQuery('(prefers-contrast: more)')
  const { matches: less } = useMediaQuery('(prefers-contrast: less)')
  const { matches: custom } = useMediaQuery('(prefers-contrast: custom)')

  const preference = (): ContrastPreference => {
    if (more()) return 'more'
    if (less()) return 'less'
    if (custom()) return 'custom'
    return 'no-preference'
  }

  return { preference }
}
