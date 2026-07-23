/**
 * `useColorScheme` — reactive `'light' | 'dark' | 'auto'` color-scheme
 * STATE, resolving `'auto'` against the OS preference via
 * {@link usePreferredDark} (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Deliberately state-only: this composable does NOT read or write
 * `document` (no `class`/`data-*` toggling) and does NOT touch
 * `localStorage` — pair it with `useLocalStorage` at the call site if the
 * choice should persist, and apply `resolved()` to the DOM yourself. Keeping
 * it state-only is what makes it trivially SSR-safe.
 *
 * Return convention (ratified): an object of named getters (+ a setter),
 * signals under the hood. Readers in .aihu templates MUST call getters with
 * parens: `{scheme()}` / `{resolved()}`, never bare.
 *
 * SSR (`isClient === false`): `resolved()` falls back to `'light'` (via
 * `usePreferredDark`'s static-`false` SSR path) and no listener/effect of
 * any kind is registered — the `isClient` no-op invariant is inherited from
 * `usePreferredDark` → `useMediaQuery`.
 */

import { signal } from '@aihu/signals'
import { usePreferredDark } from '../usePreferredDark/index.ts'

/** A color-scheme setting: an explicit choice, or `'auto'` to follow the OS
 * preference. */
export type ColorScheme = 'light' | 'dark' | 'auto'

export interface UseColorSchemeOptions {
  /** The scheme to start in. Default `'auto'`. */
  initialValue?: ColorScheme
}

export interface UseColorSchemeReturn {
  /** Reactive getter for the RAW setting (`'light' | 'dark' | 'auto'`) —
   * read as `{scheme()}` in templates (parens required). */
  readonly scheme: () => ColorScheme
  /** Reactive getter for the RESOLVED scheme (`'light' | 'dark'`) — `'auto'`
   * is resolved against `usePreferredDark`. Read as `{resolved()}` in
   * templates (parens required). `'light'` under SSR. */
  readonly resolved: () => 'light' | 'dark'
  /** Update the raw setting. */
  setScheme: (value: ColorScheme) => void
}

/**
 * Track a `'light' | 'dark' | 'auto'` color-scheme choice and its resolved
 * `'light' | 'dark'` value. State-only — no `document`/`localStorage`
 * side effects (see module doc).
 */
export function useColorScheme(options: UseColorSchemeOptions = {}): UseColorSchemeReturn {
  const { initialValue = 'auto' } = options

  const [scheme, setScheme] = signal<ColorScheme>(initialValue)
  const { prefersDark } = usePreferredDark()

  const resolved = (): 'light' | 'dark' => {
    const s = scheme()
    if (s === 'auto') return prefersDark() ? 'dark' : 'light'
    return s
  }

  return { scheme, resolved, setScheme }
}
