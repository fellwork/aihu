/**
 * `usePreferredLanguages` — reactive `navigator.languages` array, updated on
 * the `languagechange` event (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{languages()}`, never bare `{languages}`.
 *
 * Note: `languagechange` fires on the global scope object (`window`), NOT
 * on `navigator` — despite the value it reports living on `navigator`.
 * Verified against the spec (HTML Living Standard, `NavigatorLanguage`).
 *
 * SSR (`isClient === false`): returns a static empty-array getter (`[]`)
 * and registers no listener — the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { defaultNavigator, defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export type UsePreferredLanguagesOptions = {}

export interface UsePreferredLanguagesReturn {
  /** Reactive getter — read as `{languages()}` in templates (parens
   * required). `[]` under SSR (no `navigator` to read). */
  readonly languages: () => readonly string[]
}

function readLanguages(nav: Navigator): readonly string[] {
  return [...(nav.languages ?? [])]
}

/**
 * Track `navigator.languages` (the user's ordered language preferences),
 * updating on the `languagechange` event. Cleans up with the surrounding
 * effect scope (via the underlying `useEventListener`).
 */
export function usePreferredLanguages(
  _options: UsePreferredLanguagesOptions = {},
): UsePreferredLanguagesReturn {
  // SSR (or no window/navigator): static empty array, no signal, no listener.
  if (!isClient || defaultWindow === undefined || defaultNavigator === undefined) {
    const languages = (): readonly string[] => []
    return { languages }
  }

  const win = defaultWindow
  const nav = defaultNavigator
  const [languages, setLanguages] = signal<readonly string[]>(readLanguages(nav))

  useEventListener(win, 'languagechange', () => {
    setLanguages(readLanguages(nav))
  })

  return { languages }
}
