/**
 * Cloudflare Pages Worker — SSR entry for aihu.dev.
 *
 * Route priority:
 *   1. Agent-readiness endpoints (llms.txt, robots.txt, MCP server card)
 *   2. ASSETS binding — pre-built static files (docs.js, style.css, wasm/, …)
 *   3. /index.html fallback for unmatched paths
 *
 * The HTML shell (`index.html`) is built with `window.__DOCS__` inlined by
 * build.ts, so `docs-shell` has content immediately on parse — no flash of
 * unstyled content waiting for `docs.js` to evaluate.
 */

import { createAgentReadinessRoutes } from '@aihu/agent-readiness'
import { createRequestRouter, defineRoute } from '@aihu/server'

const ar = createAgentReadinessRoutes({
  name: 'aihu',
  version: '0.4',
  summary:
    'A zero-dependency Web Components meta-framework. .aihu SFCs compile to vanilla custom elements ' +
    'with sub-2 kB reactive primitives. Every component is agent-discoverable and callable as an MCP tool.',
  endpoint: 'https://aihu.dev/.well-known/mcp/server-card.json',
  llmsSections: [
    {
      title: 'Getting Started',
      links: [
        {
          title: 'Introduction',
          url: 'https://aihu.dev/#introduction',
          description: 'What aihu is and why it exists',
        },
        {
          title: 'Installation',
          url: 'https://aihu.dev/#installation',
          description: 'Install aihu into a new or existing project',
        },
        {
          title: 'Getting Started',
          url: 'https://aihu.dev/#getting-started',
          description: 'Your first .aihu component',
        },
      ],
    },
    {
      title: 'Core Concepts',
      links: [
        {
          title: 'Authoring Components',
          url: 'https://aihu.dev/#authoring-components',
          description: 'SFC anatomy, @state, @template, @style blocks',
        },
        {
          title: 'Reactivity',
          url: 'https://aihu.dev/#reactivity',
          description: 'Signals, computed values, and effects',
        },
        {
          title: 'Authoring Agents',
          url: 'https://aihu.dev/#authoring-agents',
          description: '@agent block — expose state and actions as MCP tools',
        },
      ],
    },
    {
      title: 'Advanced',
      links: [
        {
          title: 'Routing & Layouts',
          url: 'https://aihu.dev/#routing-layouts',
          description: 'defineRoutes, layouts, and nested routes',
        },
        {
          title: 'Data Fetching',
          url: 'https://aihu.dev/#data-fetching',
          description: 'defineLoader and DataSource for async data',
        },
        {
          title: 'SSR & Hydration',
          url: 'https://aihu.dev/#ssr-hydration',
          description: 'Server-side rendering and client hydration',
        },
        {
          title: 'Agent Discovery',
          url: 'https://aihu.dev/#agent-discovery',
          description: 'llms.txt, MCP server cards, and robots.txt',
        },
        {
          title: 'Authoring Plugins',
          url: 'https://aihu.dev/#authoring-plugins',
          description: 'Extending aihu with custom compiler transforms',
        },
      ],
    },
    {
      title: 'Reference',
      links: [
        {
          title: 'API Reference',
          url: 'https://aihu.dev/#api-reference',
          description: 'Complete API surface for all @aihu/* packages',
        },
        {
          title: 'Deployment',
          url: 'https://aihu.dev/#deployment',
          description: 'Cloudflare Workers, Vercel, and Node.js adapters',
        },
      ],
    },
  ],
  llmsOptional: [{ title: 'Full docs (LLM-optimised)', url: 'https://aihu.dev/llms-full.txt' }],
  aiAgents: 'allow-all',
  sitemap: 'https://aihu.dev/sitemap.xml',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    defineRoute('/llms-full.txt', ar.llmsFullTxt),
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
  ],
})

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Agent-readiness and API routes
    const routeResponse = await router(request)
    if (routeResponse.status !== 404) return routeResponse

    // 2. Pre-built static assets (docs.js, style.css, wasm/*, favicon, …)
    const url = new URL(request.url)
    try {
      return await env.ASSETS.fetch(request)
    } catch {
      // 3. SPA shell fallback — any unmatched path gets index.html
      return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request))
    }
  },
}
