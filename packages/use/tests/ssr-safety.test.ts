/**
 * SSR-safety GATE — plan-mandated enforcement of the `isClient` no-op
 * invariant (effect-scope plan §3: the library's sole SSR defense while the
 * platform `__ssr` scope wrap is deferred).
 *
 * Table-driven over every composable entry: each row imports its entry under
 * stubbed-absent `window`/`document`/`navigator` and asserts ZERO side
 * effects — no `addEventListener`, no `setTimeout`/`setInterval`/
 * `requestAnimationFrame`, and a return value that works without a DOM.
 *
 * **Adding composable #3..#25 to the library REQUIRES adding a row here** —
 * this is the safety net for the fan-out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withSSR } from './_ssr.ts'

type AnyFn = (...args: unknown[]) => unknown

/** Spy the side-effect globals for the duration of `run`, asserting none
 * was called. (With `window` stubbed absent, jsdom's globals still exist on
 * `globalThis` — a leaking composable would reach them there.) */
function withGlobalSpies(run: () => void): void {
  const g = globalThis as unknown as Record<string, AnyFn>
  const names = ['addEventListener', 'setTimeout', 'setInterval', 'requestAnimationFrame']
  const spies = names.filter((n) => typeof g[n] === 'function').map((n) => vi.spyOn(g, n))
  try {
    run()
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  } finally {
    for (const s of spies) s.mockRestore()
  }
}

/** One row per composable entry. New composables MUST add a row. */
const entries: Array<{ entry: string; run: () => Promise<void> }> = [
  {
    entry: 'useEventListener',
    run: () =>
      withSSR(
        () => import('../src/useEventListener/index.ts'),
        ({ useEventListener }) => {
          withGlobalSpies(() => {
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
            const el = target as unknown as Element
            // Static AND getter targets: nothing registered, stop is a no-op
            // (the isClient gate precedes the typeof-function branch, so no
            // effect is created either).
            const stopStatic = useEventListener(el, 'click', () => {})
            const stopGetter = useEventListener(
              () => el,
              'click',
              () => {},
            )
            expect(() => {
              stopStatic()
              stopGetter()
            }).not.toThrow()
            expect(target.addEventListener).not.toHaveBeenCalled()
            expect(target.removeEventListener).not.toHaveBeenCalled()
          })
        },
      ),
  },
  {
    entry: 'useMouse',
    run: () =>
      withSSR(
        () => import('../src/useMouse/index.ts'),
        ({ useMouse }) => {
          withGlobalSpies(() => {
            const { x, y } = useMouse({ initialValue: { x: 3, y: 4 } })
            expect(x()).toBe(3)
            expect(y()).toBe(4)
            const zero = useMouse()
            expect(zero.x()).toBe(0)
            expect(zero.y()).toBe(0)
          })
        },
      ),
  },
  {
    entry: 'useToggle',
    run: () =>
      withSSR(
        () => import('../src/useToggle/index.ts'),
        ({ useToggle }) => {
          withGlobalSpies(() => {
            const [on, toggle] = useToggle(true)
            expect(on()).toBe(true)
            expect(() => toggle()).not.toThrow()
            expect(on()).toBe(true)
          })
        },
      ),
  },
  {
    entry: 'useCounter',
    run: () =>
      withSSR(
        () => import('../src/useCounter/index.ts'),
        ({ useCounter }) => {
          withGlobalSpies(() => {
            const { count, inc, dec, set, reset } = useCounter({ initial: 3 })
            expect(count()).toBe(3)
            inc()
            dec()
            set(9)
            reset()
            expect(count()).toBe(3)
          })
        },
      ),
  },
  {
    entry: 'usePrevious',
    run: () =>
      withSSR(
        () => import('../src/usePrevious/index.ts'),
        ({ usePrevious }) => {
          withGlobalSpies(() => {
            const source = vi.fn(() => 1)
            const previous = usePrevious(source)
            expect(previous()).toBeUndefined()
            expect(source).not.toHaveBeenCalled()
          })
        },
      ),
  },
  {
    entry: 'useSupported',
    run: () =>
      withSSR(
        () => import('../src/useSupported/index.ts'),
        ({ useSupported }) => {
          withGlobalSpies(() => {
            const predicate = vi.fn(() => true)
            const supported = useSupported(predicate)
            expect(supported()).toBe(false)
            expect(predicate).not.toHaveBeenCalled()
          })
        },
      ),
  },
  {
    entry: 'useIntervalFn',
    run: () =>
      withSSR(
        () => import('../src/useIntervalFn/index.ts'),
        ({ useIntervalFn }) => {
          withGlobalSpies(() => {
            const { isActive, pause, resume } = useIntervalFn(() => {}, 100)
            expect(isActive()).toBe(false)
            expect(() => {
              pause()
              resume()
            }).not.toThrow()
          })
        },
      ),
  },
  {
    entry: 'useTimeoutFn',
    run: () =>
      withSSR(
        () => import('../src/useTimeoutFn/index.ts'),
        ({ useTimeoutFn }) => {
          withGlobalSpies(() => {
            const { isPending, start, stop } = useTimeoutFn(() => {}, 100)
            expect(isPending()).toBe(false)
            expect(() => {
              start()
              stop()
            }).not.toThrow()
          })
        },
      ),
  },
  {
    entry: 'useRafFn',
    run: () =>
      withSSR(
        () => import('../src/useRafFn/index.ts'),
        ({ useRafFn }) => {
          withGlobalSpies(() => {
            const { isActive, pause, resume } = useRafFn(() => {})
            expect(isActive()).toBe(false)
            expect(() => {
              pause()
              resume()
            }).not.toThrow()
          })
        },
      ),
  },
  {
    entry: 'useNow',
    run: () =>
      withSSR(
        () => import('../src/useNow/index.ts'),
        ({ useNow }) => {
          withGlobalSpies(() => {
            const { now } = useNow()
            expect(now()).toBeInstanceOf(Date)
            expect(now()).toBe(now())
          })
        },
      ),
  },
  {
    entry: 'useDebounced',
    run: () =>
      withSSR(
        () => import('../src/useDebounced/index.ts'),
        ({ useDebounced }) => {
          withGlobalSpies(() => {
            const { value } = useDebounced(() => 7, 100)
            expect(value()).toBe(7)
          })
        },
      ),
  },
  {
    entry: 'useThrottle',
    run: () =>
      withSSR(
        () => import('../src/useThrottle/index.ts'),
        ({ useThrottle }) => {
          withGlobalSpies(() => {
            const { value } = useThrottle(() => 9, 100)
            expect(value()).toBe(9)
          })
        },
      ),
  },
  {
    entry: 'useElementSize',
    run: () =>
      withSSR(
        () => import('../src/useElementSize/index.ts'),
        ({ useElementSize }) => {
          withGlobalSpies(() => {
            const { width, height } = useElementSize({ initialSize: { width: 3, height: 4 } })
            expect(width()).toBe(3)
            expect(height()).toBe(4)
            const zero = useElementSize()
            expect(zero.width()).toBe(0)
            expect(zero.height()).toBe(0)
          })
        },
      ),
  },
  {
    entry: 'useElementVisibility',
    run: () =>
      withSSR(
        () => import('../src/useElementVisibility/index.ts'),
        ({ useElementVisibility }) => {
          withGlobalSpies(() => {
            const { isVisible } = useElementVisibility()
            expect(isVisible()).toBe(false)
            const truthy = useElementVisibility({ initialValue: true })
            expect(truthy.isVisible()).toBe(true)
          })
        },
      ),
  },
  {
    entry: 'useScroll',
    run: () =>
      withSSR(
        () => import('../src/useScroll/index.ts'),
        ({ useScroll }) => {
          withGlobalSpies(() => {
            const { x, y } = useScroll({ initialValue: { x: 3, y: 4 } })
            expect(x()).toBe(3)
            expect(y()).toBe(4)
          })
        },
      ),
  },
  {
    entry: 'useWindowSize',
    run: () =>
      withSSR(
        () => import('../src/useWindowSize/index.ts'),
        ({ useWindowSize }) => {
          withGlobalSpies(() => {
            const { width, height } = useWindowSize({ initialWidth: 3, initialHeight: 4 })
            expect(width()).toBe(3)
            expect(height()).toBe(4)
            const zero = useWindowSize()
            expect(zero.width()).toBe(0)
            expect(zero.height()).toBe(0)
          })
        },
      ),
  },
  {
    entry: 'useMediaQuery',
    run: () =>
      withSSR(
        () => import('../src/useMediaQuery/index.ts'),
        ({ useMediaQuery }) => {
          withGlobalSpies(() => {
            const { matches } = useMediaQuery('(prefers-color-scheme: dark)')
            expect(matches()).toBe(false)
          })
        },
      ),
  },
  {
    entry: 'usePreferredDark',
    run: () =>
      withSSR(
        () => import('../src/usePreferredDark/index.ts'),
        ({ usePreferredDark }) => {
          withGlobalSpies(() => {
            const { prefersDark } = usePreferredDark()
            expect(prefersDark()).toBe(false)
          })
        },
      ),
  },
  {
    entry: 'useColorScheme',
    run: () =>
      withSSR(
        () => import('../src/useColorScheme/index.ts'),
        ({ useColorScheme }) => {
          withGlobalSpies(() => {
            const { scheme, resolved } = useColorScheme()
            expect(scheme()).toBe('auto')
            expect(resolved()).toBe('light')
          })
        },
      ),
  },
  {
    entry: 'useDocumentVisibility',
    run: () =>
      withSSR(
        () => import('../src/useDocumentVisibility/index.ts'),
        ({ useDocumentVisibility }) => {
          withGlobalSpies(() => {
            const { visibility } = useDocumentVisibility()
            expect(visibility()).toBe('visible')
          })
        },
      ),
  },
  {
    entry: 'useLocalStorage',
    run: () =>
      withSSR(
        () => import('../src/useLocalStorage/index.ts'),
        ({ useLocalStorage }) => {
          withGlobalSpies(() => {
            const { value, setValue } = useLocalStorage('k', 7)
            expect(value()).toBe(7)
            expect(() => setValue(8)).not.toThrow()
            expect(value()).toBe(7) // SSR setValue is a documented no-op
          })
        },
      ),
  },
  {
    entry: 'useClipboard',
    run: () =>
      withSSR(
        () => import('../src/useClipboard/index.ts'),
        ({ useClipboard }) => {
          withGlobalSpies(() => {
            const { isSupported, copied } = useClipboard()
            expect(isSupported()).toBe(false)
            expect(copied()).toBe(false)
          })
        },
      ),
  },
]

describe('@aihu/use — SSR-safety gate (isClient no-op invariant)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  for (const { entry, run } of entries) {
    it(`${entry}: zero side effects under simulated SSR`, run)
  }

  it('shared: isClient is false and the default globals are undefined under SSR', () =>
    withSSR(
      () => import('../src/shared/index.ts'),
      (shared) => {
        expect(shared.isClient).toBe(false)
        expect(shared.defaultWindow).toBeUndefined()
        expect(shared.defaultDocument).toBeUndefined()
        expect(shared.defaultNavigator).toBeUndefined()
      },
    ))

  it('shared: tryOnMounted is a no-op under SSR', () =>
    withSSR(
      () => import('../src/shared/index.ts'),
      (shared) => {
        const fn = vi.fn()
        shared.tryOnMounted(fn)
        expect(fn).not.toHaveBeenCalled()
      },
    ))
})
