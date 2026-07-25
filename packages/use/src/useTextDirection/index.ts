/**
 * `useTextDirection` — reactive text direction (`'ltr' | 'rtl' | 'auto'`)
 * read from a target element's `dir` attribute — default
 * `document.documentElement` (the `<html>` root) — tracked via
 * `MutationObserver` (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{direction()}`, never bare `{direction}`.
 *
 * There is no DOM event for an attribute mutation, so — unlike
 * `useMediaQuery`'s `change` event or `usePreferredLanguages`'
 * `languagechange` — this composable owns its own `MutationObserver`
 * directly rather than composing `useEventListener`, mirroring
 * `useElementSize`'s `ResizeObserver` pattern (reactive getter target,
 * `effect`-driven rebind, per-run `onCleanup`).
 *
 * SSR (`isClient === false`): returns a static `'ltr'` getter and registers
 * no observer — the `isClient` no-op invariant.
 */

import { effect, signal } from '@aihu/signals'
import {
  defaultDocument,
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

/** The `dir` attribute's three legal values. An element with no `dir`
 * attribute (or an unrecognized value) reads as `'ltr'`, the HTML default. */
export type TextDirection = 'ltr' | 'rtl' | 'auto'

export interface UseTextDirectionOptions {
  /** Element to read `dir` from. Default `document.documentElement` (the
   * `<html>` root). A getter target rebinds reactively — the observer moves
   * to the new element when the getter's tracked signal changes (mirrors
   * `useElementSize`'s sibling sensors); a getter that reads no signal runs
   * once and never rebinds (same documented caveat as `useEventListener`). */
  target?: MaybeElementGetter
}

export interface UseTextDirectionReturn {
  /** Reactive getter — read as `{direction()}` in templates (parens
   * required). `'ltr'` under SSR (no DOM to read). */
  readonly direction: () => TextDirection
}

function readDirection(el: Element | null | undefined): TextDirection {
  const raw = el?.getAttribute('dir')
  return raw === 'ltr' || raw === 'rtl' || raw === 'auto' ? raw : 'ltr'
}

/**
 * Track an element's `dir` attribute (default the document root), updating
 * on any `dir` mutation via `MutationObserver`. Cleans up with the
 * surrounding effect scope; scopeless callers keep the observer for the
 * page's lifetime.
 */
export function useTextDirection(options: UseTextDirectionOptions = {}): UseTextDirectionReturn {
  const { target } = options

  // SSR: static 'ltr', no signal, no observer.
  if (!isClient || defaultDocument === undefined) {
    const direction = (): TextDirection => 'ltr'
    return { direction }
  }

  const doc = defaultDocument
  // Omitted target: a getter over the (effectively constant) document
  // root, so it still flows through the same reactive-target machinery
  // below without a separate code path.
  const resolveTarget: MaybeElementGetter =
    target !== undefined ? target : () => doc.documentElement

  const [direction, setDirection] = signal<TextDirection>(
    readDirection(unrefElement(resolveTarget)),
  )

  let stopped = false
  let observer: MutationObserver | null = null

  // Reactive target: the effect tracks the getter; per-run onCleanup
  // disconnects the previous observer before the re-run observes the new
  // element — the observer follows the target ($ref null → element).
  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(resolveTarget)
    setDirection(readDirection(el))
    if (el == null) return
    observer = new MutationObserver(() => setDirection(readDirection(el)))
    observer.observe(el, { attributes: true, attributeFilter: ['dir'] })
    onCleanup(() => {
      observer?.disconnect()
      observer = null
    })
  })

  const stop = (): void => {
    if (stopped) return
    stopped = true
    disposeEffect()
  }
  tryOnScopeDispose(stop)

  return { direction }
}
