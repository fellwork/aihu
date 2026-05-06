/**
 * arch-5 M1 — `$beforeNavigate` and `$afterNavigate` guard chain
 * (RFC-A5-015 / RFC-A5-016).
 *
 * Acceptance (§7):
 * - `$beforeNavigate`: "next(false) cancels navigation; next('/x') redirects;
 *   multiple guards run in declaration order."
 * - `$afterNavigate`: "Receives `to` and `from`; runs after DOM updated for
 *   new route."
 */

import { runWithContext } from '@aihu/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindRouteSignalWriter,
  createRouter,
  createRouteSignal,
  navigate,
  RouteContext,
  type RouteContextValue,
  type RouteDefinition,
} from '../src/index.ts'

const userRoute = (pattern: string): RouteDefinition => ({
  pattern,
  segments: pattern
    .split('/')
    .filter(Boolean)
    .map((p) =>
      p.startsWith(':')
        ? { kind: 'param' as const, name: p.slice(1) }
        : { kind: 'static' as const, path: p },
    ),
  module: () => Promise.resolve({ default: { toHtml: () => `<p>${pattern}</p>` } }),
})

function setup() {
  const router = createRouter([userRoute('/'), userRoute('/about'), userRoute('/login')])
  const sig = createRouteSignal(router)
  const ctxValue: RouteContextValue = { router, current: sig.read }
  bindRouteSignalWriter(ctxValue, sig.write)
  const map = new Map<symbol, unknown>()
  map.set(RouteContext._id, ctxValue)
  return { router, ctxValue, map, dispose: () => sig.dispose() }
}

describe('runBeforeGuards — RFC-A5-015 cancel/redirect/proceed', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('next(false) cancels navigation', async () => {
    const { router, map, ctxValue, dispose } = setup()
    router.registerBeforeGuard((_to, _from, next) => next(false))
    await runWithContext(map, async () => {
      const result = await navigate('/about')
      expect(result).toBe('cancelled')
    })
    expect(ctxValue.current()?.pathname).toBe('/')
    dispose()
  })

  it("next('/login') redirects", async () => {
    const { router, map, ctxValue, dispose } = setup()
    router.registerBeforeGuard((to, _from, next) => {
      if (to.pathname === '/about') next('/login')
      else next()
    })
    await runWithContext(map, async () => {
      await navigate('/about')
    })
    expect(ctxValue.current()?.pathname).toBe('/login')
    dispose()
  })

  it('multiple guards run in registration order; first cancel wins', async () => {
    const { router, map, dispose } = setup()
    const order: number[] = []
    router.registerBeforeGuard((_t, _f, next) => {
      order.push(1)
      next()
    })
    router.registerBeforeGuard((_t, _f, next) => {
      order.push(2)
      next(false)
    })
    router.registerBeforeGuard((_t, _f, next) => {
      order.push(3)
      next()
    })
    await runWithContext(map, async () => {
      const result = await navigate('/about')
      expect(result).toBe('cancelled')
    })
    expect(order).toEqual([1, 2]) // 3 must NOT run
    dispose()
  })

  it('guards receive `to` and `from`', async () => {
    const { router, map, dispose } = setup()
    let captured: { to: string | null; from: string | null } = { to: null, from: null }
    router.registerBeforeGuard((to, from, next) => {
      captured = { to: to.pathname, from: from?.pathname ?? null }
      next()
    })
    await runWithContext(map, async () => {
      await navigate('/about')
    })
    expect(captured.to).toBe('/about')
    expect(captured.from).toBe('/')
    dispose()
  })

  it('async guards are awaited', async () => {
    const { router, map, dispose } = setup()
    let asyncRan = false
    router.registerBeforeGuard(async (_t, _f, next) => {
      await new Promise((r) => setTimeout(r, 5))
      asyncRan = true
      next()
    })
    await runWithContext(map, async () => {
      await navigate('/about')
    })
    expect(asyncRan).toBe(true)
    dispose()
  })
})

describe('registerAfterGuard — RFC-A5-016', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('after-guard receives to/from after navigation commits', async () => {
    const { router, map, ctxValue, dispose } = setup()
    let observed: { to: string | null; from: string | null; pathnameAtCall: string | null } = {
      to: null,
      from: null,
      pathnameAtCall: null,
    }
    router.registerAfterGuard((to, from) => {
      observed = {
        to: to.pathname,
        from: from?.pathname ?? null,
        pathnameAtCall: ctxValue.current()?.pathname ?? null,
      }
    })
    await runWithContext(map, async () => {
      await navigate('/about')
    })
    expect(observed.to).toBe('/about')
    expect(observed.from).toBe('/')
    // After-guard must run AFTER the route signal updated.
    expect(observed.pathnameAtCall).toBe('/about')
    dispose()
  })

  it('one after-guard throwing does not strand siblings', async () => {
    const { router, map, dispose } = setup()
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    let secondRan = false
    router.registerAfterGuard(() => {
      throw new Error('boom')
    })
    router.registerAfterGuard(() => {
      secondRan = true
    })
    await runWithContext(map, async () => {
      await navigate('/about')
    })
    expect(secondRan).toBe(true)
    consoleErr.mockRestore()
    dispose()
  })

  it('dispose returned by registerAfterGuard removes it', async () => {
    const { router, map, dispose } = setup()
    let calls = 0
    const off = router.registerAfterGuard(() => {
      calls += 1
    })
    await runWithContext(map, async () => {
      await navigate('/about')
    })
    expect(calls).toBe(1)
    off()
    await runWithContext(map, async () => {
      await navigate('/login')
    })
    expect(calls).toBe(1) // unchanged
    dispose()
  })
})
