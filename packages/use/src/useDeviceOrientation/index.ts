/**
 * `useDeviceOrientation` — reactive `deviceorientation` readings
 * (`alpha`/`beta`/`gamma`/`absolute`)
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * **iOS permission caveat**: iOS 13+ Safari requires an explicit, user
 * -gesture-triggered call to `DeviceOrientationEvent.requestPermission()`
 * before `deviceorientation` events fire at all. This composable does
 * **not** call `requestPermission()` itself (it cannot — the call must
 * happen synchronously inside a user gesture handler the composable has no
 * access to) — the CALLER is responsible for requesting permission before
 * (or independent of) using this composable; without it, on iOS,
 * `isSupported()` may read `true` while no event ever arrives.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{alpha()}`, never bare `{alpha}`.
 *
 * SSR (`isClient === false`): returns static `null` getters (`false` for
 * `absolute`, `false` for `isSupported`) and registers no listener — the
 * `isClient` no-op invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'
import { useSupported } from '../useSupported/index.ts'

export interface UseDeviceOrientationReturn {
  /** Reactive getter — whether the `DeviceOrientationEvent` API exists.
   * Read as `{isSupported()}` in templates (parens required). `false`
   * under SSR. Does NOT reflect the iOS permission grant (see module doc)
   * — only feature presence. */
  readonly isSupported: () => boolean
  /** Reactive getter — rotation around the z-axis, degrees `[0, 360)`, or
   * `null` before the first reading. Read as `{alpha()}` (parens
   * required). */
  readonly alpha: () => number | null
  /** Reactive getter — rotation around the x-axis, degrees `[-180, 180]`,
   * or `null` before the first reading. Read as `{beta()}` (parens
   * required). */
  readonly beta: () => number | null
  /** Reactive getter — rotation around the y-axis, degrees `[-90, 90]`, or
   * `null` before the first reading. Read as `{gamma()}` (parens
   * required). */
  readonly gamma: () => number | null
  /** Reactive getter — whether the device provides absolute orientation
   * data. Read as `{absolute()}` (parens required). `false` before the
   * first reading and under SSR. */
  readonly absolute: () => boolean
}

/**
 * Track `deviceorientation` events. Cleans up with the surrounding effect
 * scope (via the underlying `useEventListener`). See module doc for the
 * iOS 13+ permission caveat this composable deliberately does not handle.
 */
export function useDeviceOrientation(): UseDeviceOrientationReturn {
  const isSupported = useSupported(() => typeof DeviceOrientationEvent !== 'undefined')
  const win = defaultWindow

  // SSR: static getters, no signal, no listener.
  if (!isClient || win === undefined) {
    const alpha = (): number | null => null
    const beta = (): number | null => null
    const gamma = (): number | null => null
    const absolute = (): boolean => false
    return { isSupported, alpha, beta, gamma, absolute }
  }

  const [alpha, setAlpha] = signal<number | null>(null)
  const [beta, setBeta] = signal<number | null>(null)
  const [gamma, setGamma] = signal<number | null>(null)
  const [absolute, setAbsolute] = signal(false)

  if (isSupported()) {
    useEventListener(win, 'deviceorientation', (e: DeviceOrientationEvent) => {
      // Batched: readers see ONE consistent (alpha, beta, gamma, absolute)
      // update per event, never an intermediate half-written set.
      batch(() => {
        setAlpha(e.alpha)
        setBeta(e.beta)
        setGamma(e.gamma)
        setAbsolute(e.absolute)
      })
    })
  }

  return { isSupported, alpha, beta, gamma, absolute }
}
