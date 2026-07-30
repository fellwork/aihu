/**
 * `useDevicePixelRatio` — reactive `window.devicePixelRatio`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * `devicePixelRatio` fires no change event of its own — the standard
 * technique (used by every prior art implementation) is to watch a
 * `matchMedia('(resolution: <current-ratio>dppx)')` query and, on its
 * `change` event, read the new ratio and RE-ARM a fresh query at the new
 * value (the old query no longer matches once the ratio has changed, so it
 * would never fire again otherwise).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{pixelRatio()}`, never bare `{pixelRatio}`.
 *
 * SSR (`isClient === false`): returns a static `1` getter and registers no
 * listener — the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { defaultWindow, isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseDevicePixelRatioReturn {
  /** Reactive getter — read as `{pixelRatio()}` in templates (parens
   * required). `1` under SSR. */
  readonly pixelRatio: () => number
}

/**
 * Track `window.devicePixelRatio`, re-arming a `matchMedia` resolution
 * query on every change (see module doc). Cleans up with the surrounding
 * effect scope; scopeless callers keep the listener for the page's
 * lifetime.
 */
export function useDevicePixelRatio(): UseDevicePixelRatioReturn {
  const maybeWin = defaultWindow

  // SSR: static getter, no signal, no listener.
  if (!isClient || maybeWin === undefined) {
    const pixelRatio = (): number => 1
    return { pixelRatio }
  }
  // Rebound to a non-optional binding: a nested `function` declaration (see
  // `update` below) does not retain the narrowing from the guard above, so
  // `win` must be typed `Window`, not `Window | undefined`, at its point of
  // declaration.
  const win: Window = maybeWin

  const [pixelRatio, setPixelRatio] = signal(win.devicePixelRatio || 1)

  let media: MediaQueryList | undefined
  let stopped = false

  const detach = (): void => {
    if (media === undefined) return
    if (typeof media.removeEventListener === 'function') {
      media.removeEventListener('change', update)
    } else {
      media.removeListener(update)
    }
    media = undefined
  }

  const attach = (): void => {
    if (stopped) return
    media = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
    } else {
      media.addListener(update)
    }
  }

  function update(): void {
    setPixelRatio(win.devicePixelRatio || 1)
    detach()
    attach()
  }

  attach()
  tryOnScopeDispose(() => {
    stopped = true
    detach()
  })

  return { pixelRatio }
}
