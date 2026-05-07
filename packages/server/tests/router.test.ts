import { describe, expect, it, vi } from 'vitest'
import { defineLoader } from '../src/data.ts'
import { createRequestRouter, defineRoute, defineRoutes } from '../src/router.ts'
import type { Middleware } from '../src/types.ts'

describe('@aihu/server router', () => {
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

describe('defineRoutes — batch registration', () => {
  it('registers multiple routes and all match', async () => {
    const routes = defineRoutes([
      { pattern: '/r1', handler: async () => new Response('r1') },
      { pattern: '/r2', handler: async () => new Response('r2') },
      { pattern: '/r3', handler: async () => new Response('r3') },
    ])
    expect(routes).toHaveLength(3)
    const fetch = createRequestRouter({ routes })
    expect(await (await fetch(new Request('http://localhost/r1'))).text()).toBe('r1')
    expect(await (await fetch(new Request('http://localhost/r2'))).text()).toBe('r2')
    expect(await (await fetch(new Request('http://localhost/r3'))).text()).toBe('r3')
  })

  it('passes options through (per-route middleware)', async () => {
    const order: string[] = []
    const mw: Middleware = async (_req, next) => {
      order.push('mw')
      return next()
    }
    const routes = defineRoutes([
      {
        pattern: '/mw-test',
        handler: async () => {
          order.push('handler')
          return new Response('ok')
        },
        options: { middleware: [mw] },
      },
    ])
    await createRequestRouter({ routes })(new Request('http://localhost/mw-test'))
    expect(order).toEqual(['mw', 'handler'])
  })

  it('returns Route[] that can be inlined into routes alongside singular defineRoute', async () => {
    const batch = defineRoutes([
      { pattern: '/batch-a', handler: async () => new Response('a') },
      { pattern: '/batch-b', handler: async () => new Response('b') },
    ])
    const single = defineRoute('/single', async () => new Response('single'))
    const fetch = createRequestRouter({ routes: [batch, single] })
    expect(await (await fetch(new Request('http://localhost/batch-a'))).text()).toBe('a')
    expect(await (await fetch(new Request('http://localhost/batch-b'))).text()).toBe('b')
    expect(await (await fetch(new Request('http://localhost/single'))).text()).toBe('single')
  })
})

describe('defineRoute — prefix group', () => {
  it('prepends prefix to all subroute patterns', async () => {
    const routes = defineRoute('/api', [
      ['/users', async () => new Response('users')],
      ['/posts', async () => new Response('posts')],
    ])
    expect(routes).toHaveLength(2)
    expect(routes[0]!.pattern).toBe('/api/users')
    expect(routes[1]!.pattern).toBe('/api/posts')
  })

  it('all prefixed routes match correctly', async () => {
    const fetch = createRequestRouter({
      routes: [
        defineRoute('/api', [
          ['/users', async () => new Response('users')],
          ['/users/:id', async (_req, ctx) => new Response(ctx.params.id ?? '')],
        ]),
      ],
    })
    expect(await (await fetch(new Request('http://localhost/api/users'))).text()).toBe('users')
    expect(await (await fetch(new Request('http://localhost/api/users/42'))).text()).toBe('42')
  })

  it('subroute options (middleware) are preserved', async () => {
    const order: string[] = []
    const mw: Middleware = async (_req, next) => {
      order.push('mw')
      return next()
    }
    const fetch = createRequestRouter({
      routes: [
        defineRoute('/v1', [
          [
            '/ping',
            async () => {
              order.push('handler')
              return new Response('pong')
            },
            { middleware: [mw] },
          ],
        ]),
      ],
    })
    await fetch(new Request('http://localhost/v1/ping'))
    expect(order).toEqual(['mw', 'handler'])
  })

  it('non-matching prefix route does not affect other routes', async () => {
    const fetch = createRequestRouter({
      routes: [
        defineRoute('/api', [['/data', async () => new Response('data')]]),
        defineRoute('/health', async () => new Response('ok')),
      ],
    })
    expect(await (await fetch(new Request('http://localhost/health'))).text()).toBe('ok')
    expect(await (await fetch(new Request('http://localhost/api/data'))).text()).toBe('data')
  })

  it('Route[] from prefix group inlines alongside Route entries in manifest', async () => {
    const apiRoutes = defineRoute('/api', [
      ['/a', async () => new Response('a')],
      ['/b', async () => new Response('b')],
    ])
    const root = defineRoute('/', async () => new Response('root'))
    const fetch = createRequestRouter({ routes: [apiRoutes, root] })
    expect(await (await fetch(new Request('http://localhost/'))).text()).toBe('root')
    expect(await (await fetch(new Request('http://localhost/api/a'))).text()).toBe('a')
    expect(await (await fetch(new Request('http://localhost/api/b'))).text()).toBe('b')
  })
})
