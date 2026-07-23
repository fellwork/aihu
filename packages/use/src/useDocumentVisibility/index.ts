/**
 * `useDocumentVisibility` — reactive `document.visibilityState`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{visibility()}`, never bare `{visibility}`.
 *
 * SSR (`isClient === false`): returns a static `'visible'` getter and
 * registers no listener — the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { defaultDocument, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export interface UseDocumentVisibilityReturn {
  /** Reactive getter — read as `{visibility()}` in templates (parens
   * required). `'visible'` under SSR (no `document` to observe). */
  readonly visibility: () => DocumentVisibilityState
}

/**
 * Track `document.visibilityState` (`'visible' | 'hidden'`), updating on the
 * `visibilitychange` event. Cleans up with the surrounding effect scope (via
 * the underlying `useEventListener`).
 */
export function useDocumentVisibility(): UseDocumentVisibilityReturn {
  // SSR: static getter, no signal, no listener.
  if (!isClient || defaultDocument === undefined) {
    const visibility = (): DocumentVisibilityState => 'visible'
    return { visibility }
  }

  const doc = defaultDocument
  const [visibility, setVisibility] = signal<DocumentVisibilityState>(doc.visibilityState)

  useEventListener(doc, 'visibilitychange', () => {
    setVisibility(doc.visibilityState)
  })

  return { visibility }
}
