/**
 * `useNetworkState` — `navigator.onLine` plus the (non-standard, Chromium/
 * Android-only) Network Information API (`effectiveType`, `downlink`,
 * `rtt`, `saveData`), updated on `online`/`offline`/connection `change`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isOnline()}`, never bare `{isOnline}`.
 *
 * SSR (`isClient === false`): returns static getters — `isOnline` defaults
 * to `true` (there is no way to know otherwise, and "assume reachable" is
 * the least-surprising default for SSR-rendered UI), the Network
 * Information fields default to `undefined`, `isSupported` to `false` —
 * and registers no listener, the isClient no-op invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultNavigator, defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

/** The non-standard `navigator.connection` shape (Network Information API,
 * Chromium/Android only — absent on Firefox, Safari, and all of desktop
 * Safari/WebKit). Minimal surface; not in TS's lib.dom.d.ts. */
interface NetworkInformation extends EventTarget {
  readonly effectiveType?: '2g' | '3g' | '4g' | 'slow-2g'
  readonly downlink?: number
  readonly rtt?: number
  readonly saveData?: boolean
}

function getConnection(nav: Navigator): NetworkInformation | undefined {
  // `connection` is the standard-track name; `mozConnection`/
  // `webkitConnection` were legacy vendor-prefixed names on older
  // Firefox/WebKit builds that never shipped the unprefixed form.
  const n = nav as Navigator & {
    connection?: NetworkInformation
    mozConnection?: NetworkInformation
    webkitConnection?: NetworkInformation
  }
  return n.connection ?? n.mozConnection ?? n.webkitConnection
}

export interface UseNetworkStateOptions {
  /** The `window` to listen for `online`/`offline` on. Default the global
   * `window`. */
  window?: Window
  /** The `navigator` to read `onLine`/`connection` from. Default the
   * global `navigator`. */
  navigator?: Navigator
}

export interface UseNetworkStateReturn {
  /** Reactive getter — read as `{isOnline()}` in templates (parens
   * required). Mirrors `navigator.onLine`. `true` under SSR (see module
   * doc). */
  readonly isOnline: () => boolean
  /** Reactive getter — Network Information API's connection type estimate
   * (`'4g'`, `'3g'`, …), or `undefined` when unsupported. */
  readonly effectiveType: () => string | undefined
  /** Reactive getter — estimated downlink bandwidth in Mbps, or
   * `undefined` when unsupported. */
  readonly downlink: () => number | undefined
  /** Reactive getter — estimated round-trip time in ms, or `undefined`
   * when unsupported. */
  readonly rtt: () => number | undefined
  /** Reactive getter — the user's data-saver preference, or `undefined`
   * when unsupported. */
  readonly saveData: () => boolean | undefined
  /** `true` when the Network Information API (`navigator.connection` or a
   * vendor-prefixed equivalent) is present in this environment. Static —
   * computed once at call time, support does not change mid-session. */
  readonly isSupported: () => boolean
}

/**
 * Track online/offline status and (where supported) connection-quality
 * hints. Cleans up with the surrounding effect scope; scopeless callers
 * keep the listeners for the page's lifetime.
 */
export function useNetworkState(options: UseNetworkStateOptions = {}): UseNetworkStateReturn {
  const { window: win = defaultWindow, navigator: nav = defaultNavigator } = options

  // SSR (or no window/navigator): static getters, no signal, no listener.
  if (!isClient || win === undefined || nav === undefined) {
    return {
      isOnline: () => true,
      effectiveType: () => undefined,
      downlink: () => undefined,
      rtt: () => undefined,
      saveData: () => undefined,
      isSupported: () => false,
    }
  }

  const connection = getConnection(nav)

  const [isOnline, setIsOnline] = signal(nav.onLine)
  const [effectiveType, setEffectiveType] = signal<string | undefined>(connection?.effectiveType)
  const [downlink, setDownlink] = signal<number | undefined>(connection?.downlink)
  const [rtt, setRtt] = signal<number | undefined>(connection?.rtt)
  const [saveData, setSaveData] = signal<boolean | undefined>(connection?.saveData)

  useEventListener(win, 'online', () => setIsOnline(true))
  useEventListener(win, 'offline', () => setIsOnline(false))

  if (connection !== undefined) {
    // `NetworkInformation` implements the `EventTarget` interface
    // (add/removeEventListener) but isn't a `Window`/`Document`/`Element` —
    // none of `useEventListener`'s DOM-typed overloads accept it. The
    // runtime dispatch only ever calls add/removeEventListener regardless
    // of the static target type, so this cast is functionally sound; it
    // just steps outside what the overloads can express.
    useEventListener(connection as unknown as Window, 'change', () => {
      // Batched: observers see ONE consistent 4-field update per change
      // event, never an intermediate half-written combination.
      batch(() => {
        setEffectiveType(connection.effectiveType)
        setDownlink(connection.downlink)
        setRtt(connection.rtt)
        setSaveData(connection.saveData)
      })
    })
  }

  return {
    isOnline,
    effectiveType,
    downlink,
    rtt,
    saveData,
    isSupported: () => connection !== undefined,
  }
}
