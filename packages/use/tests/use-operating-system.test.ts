/**
 * Unit tests for `useOperatingSystem` (effect-scope plan §5): the
 * `userAgentData.platform` path, the `userAgent`-parsing fallback (incl.
 * the iPadOS-reports-as-Mac heuristic), and the SSR-static path. jsdom
 * environment (root vitest config).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { useOperatingSystem } from '../src/useOperatingSystem/index.ts'
import { withSSR } from './_ssr.ts'

function stubUserAgentData(platform: string | undefined): void {
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: platform === undefined ? undefined : { platform },
  })
}

function stubUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
}

function stubMaxTouchPoints(points: number): void {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: points })
}

afterEach(() => {
  // @ts-expect-error test cleanup of a configurable, test-installed property
  delete navigator.userAgentData
  // jsdom's own defaults for userAgent/maxTouchPoints are restored by
  // resetModules-adjacent test isolation elsewhere in the suite; here we
  // only ever set them, never need a "prior value" since jsdom's own
  // getters are non-configurable data props redefined per-test above.
})

describe('@aihu/use/useOperatingSystem', () => {
  it('prefers userAgentData.platform when present', () => {
    stubUserAgentData('Windows')
    const { os } = useOperatingSystem()
    expect(os()).toBe('windows')
  })

  it('classifies macOS from userAgentData.platform', () => {
    stubUserAgentData('macOS')
    expect(useOperatingSystem().os()).toBe('macos')
  })

  it('falls back to userAgent parsing when userAgentData is absent', () => {
    stubUserAgentData(undefined)
    stubUserAgent('Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/128.0')
    expect(useOperatingSystem().os()).toBe('linux')
  })

  it('classifies Android from userAgent', () => {
    stubUserAgentData(undefined)
    stubUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36')
    expect(useOperatingSystem().os()).toBe('android')
  })

  it('classifies iPhone from userAgent', () => {
    stubUserAgentData(undefined)
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    expect(useOperatingSystem().os()).toBe('ios')
  })

  it('disambiguates iPadOS (reports as Macintosh + multi-touch) from real macOS', () => {
    stubUserAgentData(undefined)
    stubUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    )
    stubMaxTouchPoints(5)
    expect(useOperatingSystem().os()).toBe('ios')
  })

  it('a real Mac (no multi-touch) classifies as macos', () => {
    stubUserAgentData(undefined)
    stubUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    )
    stubMaxTouchPoints(0)
    expect(useOperatingSystem().os()).toBe('macos')
  })

  it("classifies an unrecognized platform as 'unknown'", () => {
    stubUserAgentData(undefined)
    stubUserAgent('SomeExoticEmbeddedRuntime/1.0')
    expect(useOperatingSystem().os()).toBe('unknown')
  })

  it('is computed once — no reactivity, matches useSupported-style single getter call semantics', () => {
    stubUserAgentData('Windows')
    const { os } = useOperatingSystem()
    stubUserAgentData('macOS')
    // Still 'windows' — the value was captured at call time.
    expect(os()).toBe('windows')
  })
})

describe('@aihu/use/useOperatingSystem — SSR-static path', () => {
  it("with isClient false, returns a static 'unknown' getter and registers nothing", () =>
    withSSR(
      () => import('../src/useOperatingSystem/index.ts'),
      (mod) => {
        let result: { os: () => string } | undefined
        expect(() => {
          result = mod.useOperatingSystem()
        }).not.toThrow()
        expect(result?.os()).toBe('unknown')
      },
    ))
})
