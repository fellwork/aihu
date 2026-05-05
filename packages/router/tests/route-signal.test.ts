/**
 * arch-5 M1 — `createRouteSignal` (RFC-A5-010 backing).
 *
 * Acceptance (§7): "Signal updates on popstate; `params` matches
 * `MatchResult.params` from `packages/router/src/router.ts:24`."
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteDefinition } from '../src/index.ts'
import {
  bindRouteSignalWriter,
  createRouter,
  createRouteSignal,
  navigate,
  provideRouteContext,
  type RouteContextValue,
  RouteContext,
  useRoute,
  useRouter,
} from '../src/index.ts'
import { runWithContext } from '@aihu/context'

// ---------------------------------------------------------------------------
// JSDOM-like history shim (vitest in node uses jsdom by default per env hint
// in vitest.config.ts — but we still gate on `window` for safety).
// ---------------------------------------------------------------------------

const userRoute = (pattern: string): RouteDefinition => ({
  pattern,
  segments: pattern
    .split('/')
    .filter(Boolean)
    .map((p) =>
      p.startsWith(':') ? { kind: 'param' as const, name: p.slice(1) } : { kind: 'static' as const, path: p },
    ),
  module: () => Promise.resolve({ default: { toHtml: () => `<p>${pattern}</p>` } }),
})

describe('@aihu/router — createRouteSignal', () => {
  let originalPath: string

  beforeEach(() => {
    originalPath = window.location.pathname
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.history.replaceState(null, '', originalPath)
  })

  it('initialises to the current pathname match on construction', () => {
    const router = createRouter([userRoute('/'), userRoute('/users/:id')])
    window.history.replaceState(null, '', '/users/42')
    const sig = createRouteSignal(router)
    const m = sig.read()
    expect(m).not.toBeNull()
    expect(m?.params).toEqual({ id: '42' })
    expect(m?.pathname).toBe('/users/42')
    sig.dispose()
  })

  it('updates on a popstate event after replaceState + dispatchEvent', () => {
    const router = createRouter([userRoute('/'), userRoute('/posts/:slug')])
    const sig = createRouteSignal(router)
    expect(sig.read()?.pathname).toBe('/')

    window.history.pushState(null, '', '/posts/hello')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(sig.read()?.pathname).toBe('/posts/hello')
    expect(sig.read()?.params).toEqual({ slug: 'hello' })
    sig.dispose()
  })

  it('returns null for unmatched paths', () => {
    const router = createRouter([userRoute('/')])
    window.history.replaceState(null, '', '/no-such-route')
    const sig = createRouteSignal(router)
    expect(sig.read()).toBeNull()
    sig.dispose()
  })

  it('dispose() removes the popstate listener', () => {
    const router = createRouter([userRoute('/'), userRoute('/about')])
    const sig = createRouteSignal(router)
    sig.dispose()

    window.history.pushState(null, '', '/about')
    window.dispatchEvent(new PopStateEvent('popstate'))

    // After dispose, the read fn still returns last value but the listener is gone.
    // We can't directly assert listener count, but a subsequent popstate must not
    // change the signal — rebuild a fresh one to confirm dispose really detached.
    expect(sig.read()?.pathname).toBe('/')
  })
})

describe('@aihu/router — useRoute / useRouter / RouteContext', () => {
  it('returns null when no router context is active', () => {
    expect(useRoute()).toBeNull()
    expect(useRouter()).toBeNull()
  })

  it('reads the current match through RouteContext via runWithContext', () => {
    const router = createRouter([userRoute('/'), userRoute('/x/:y')])
    window.history.replaceState(null, '', '/x/abc')
    const sig = createRouteSignal(router)
    const ctxValue: RouteContextValue = {
      router,
      current: sig.read,
      viewTransitions: false,
    }
    bindRouteSignalWriter(ctxValue, sig.write)
    const map = new Map<symbol, unknown>()
    map.set(RouteContext._id, ctxValue)
    runWithContext(map, () => {
      expect(useRouter()).toBe(router)
      const m = useRoute()
      expect(m?.params).toEqual({ y: 'abc' })
    })
    sig.dispose()
  })
})

describe('@aihu/router — navigate()', () => {
  it('calls history.pushState and updates the route signal', async () => {
    const router = createRouter([userRoute('/'), userRoute('/users/:id')])
    const sig = createRouteSignal(router)
    const ctxValue: RouteContextValue = { router, current: sig.read }
    bindRouteSignalWriter(ctxValue, sig.write)
    const map = new Map<symbol, unknown>()
    map.set(RouteContext._id, ctxValue)

    const pushSpy = vi.spyOn(window.history, 'pushState')

    await runWithContext(map, async () => {
      const result = await navigate('/users/7')
      expect(result).toBe('navigated')
    })

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/users/7')
    expect(sig.read()?.params).toEqual({ id: '7' })

    pushSpy.mockRestore()
    sig.dispose()
  })

  it('calls history.replaceState when {replace: true}', async () => {
    const router = createRouter([userRoute('/'), userRoute('/x')])
    const sig = createRouteSignal(router)
    const ctxValue: RouteContextValue = { router, current: sig.read }
    bindRouteSignalWriter(ctxValue, sig.write)
    const map = new Map<symbol, unknown>()
    map.set(RouteContext._id, ctxValue)

    const replaceSpy = vi.spyOn(window.history, 'replaceState')

    await runWithContext(map, async () => {
      await navigate('/x', { replace: true })
    })

    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/x')

    replaceSpy.mockRestore()
    sig.dispose()
  })
})
