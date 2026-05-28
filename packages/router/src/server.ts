// Server-only router surface. This file MUST stay out of the browser
// `./` entry's static + dynamic graph because `@aihu/server`'s
// `renderToString` reaches a lazy `await import('./native.js')`, and the
// built `native.js` statically imports `node:module`. Browser bundlers
// (Vite/Rollup/Rolldown) chase the dynamic import and choke.
// See .context/fw-agent/bug2.5-node-module-leak/investigation.md.

import { renderToString } from '@aihu/server'
import type { RouteDefinition, Router } from './router.ts'
import { createRouter } from './router.ts'

/**
 * A server-capable router: a regular {@link Router} plus a `handle(req)`
 * method that renders the matched route to an HTML `Response`. Equivalent
 * to the old `createRouter().handle` shape, but isolated behind the
 * `@aihu/router/server` subpath so SPA bundles never reach
 * `@aihu/server`'s native loader.
 */
export type ServerRouter = Router & {
  handle(req: Request): Promise<Response>
}

/**
 * Construct a router with the server-side `handle(req)` request handler
 * wired in. Use this from Node/Bun/Workers SSR adapters; browser code
 * should keep using `createRouter` from `@aihu/router`.
 */
export function createServerRouter(routes: RouteDefinition[]): ServerRouter {
  const router = createRouter(routes)

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const result = router.match(url.pathname)
    if (!result) return new Response('Not Found', { status: 404 })

    const { route, params } = result
    const mod = await route.module()
    const loaderData = mod.loader ? await mod.loader(params) : undefined

    const component = mod.default as (() => unknown) | { toHtml(): string }
    const html = await renderToString(component)

    const body =
      loaderData !== undefined
        ? `${html}<script type="application/json" id="__aihu_loader__">${JSON.stringify(loaderData)}</script>`
        : html

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return { ...router, handle }
}
