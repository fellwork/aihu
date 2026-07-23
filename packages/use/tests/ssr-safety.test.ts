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
