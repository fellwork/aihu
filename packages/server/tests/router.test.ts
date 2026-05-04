import { describe, expect, it, vi } from 'vitest'
import { defineLoader } from '../src/data.ts'
import { createRequestRouter, defineRoute } from '../src/router.ts'
import type { Middleware } from '../src/types.ts'

describe('@scribe/server router', () => {
  it('static route matches exact path', async () => {
    const route = defineRoute('/about', async () => new Response('about page'))
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('https://example.com/about'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('about page')
  })

  it('dynamic route extracts single param', async () => {
    const route = defineRoute('/posts/:slug', async (_req, ctx) => new Response(ctx.params.slug))
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('https://example.com/posts/hello-world'))
    expect(await res.text()).toBe('hello-world')
  })

  it('nested dynamic route extracts multiple params', async () => {
    const route = defineRoute(
      '/blog/:year/:month',
      async (_req, ctx) => new Response(`${ctx.params.year}/${ctx.params.month}`),
    )
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('https://example.com/blog/2026/04'))
    expect(await res.text()).toBe('2026/04')
  })

  it('catch-all route captures remainder in params["*"]', async () => {
    const route = defineRoute('/static/*', async (_req, ctx) => new Response(ctx.params['*']))
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('https://example.com/static/images/logo.png'))
    expect(await res.text()).toBe('images/logo.png')
  })

  it('no match returns 404', async () => {
    const fetch = createRequestRouter({ routes: [] })
    const res = await fetch(new Request('https://example.com/missing'))
    expect(res.status).toBe(404)
  })

  it('no match calls custom notFound handler', async () => {
    const notFound = vi.fn(async () => new Response('custom 404', { status: 404 }))
    const fetch = createRequestRouter({ routes: [] }, { notFound })
    const res = await fetch(new Request('https://example.com/missing'))
    expect(notFound).toHaveBeenCalledOnce()
    expect(await res.text()).toBe('custom 404')
  })

  it('route-level middleware fires before handler', async () => {
    const order: string[] = []
    const mw: Middleware = async (_req, next) => {
      order.push('mw')
      return next()
    }
    const route = defineRoute(
      '/test',
      async () => {
        order.push('handler')
        return new Response('ok')
      },
      { middleware: [mw] },
    )
    const fetch = createRequestRouter({ routes: [route] })
    await fetch(new Request('https://example.com/test'))
    expect(order).toEqual(['mw', 'handler'])
  })

  it('global RouterOptions.middleware fires outermost (before route middleware)', async () => {
    const order: string[] = []
    const globalMw: Middleware = async (_req, next) => {
      order.push('global')
      return next()
    }
    const routeMw: Middleware = async (_req, next) => {
      order.push('route')
      return next()
    }
    const route = defineRoute(
      '/test',
      async () => {
        order.push('handler')
        return new Response('ok')
      },
      { middleware: [routeMw] },
    )
    const fetch = createRequestRouter({ routes: [route] }, { middleware: [globalMw] })
    await fetch(new Request('https://example.com/test'))
    expect(order).toEqual(['global', 'route', 'handler'])
  })

  it('env is threaded into ctx.env', async () => {
    const env = { DB: 'my-db' }
    const route = defineRoute(
      '/env-test',
      async (_req, ctx) => new Response(JSON.stringify(ctx.env)),
    )
    const fetch = createRequestRouter({ routes: [route] }, { env })
    const res = await fetch(new Request('https://example.com/env-test'))
    const body = await res.json()
    expect(body).toEqual({ DB: 'my-db' })
  })

  it('defineRoute with loader injects loaderData into ctx', async () => {
    const loader = defineLoader(async (ctx) => ({ userId: ctx.params.id ?? '' }))
    const route = defineRoute<{ userId: string }>(
      '/users/:id',
      async (_req, ctx) => new Response(JSON.stringify(ctx.loaderData.data)),
      { loader },
    )
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('https://example.com/users/42'))
    const body = await res.json()
    expect(body).toEqual({ userId: '42' })
  })

  it('static route takes priority over dynamic route with same depth', async () => {
    const staticRoute = defineRoute('/posts/featured', async () => new Response('static'))
    const dynamicRoute = defineRoute('/posts/:slug', async () => new Response('dynamic'))
    const fetch = createRequestRouter({ routes: [dynamicRoute, staticRoute] })
    const res = await fetch(new Request('https://example.com/posts/featured'))
    expect(await res.text()).toBe('static')
  })

  it('createRequestRouter is exported as a function', () => {
    expect(typeof createRequestRouter).toBe('function')
  })

  it('createRequestRouter creates a working fetch handler (smoke)', async () => {
    const route = defineRoute('/ping', async () => new Response('pong'))
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('http://localhost/ping'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('pong')
  })

  it('createRequestRouter handles multiple routes with method diversity', async () => {
    const routes = [
      defineRoute('/a', async () => new Response('a')),
      defineRoute('/b', async () => new Response('b')),
      defineRoute('/c', async () => new Response('c')),
    ]
    const fetch = createRequestRouter({ routes })
    expect(await (await fetch(new Request('http://localhost/a'))).text()).toBe('a')
    expect(await (await fetch(new Request('http://localhost/b'))).text()).toBe('b')
    expect(await (await fetch(new Request('http://localhost/c'))).text()).toBe('c')
  })

  it('createRequestRouter returns a fresh handler per call', () => {
    const route = defineRoute('/x', async () => new Response('x'))
    const f1 = createRequestRouter({ routes: [route] })
    const f2 = createRequestRouter({ routes: [route] })
    expect(f1).not.toBe(f2)
    expect(typeof f1).toBe('function')
    expect(typeof f2).toBe('function')
  })
})
