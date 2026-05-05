import { describe, expect, it, vi } from 'vitest'
import { composeMiddleware, defineMiddleware } from '../src/middleware.ts'
import type { Middleware } from '../src/types.ts'

describe('@aihu/server middleware', () => {
  it('defineMiddleware returns the same function reference', () => {
    const mw: Middleware = async (_req, next) => next()
    expect(defineMiddleware(mw)).toBe(mw)
  })

  it('composeMiddleware([]) calls next directly', async () => {
    const composed = composeMiddleware([])
    const next = vi.fn(async () => new Response('ok'))
    const req = new Request('https://example.com/')
    const res = await composed(req, next)
    expect(next).toHaveBeenCalledOnce()
    expect(await res.text()).toBe('ok')
  })

  it('composeMiddleware([mw1, mw2]) calls mw1 first then mw2', async () => {
    const order: number[] = []
    const mw1: Middleware = async (_req, next) => {
      order.push(1)
      const res = await next()
      order.push(3)
      return res
    }
    const mw2: Middleware = async (_req, next) => {
      order.push(2)
      return next()
    }
    const composed = composeMiddleware([mw1, mw2])
    const req = new Request('https://example.com/')
    await composed(req, async () => new Response('done'))
    expect(order).toEqual([1, 2, 3])
  })

  it('composeMiddleware([mw]) where mw returns early — next NOT called', async () => {
    const next = vi.fn(async () => new Response('fallback'))
    const mw: Middleware = async () => new Response('early exit', { status: 401 })
    const composed = composeMiddleware([mw])
    const req = new Request('https://example.com/')
    const res = await composed(req, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })

  it('composeMiddleware passes request through to each middleware', async () => {
    const seenUrls: string[] = []
    const mw1: Middleware = async (req, next) => {
      seenUrls.push(req.url)
      return next()
    }
    const mw2: Middleware = async (req, next) => {
      seenUrls.push(req.url)
      return next()
    }
    const composed = composeMiddleware([mw1, mw2])
    const req = new Request('https://example.com/test')
    await composed(req, async () => new Response('ok'))
    expect(seenUrls).toEqual(['https://example.com/test', 'https://example.com/test'])
  })
})
