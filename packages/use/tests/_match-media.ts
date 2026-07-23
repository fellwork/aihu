/**
 * Minimal `window.matchMedia` polyfill for jsdom (which does not implement
 * it) — enough surface for `useMediaQuery`/`usePreferredDark`/
 * `useColorScheme` tests: a per-query singleton `MediaQueryList`-shaped
 * `EventTarget` with a settable `.matches`, both the modern
 * `addEventListener`/`removeEventListener('change', …)` form and the legacy
 * `addListener`/`removeListener` alias, and a `dispatchEvent(new Event(...))`
 * driven `change` (tests set `.matches` then dispatch, mirroring how a real
 * browser fires `MediaQueryListEvent`).
 *
 * Call `installMatchMediaPolyfill()` once per test file (top-level, before
 * any `describe`/`it`) — it is idempotent-safe to call in a `beforeEach` too
 * (returns the same per-query instance across calls within the same test
 * run so `window.matchMedia(q)` called from inside the composable observes
 * the same object the test drives).
 */
import { afterEach, beforeEach } from 'vitest'

class FakeMediaQueryList extends EventTarget {
  matches: boolean
  readonly media: string

  constructor(media: string, matches: boolean) {
    super()
    this.media = media
    this.matches = matches
  }

  addListener(listener: (e: Event) => void): void {
    this.addEventListener('change', listener)
  }

  removeListener(listener: (e: Event) => void): void {
    this.removeEventListener('change', listener)
  }
}

export function installMatchMediaPolyfill(): void {
  let instances: Map<string, FakeMediaQueryList>

  beforeEach(() => {
    instances = new Map()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string): FakeMediaQueryList => {
        let mql = instances.get(query)
        if (mql === undefined) {
          // `(prefers-color-scheme: dark)` starts unmatched — deterministic
          // across test runners with different OS themes.
          mql = new FakeMediaQueryList(query, false)
          instances.set(query, mql)
        }
        return mql
      },
    })
  })

  afterEach(() => {
    // @ts-expect-error test cleanup of a configurable, test-installed property
    delete window.matchMedia
  })
}

/** Fire a `change` event on `mql`, updating `.matches` first (mirrors a real
 * `MediaQueryListEvent`, which carries the new `matches` value). */
export function fireMatchMediaChange(mql: FakeMediaQueryList, matches: boolean): void {
  mql.matches = matches
  mql.dispatchEvent(Object.assign(new Event('change'), { matches, media: mql.media }))
}
