/**
 * `useActiveElement` — reactive `document.activeElement`, drilled through
 * open shadow roots to the truly-focused leaf
 * (docs/plans/2026-07-24-use-categorical-parity.md §3 Elements;
 * docs/plans/2026-07-24-composed-tree-helper.md §6).
 *
 * **Why not `document.activeElement` directly.** `document.activeElement`
 * stops at the outermost shadow HOST — in a custom-elements framework where
 * shadow boundaries are the default, that is almost never the element the
 * user actually focused. This composable is a thin reactive wrapper over
 * `composedActiveElement` (`../shared/composed-tree.ts`), which recursively
 * reads each open shadow root's own `.activeElement` to reach the leaf.
 * Closed shadow roots are an unavoidable dead end (see that module's docs) —
 * this getter reports the closed root's host in that case, same as the
 * substrate.
 *
 * **`null` only under SSR.** On the client this mirrors
 * `document.activeElement`'s own default: with nothing explicitly focused
 * that is `document.body` (per spec), never `null` — this composable does
 * not paper over that with a synthetic `null`, so callers comparing against
 * "nothing focused" should compare against `defaultDocument?.body`, not
 * `null`.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{activeElement()}`, never bare `{activeElement}`.
 *
 * SSR (`isClient === false`): returns a static `null` getter (there is no
 * `document.body` to default to) and registers no listener — the
 * `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { composedActiveElement } from '../shared/composed-tree.ts'
import { defaultDocument, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export interface UseActiveElementReturn {
  /** Reactive getter — read as `{activeElement()}` in templates (parens
   * required). `null` under SSR; on the client, `document.body` (not
   * `null`) when nothing is explicitly focused — see module doc. */
  readonly activeElement: () => Element | null
}

/**
 * Track the truly-focused element across shadow boundaries, updating on
 * `focusin`/`focusout` (both bubble to `document`, so a single pair of
 * document-level listeners covers every focus change anywhere in the page).
 * Cleans up with the surrounding effect scope; scopeless callers keep the
 * listeners for the page's lifetime.
 */
export function useActiveElement(): UseActiveElementReturn {
  // SSR: static getter, no signal, no listener.
  if (!isClient || defaultDocument === undefined) {
    const activeElement = (): Element | null => null
    return { activeElement }
  }

  const doc = defaultDocument
  const [activeElement, setActiveElement] = signal<Element | null>(composedActiveElement(doc))

  const update = (): void => setActiveElement(composedActiveElement(doc))
  useEventListener(doc, 'focusin', update)
  useEventListener(doc, 'focusout', update)

  return { activeElement }
}
