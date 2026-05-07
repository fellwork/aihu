/**
 * __APP_NAME__ — Cloudflare Workers entry.
 *
 * Scaffolded by @aihu/templates-cf-team on __SCAFFOLD_DATE__.
 * The app's root SFC lives in `./app.aihu`; the runtime mounts it on the
 * client side. This module exposes the Workers `fetch` handler that the
 * Cloudflare adapter wires up at build time.
 */

import { createAgentReadinessRoutes } from '@aihu/agent-readiness'
import { createRequestRouter, defineRoute, defineRoutes, json } from '@aihu/server'
import './app.aihu'

// Agent-readiness endpoints — served automatically on every aihu app.
// Configure name, endpoint, and llmsSections in aihu.config.ts under `agent:`.
const ar = createAgentReadinessRoutes({
  name: '__APP_NAME__',
  // endpoint: 'https://__APP_NAME__.workers.dev/mcp',  // uncomment to enable MCP card
})

const router = createRequestRouter({
  routes: [
    // Agent-readiness: /llms.txt, /llms-full.txt, /.well-known/mcp/server-card.json, /robots.txt
    defineRoutes([
      { pattern: '/llms.txt', handler: ar.llmsTxt },
      { pattern: '/llms-full.txt', handler: ar.llmsFullTxt },
      { pattern: '/.well-known/mcp/server-card.json', handler: ar.mcpServerCard },
      { pattern: '/robots.txt', handler: ar.robotsTxt },
    ]),

    // App routes
    defineRoute('/', () => json({ app: '__APP_NAME__', status: 'ok' })),
  ],
})

export default {
  fetch(request: Request): Promise<Response> {
    return router(request)
  },
}
