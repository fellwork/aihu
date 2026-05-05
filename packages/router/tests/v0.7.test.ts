import { describe, expect, it } from 'vitest'
import {
  composeRouterMiddleware,
  defineRouterMiddleware,
  type RouteMatchContext,
  type RouterMiddleware,
  type RouterResult,
} from '../src/index.ts'
import { viteRouterIntegration, viteRouterPlugin } from '../src/plugin.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(pathname = '/test'): RouteMatchContext {
  const url = new URL(`http://localhost${pathname}`)
  return {
    url,
    params: {},
    route: {
      pattern: pathname,
      segments: [{ kind: 'static', path: pathname.slice(1) }],
      module: () => Promise.resolve({ default: {} }),
    },
    signal: new AbortController().signal,
  }
}

const continueResult: RouterResult = { kind: 'continue' }

// ---------------------------------------------------------------------------
// v0.7.1 — defineRouterMiddleware
// ---------------------------------------------------------------------------

describe('@aihu/router v0.7 — defineRouterMiddleware', () => {
  it('returns the passed function unchanged', () => {
    const fn: RouterMiddleware = async (_ctx, next) => next()
    const result = defineRouterMiddleware(fn)
    expect(result).toBe(fn)
  })

  it('produces a callable RouterMiddleware', async () => {
    const mw = defineRouterMiddleware(async (_ctx, next) => next())
    const ctx = makeCtx()
    const res = await mw(ctx, async () => continueResult)
    expect(res).toEqual({ kind: 'continue' })
  })
})

// ---------------------------------------------------------------------------
// v0.7.1 — composeRouterMiddleware
// ---------------------------------------------------------------------------

describe('@aihu/router v0.7 — composeRouterMiddleware', () => {
  it('calls middlewares left-to-right (chaining via next)', async () => {
    const order: string[] = []
    const a = defineRouterMiddleware(async (_ctx, next) => {
      order.push('a-before')
      const r = await next()
      order.push('a-after')
      return r
    })
    const b = defineRouterMiddleware(async (_ctx, next) => {
      order.push('b')
      return next()
    })
    const composed = composeRouterMiddleware(a, b)
    await composed(makeCtx(), async () => {
      order.push('handler')
      return continueResult
    })
    expect(order).toEqual(['a-before', 'b', 'handler', 'a-after'])
  })

  it('redirect result short-circuits the chain', async () => {
    const handlerCalled = { value: false }
    const redirectMw = defineRouterMiddleware(async () => ({
      kind: 'redirect' as const,
      location: '/login',
      status: 302,
    }))
    const laterMw = defineRouterMiddleware(async (_ctx, next) => next())
    const composed = composeRouterMiddleware(redirectMw, laterMw)
    const res = await composed(makeCtx(), async () => {
      handlerCalled.value = true
      return continueResult
    })
    expect(res).toEqual({ kind: 'redirect', location: '/login', status: 302 })
    expect(handlerCalled.value).toBe(false)
  })

  it('continue result propagates through to next()', async () => {
    const composed = composeRouterMiddleware(
      defineRouterMiddleware(async (_ctx, next) => next()),
      defineRouterMiddleware(async (_ctx, next) => next()),
    )
    const res = await composed(makeCtx(), async () => continueResult)
    expect(res.kind).toBe('continue')
  })

  it('with zero middlewares, calls next() directly', async () => {
    const composed = composeRouterMiddleware()
    const res = await composed(makeCtx(), async () => continueResult)
    expect(res.kind).toBe('continue')
  })

  it('cancel result stops propagation', async () => {
    const later = { called: false }
    const composed = composeRouterMiddleware(
      defineRouterMiddleware(async () => ({
        kind: 'cancel' as const,
        status: 403,
        body: 'Forbidden',
      })),
      defineRouterMiddleware(async (_ctx, next) => {
        later.called = true
        return next()
      }),
    )
    const res = await composed(makeCtx(), async () => continueResult)
    expect(res).toEqual({ kind: 'cancel', status: 403, body: 'Forbidden' })
    expect(later.called).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// v0.7.4 — viteRouterIntegration export from @aihu/router/plugin
// ---------------------------------------------------------------------------

describe('@aihu/router v0.7.4 — viteRouterIntegration naming', () => {
  it('viteRouterIntegration is exported from @aihu/router/plugin', () => {
    expect(typeof viteRouterIntegration).toBe('function')
  })

  it('viteRouterIntegration() returns a valid Vite plugin', () => {
    const plugin = viteRouterIntegration()
    expect(plugin.name).toBe('aihu-router')
    expect(typeof plugin.resolveId).toBe('function')
    expect(typeof plugin.load).toBe('function')
  })

  it('viteRouterPlugin (deprecated alias) still works', () => {
    const plugin = viteRouterPlugin()
    expect(plugin.name).toBe('aihu-router')
  })

  it('viteRouterIntegration === viteRouterPlugin (same function reference)', () => {
    // Both names point at the same underlying function.
    expect(viteRouterIntegration).toBe(viteRouterPlugin)
  })
})
