/**
 * `useMediaQuery` — reactive boolean for a CSS media-query string, tracked
 * via `matchMedia` (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{matches()}`, never bare `{matches}`.
 *
 * SSR (`isClient === false`): returns a static getter of `false` — there is
 * no viewport to evaluate the query against — and registers no listener,
 * the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { defaultWindow, isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseMediaQueryOptions {
  /** The `window` to query against. Default the global `window`. */
  window?: Window
}

export interface UseMediaQueryReturn {
  /** Reactive match getter — read as `{matches()}` in templates (parens
   * required). `false` under SSR (no viewport to evaluate the query). */
  readonly matches: () => boolean
}

/**
 * Track whether `query` (a CSS media-query string, e.g.
 * `'(prefers-color-scheme: dark)'` or `'(min-width: 768px)'`) currently
 * matches. Cleans up with the surrounding effect scope; scopeless callers
 * keep the listener for the page's lifetime.
 */
export function useMediaQuery(
  query: string,
  options: UseMediaQueryOptions = {},
): UseMediaQueryReturn {
  const { window: win = defaultWindow } = options

  // SSR: static getter, no signal, no listener.
  if (!isClient || win === undefined) {
    const matches = (): boolean => false
    return { matches }
  }

  const mql = win.matchMedia(query)
  const [matches, setMatches] = signal(mql.matches)

  const handler = (e: MediaQueryListEvent): void => setMatches(e.matches)
  // `addEventListener('change', …)` is the modern form; `addListener` is the
  // deprecated Safari<14 fallback some environments still need.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler)
  } else {
    // biome-ignore lint: legacy MediaQueryList fallback (deprecated addListener API)
    mql.addListener(handler)
  }

  let stopped = false
  const stop = (): void => {
    if (stopped) return
    stopped = true
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', handler)
    } else {
      // biome-ignore lint: legacy MediaQueryList fallback (deprecated removeListener API)
      mql.removeListener(handler)
    }
  }
  tryOnScopeDispose(stop)

  return { matches }
}
