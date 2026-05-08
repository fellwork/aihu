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

import {
  createAgentReadinessRoutes,
  generateA2aCard,
  generateLlmsFullTxt,
  generateMcpDiscovery,
  generateSitemapXml,
} from '@aihu/agent-readiness'
import type { RouteHandler } from '@aihu/server'
import { createRequestRouter, defineRoute, json } from '@aihu/server'

const summary =
  'A zero-dependency Web Components meta-framework. .aihu SFCs compile to vanilla custom elements ' +
  'with sub-2 kB reactive primitives. Every component is agent-discoverable and callable as an MCP tool.'

const llmsSections = [
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
]

const ar = createAgentReadinessRoutes({
  name: 'aihu',
  version: '0.4',
  summary,
  siteUrl: 'https://aihu.dev',
  endpoint: 'https://aihu.dev/.well-known/mcp/server-card.json',
  llmsSections,
  llmsOptional: [{ title: 'Full docs (LLM-optimised)', url: 'https://aihu.dev/llms-full.txt' }],
  aiAgents: 'allow-all',
  sitemap: 'https://aihu.dev/sitemap.xml',
})

const sitemapPages = [
  { url: 'https://aihu.dev/', lastmod: '2026-05-07', changefreq: 'weekly' as const, priority: 1.0 },
  { url: 'https://aihu.dev/#introduction', changefreq: 'weekly' as const, priority: 0.9 },
  { url: 'https://aihu.dev/#installation', changefreq: 'weekly' as const, priority: 0.9 },
  { url: 'https://aihu.dev/#getting-started', changefreq: 'weekly' as const, priority: 0.9 },
  { url: 'https://aihu.dev/#authoring-components', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#reactivity', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#authoring-agents', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#routing-layouts', changefreq: 'monthly' as const, priority: 0.7 },
  { url: 'https://aihu.dev/#data-fetching', changefreq: 'monthly' as const, priority: 0.7 },
  { url: 'https://aihu.dev/#ssr-hydration', changefreq: 'monthly' as const, priority: 0.7 },
  { url: 'https://aihu.dev/#agent-discovery', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#api-reference', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#deployment', changefreq: 'monthly' as const, priority: 0.7 },
]

const a2aCardHandler: RouteHandler = (_req) => {
  const card = generateA2aCard({
    name: 'aihu',
    description: summary,
    url: 'https://aihu.dev',
    version: '0.4',
    capabilities: { streaming: false, pushNotifications: false },
  })
  return json(card)
}

const agentsDirectoryHandler: RouteHandler = (_req) =>
  json({
    agents: [
      {
        name: 'aihu Documentation Agent',
        description:
          'Browse and search the aihu Web Components framework documentation, API reference, and examples',
        url: 'https://aihu.dev/.well-known/agent.json',
        protocol: 'a2a',
      },
      {
        name: 'aihu MCP Server',
        description: 'Access aihu framework documentation and tools via the Model Context Protocol',
        url: 'https://aihu.dev/.well-known/mcp/server-card.json',
        protocol: 'mcp',
      },
    ],
  })

const mcpDiscoveryHandler: RouteHandler = (_req) => {
  const discovery = generateMcpDiscovery({
    name: 'aihu',
    url: 'https://aihu.dev/.well-known/mcp/server-card.json',
    description: summary,
  })
  return json(discovery)
}

const webmcpManifest = {
  spec: 'webmcp/0.1',
  name: 'aihu documentation',
  description: 'aihu Web Components framework — documentation search and navigation tools for AI agents',
  tools: [
    {
      name: 'documentation_search',
      description: 'Search the aihu Web Components framework documentation by topic, API, or concept',
      url: 'https://aihu.dev/',
      method: 'GET',
      parameters: [{ name: 'q', type: 'string', description: 'Search keywords or topic name to find in the aihu documentation' }],
    },
  ],
}

const webmcpHandler: RouteHandler = (_req) => json(webmcpManifest)

const sitemapHandler: RouteHandler = (_req) => {
  const xml = generateSitemapXml({ pages: sitemapPages })
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

const router = createRequestRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    // /llms-full.txt is served as a static asset built by build.ts (full docs concatenation)
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
    defineRoute('/.well-known/agent.json', a2aCardHandler),
    defineRoute('/.well-known/agents.json', agentsDirectoryHandler),
    defineRoute('/.well-known/mcp.json', mcpDiscoveryHandler),
    defineRoute('/.well-known/webmcp', webmcpHandler),
    defineRoute('/.well-known/webmcp.json', webmcpHandler),
    defineRoute('/sitemap.xml', sitemapHandler),
  ],
})

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // 0. Content negotiation: serve markdown when agents request it.
    // Must run before static-asset lookup so the CDN doesn't cache HTML
    // for markdown-accepting agents. Vary: Accept tells the CDN to keep
    // format-appropriate cache entries separate.
    const accept = request.headers.get('Accept') ?? ''
    if (accept.includes('text/markdown')) {
      const p = url.pathname
      if (p === '/' || p === '/index.html') {
        const md = generateLlmsFullTxt({
          name: 'aihu',
          summary,
          sections: llmsSections,
          optional: [{ title: 'Full docs (LLM-optimised)', url: 'https://aihu.dev/llms-full.txt' }],
        })
        return new Response(md, {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            Vary: 'Accept',
            'x-markdown-tokens': String(Math.ceil(md.length / 4)),
          },
        })
      }
    }

    // 1. Agent-readiness and API routes
    const routeResponse = await router(request)
    if (routeResponse.status !== 404) {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      }
      const merged = new Response(routeResponse.body, routeResponse)
      for (const [k, v] of Object.entries(corsHeaders)) merged.headers.set(k, v)
      return merged
    }

    // 2. Pre-built static assets (docs.js, style.css, wasm/*, favicon, …)
    const discoveryLink =
      '</.well-known/mcp/server-card.json>; rel="mcp-server", </llms.txt>; rel="ai-content-discovery", </openapi.json>; rel="openapi", </.well-known/agent.json>; rel="agent-card"'
    try {
      const assetRes = await env.ASSETS.fetch(request)
      const ct = assetRes.headers.get('Content-Type') ?? ''
      if (ct.includes('text/html')) {
        const enriched = new Response(assetRes.body, assetRes)
        enriched.headers.set('Link', discoveryLink)
        return enriched
      }
      return assetRes
    } catch {
      // 3. SPA shell fallback — any unmatched path gets index.html
      const fallback = await env.ASSETS.fetch(
        new Request(new URL('/index.html', url.origin), request),
      )
      const enriched = new Response(fallback.body, fallback)
      enriched.headers.set('Link', discoveryLink)
      return enriched
    }
  },
}
