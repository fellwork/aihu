/**
 * `useDeviceMotion` — reactive `devicemotion` readings (`acceleration`,
 * `accelerationIncludingGravity`, `rotationRate`, `interval`)
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * **iOS permission caveat**: iOS 13+ Safari requires an explicit, user
 * -gesture-triggered call to `DeviceMotionEvent.requestPermission()` before
 * `devicemotion` events fire at all. This composable does **not** call
 * `requestPermission()` itself (it cannot — the call must happen
 * synchronously inside a user gesture handler the composable has no access
 * to) — the CALLER is responsible for requesting permission before (or
 * independent of) using this composable; without it, on iOS,
 * `isSupported()` may read `true` while no event ever arrives.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{interval()}`, never bare `{interval}`.
 *
 * SSR (`isClient === false`): returns static `null` getters (`0` for
 * `interval`, `false` for `isSupported`) and registers no listener — the
 * `isClient` no-op invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'
import { useSupported } from '../useSupported/index.ts'

export interface UseDeviceMotionReturn {
  /** Reactive getter — whether the `DeviceMotionEvent` API exists. Read as
   * `{isSupported()}` in templates (parens required). `false` under SSR.
   * Does NOT reflect the iOS permission grant (see module doc) — only
   * feature presence. */
  readonly isSupported: () => boolean
  /** Reactive getter — device acceleration excluding gravity, or `null`
   * before the first reading (also `null` on devices without an
   * accelerometer that filters gravity). Read as `{acceleration()}`
   * (parens required). */
  readonly acceleration: () => DeviceMotionEventAcceleration | null
  /** Reactive getter — device acceleration including gravity, or `null`
   * before the first reading. Read as `{accelerationIncludingGravity()}`
   * (parens required). */
  readonly accelerationIncludingGravity: () => DeviceMotionEventAcceleration | null
  /** Reactive getter — device rotation rate, or `null` before the first
   * reading. Read as `{rotationRate()}` (parens required). */
  readonly rotationRate: () => DeviceMotionEventRotationRate | null
  /** Reactive getter — interval, in ms, at which data is obtained from the
   * underlying hardware. `0` before the first reading and under SSR. Read
   * as `{interval()}` (parens required). */
  readonly interval: () => number
}

/**
 * Track `devicemotion` events. Cleans up with the surrounding effect scope
 * (via the underlying `useEventListener`). See module doc for the iOS 13+
 * permission caveat this composable deliberately does not handle.
 */
export function useDeviceMotion(): UseDeviceMotionReturn {
  const isSupported = useSupported(() => typeof DeviceMotionEvent !== 'undefined')
  const win = defaultWindow

  // SSR: static getters, no signal, no listener.
  if (!isClient || win === undefined) {
    const acceleration = (): DeviceMotionEventAcceleration | null => null
    const accelerationIncludingGravity = (): DeviceMotionEventAcceleration | null => null
    const rotationRate = (): DeviceMotionEventRotationRate | null => null
    const interval = (): number => 0
    return { isSupported, acceleration, accelerationIncludingGravity, rotationRate, interval }
  }

  const [acceleration, setAcceleration] = signal<DeviceMotionEventAcceleration | null>(null)
  const [accelerationIncludingGravity, setAccelerationIncludingGravity] =
    signal<DeviceMotionEventAcceleration | null>(null)
  const [rotationRate, setRotationRate] = signal<DeviceMotionEventRotationRate | null>(null)
  const [interval, setInterval_] = signal(0)

  if (isSupported()) {
    useEventListener(win, 'devicemotion', (e: DeviceMotionEvent) => {
      // Batched: readers see ONE consistent set of updates per event, never
      // an intermediate half-written combination.
      batch(() => {
        setAcceleration(e.acceleration)
        setAccelerationIncludingGravity(e.accelerationIncludingGravity)
        setRotationRate(e.rotationRate)
        setInterval_(e.interval)
      })
    })
  }

  return { isSupported, acceleration, accelerationIncludingGravity, rotationRate, interval }
}
