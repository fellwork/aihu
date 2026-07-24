/**
 * `useBrowserLanguage` — reactive `navigator.language` (the user's single
 * primary language), updated on the `languagechange` event
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{language()}`, never bare `{language}`.
 *
 * Prefer {@link usePreferredLanguages} when the FULL ordered preference
 * list matters (e.g. multi-locale fallback chains) — this composable is the
 * common single-value case (`navigator.language`, the browser UI's own
 * primary language).
 *
 * Note: `languagechange` fires on the global scope object (`window`), NOT
 * on `navigator` — despite the value it reports living on `navigator`.
 *
 * SSR (`isClient === false`): returns a static `undefined` getter and
 * registers no listener — the `isClient` no-op invariant. `undefined`
 * (never a guessed locale) rather than a fabricated default: there is no
 * "browser" under SSR to have a language.
 */

import { signal } from '@aihu/signals'
import { defaultNavigator, defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export type UseBrowserLanguageOptions = {}

export interface UseBrowserLanguageReturn {
  /** Reactive getter — read as `{language()}` in templates (parens
   * required). `undefined` under SSR (no `navigator` to read). */
  readonly language: () => string | undefined
}

/**
 * Track `navigator.language` (e.g. `'en-US'`), updating on the
 * `languagechange` event. Cleans up with the surrounding effect scope (via
 * the underlying `useEventListener`).
 */
export function useBrowserLanguage(
  _options: UseBrowserLanguageOptions = {},
): UseBrowserLanguageReturn {
  // SSR (or no window/navigator): static undefined, no signal, no listener.
  if (!isClient || defaultWindow === undefined || defaultNavigator === undefined) {
    const language = (): string | undefined => undefined
    return { language }
  }

  const win = defaultWindow
  const nav = defaultNavigator
  const [language, setLanguage] = signal<string | undefined>(nav.language)

  useEventListener(win, 'languagechange', () => {
    setLanguage(nav.language)
  })

  return { language }
}
