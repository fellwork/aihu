/**
 * `usePreferredDark` — reactive boolean for the OS/browser
 * `prefers-color-scheme: dark` media feature, built on {@link useMediaQuery}
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{prefersDark()}`, never bare `{prefersDark}`.
 *
 * SSR (`isClient === false`): delegates to `useMediaQuery`, which returns a
 * static `false` getter and registers no listener under SSR — the
 * `isClient` no-op invariant is inherited, not re-implemented.
 */

import { useMediaQuery } from '../useMediaQuery/index.ts'

export interface UsePreferredDarkReturn {
  /** Reactive getter — read as `{prefersDark()}` in templates (parens
   * required). `false` under SSR. */
  readonly prefersDark: () => boolean
}

/**
 * Track the user's OS/browser dark-mode preference
 * (`prefers-color-scheme: dark`). Cleans up with the surrounding effect
 * scope (via the underlying `useMediaQuery` listener).
 */
export function usePreferredDark(): UsePreferredDarkReturn {
  const { matches: prefersDark } = useMediaQuery('(prefers-color-scheme: dark)')
  return { prefersDark }
}
