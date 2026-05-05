/**
 * __APP_NAME__ — Cloudflare Workers entry.
 *
 * Scaffolded by @aihu/templates-cf-team on __SCAFFOLD_DATE__.
 * The app's root SFC lives in `./app.aihu`; the runtime mounts it on the
 * client side. This module exposes the Workers `fetch` handler that the
 * Cloudflare adapter wires up at build time.
 */

import { createRequestRouter, defineRoute } from '@aihu/server'
import './app.aihu'

const router = createRequestRouter({
  routes: [
    defineRoute({
      pattern: '/',
      handler: () =>
        new Response('__APP_NAME__ — running on Cloudflare Workers', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    }),
  ],
})

export default {
  fetch(request: Request): Promise<Response> {
    return router(request)
  },
}
