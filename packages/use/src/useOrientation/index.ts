/**
 * `useOrientation` — reactive screen orientation (`angle` + `type`) via the
 * Screen Orientation API, falling back to an `(orientation: portrait)`
 * media query on engines that lack it
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * The fallback is coarser than the real API by necessity: a media query
 * can distinguish portrait from landscape but not primary from secondary
 * (upside-down) rotation, so the fallback path reports `angle: 0` /
 * `'portrait-primary'` or `angle: 90` / `'landscape-primary'` only — never
 * the `-secondary` variants.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{angle()}`, never bare `{angle}`.
 *
 * SSR (`isClient === false`): returns static `angle: 0` /
 * `type: 'portrait-primary'` getters and registers no listener — the
 * `isClient` no-op invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultWindow, isClient, tryOnScopeDispose } from '../shared/index.ts'
import { useMediaQuery } from '../useMediaQuery/index.ts'

export interface UseOrientationReturn {
  /** Reactive getter for the rotation angle in degrees. Read as
   * `{angle()}` in templates (parens required). `0` under SSR. */
  readonly angle: () => number
  /** Reactive getter for the orientation type. Read as `{type()}` in
   * templates (parens required). `'portrait-primary'` under SSR. */
  readonly type: () => OrientationType
}

/**
 * Track the screen's rotation angle and orientation type. Prefers
 * `screen.orientation` (the real API, including `-secondary` variants);
 * falls back to a `matchMedia('(orientation: portrait)')` listener where
 * `screen.orientation` is unavailable (see module doc for the fallback's
 * coarser guarantee). Cleans up with the surrounding effect scope.
 */
export function useOrientation(): UseOrientationReturn {
  const win = defaultWindow

  // SSR: static getters, no signal, no listener/observer.
  if (!isClient || win === undefined) {
    const angle = (): number => 0
    const type = (): OrientationType => 'portrait-primary'
    return { angle, type }
  }

  const screenOrientation = win.screen?.orientation

  if (screenOrientation !== undefined) {
    const [angle, setAngle] = signal(screenOrientation.angle)
    const [type, setType] = signal<OrientationType>(screenOrientation.type)

    const update = (): void => {
      // Batched: observers see ONE consistent (angle, type) update per
      // rotation, never an intermediate half-written pair.
      batch(() => {
        setAngle(screenOrientation.angle)
        setType(screenOrientation.type)
      })
    }

    screenOrientation.addEventListener('change', update)
    tryOnScopeDispose(() => screenOrientation.removeEventListener('change', update))

    return { angle, type }
  }

  // Fallback: derive a coarse orientation from a portrait/landscape media
  // query — `screen.orientation` unsupported (older WebKit).
  const { matches: isPortrait } = useMediaQuery('(orientation: portrait)')
  const angle = (): number => (isPortrait() ? 0 : 90)
  const type = (): OrientationType => (isPortrait() ? 'portrait-primary' : 'landscape-primary')
  return { angle, type }
}
