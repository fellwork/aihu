/**
 * Cloudflare Pages Worker — SSR entry for aihu.dev.
 *
 * Route priority:
 *   1. Agent-readiness endpoints (llms.txt, robots.txt, MCP server card)
 *   2a. Prerendered per-page HTML — for an HTML nav to a doc route, serve that
 *       page's content-ful `dist/<id>/index.html` (WS1) before the bare shell.
 *   2b. ASSETS binding — pre-built static files (docs.js, style.css, wasm/, …)
 *   3. /index.html fallback for unmatched paths
 *
 * Each doc page is PRERENDERED into its own `dist/<id>/index.html`, so the
 * served HTML already carries the page body (real LCP, painted from the
 * #prerendered-content region) with no wait for `docs.js` to evaluate. The
 * client bundle no longer inlines doc HTML (the old `window.__DOCS__` blob is
 * gone — WS5); the SPA fetches each prerendered page on client nav.
 */

import type { RouteHandler } from '@aihu/server'
import { createRequestRouter, defineRoute, json } from '@aihu/server'
import {
  createAgentReadinessRoutes,
  generateA2aCard,
  generateLlmsFullTxt,
  generateMcpDiscovery,
  generateSitemapXml,
} from '@aihu-plugin/agent-readiness'

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
        url: 'https://aihu.dev/#guides/authoring-components',
        description: 'SFC anatomy, @state, @template, @style blocks',
      },
      {
        title: 'Reactivity',
        url: 'https://aihu.dev/#guides/reactivity',
        description: 'Signals, computed values, and effects',
      },
      {
        title: 'Authoring Agents',
        url: 'https://aihu.dev/#guides/authoring-agents',
        description: '@agent block — expose state and actions as MCP tools',
      },
      {
        title: 'Styling',
        url: 'https://aihu.dev/#guides/styling',
        description: '@aihu/css-engine — scoped utilities, cn(), style packs',
      },
      {
        title: 'Theming',
        url: 'https://aihu.dev/#guides/theming',
        description:
          '@aihu/css-engine design tokens — aihu-default / aihu-graphite packs, defineStylePack(), :root + .dark emission',
      },
      {
        title: 'Primitives',
        url: 'https://aihu.dev/#guides/primitives',
        description: '@aihu/primitives — headless WAI-ARIA dialog, tooltip, button',
      },
    ],
  },
  {
    title: 'Advanced',
    links: [
      {
        title: 'Routing & Layouts',
        url: 'https://aihu.dev/#guides/routing-layouts',
        description: 'defineRoutes, layouts, and nested routes',
      },
      {
        title: 'Data Fetching',
        url: 'https://aihu.dev/#guides/data-fetching',
        description: 'defineLoader and DataSource for async data',
      },
      {
        title: 'SSR & Hydration',
        url: 'https://aihu.dev/#guides/ssr-hydration',
        description: 'Server-side rendering and client hydration',
      },
      {
        title: 'Agent Discovery',
        url: 'https://aihu.dev/#guides/agent-discovery',
        description: 'llms.txt, MCP server cards, and robots.txt',
      },
      {
        title: 'Authoring Plugins',
        url: 'https://aihu.dev/#guides/authoring-plugins',
        description: 'Extending aihu with custom compiler transforms',
      },
    ],
  },
  {
    title: 'Reference',
    links: [
      {
        title: 'Migration (v0 → v1)',
        url: 'https://aihu.dev/#migration',
        description: 'Upgrade pre-v1 SFCs — @props→$prop:, $computed prop reads, $html, $-bindings',
      },
      {
        title: 'API Reference',
        url: 'https://aihu.dev/#api-reference',
        description: 'Complete API surface for all @aihu/* packages',
      },
      {
        title: 'Deployment',
        url: 'https://aihu.dev/#guides/deployment',
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
  {
    url: 'https://aihu.dev/#guides/authoring-components',
    changefreq: 'monthly' as const,
    priority: 0.8,
  },
  { url: 'https://aihu.dev/#guides/reactivity', changefreq: 'monthly' as const, priority: 0.8 },
  {
    url: 'https://aihu.dev/#guides/authoring-agents',
    changefreq: 'monthly' as const,
    priority: 0.8,
  },
  { url: 'https://aihu.dev/#guides/styling', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#guides/theming', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#guides/primitives', changefreq: 'monthly' as const, priority: 0.8 },
  {
    url: 'https://aihu.dev/#guides/routing-layouts',
    changefreq: 'monthly' as const,
    priority: 0.7,
  },
  { url: 'https://aihu.dev/#guides/data-fetching', changefreq: 'monthly' as const, priority: 0.7 },
  { url: 'https://aihu.dev/#guides/ssr-hydration', changefreq: 'monthly' as const, priority: 0.7 },
  {
    url: 'https://aihu.dev/#guides/agent-discovery',
    changefreq: 'monthly' as const,
    priority: 0.8,
  },
  { url: 'https://aihu.dev/#migration', changefreq: 'monthly' as const, priority: 0.7 },
  { url: 'https://aihu.dev/#api-reference', changefreq: 'monthly' as const, priority: 0.8 },
  { url: 'https://aihu.dev/#guides/deployment', changefreq: 'monthly' as const, priority: 0.7 },
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
  description:
    'aihu Web Components framework — documentation search and navigation tools for AI agents',
  tools: [
    {
      name: 'documentation_search',
      description:
        'Search the aihu Web Components framework documentation by topic, API, or concept',
      url: 'https://aihu.dev/',
      method: 'GET',
      parameters: [
        {
          name: 'q',
          type: 'string',
          description: 'Search keywords or topic name to find in the aihu documentation',
        },
      ],
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
  /** Anthropic key for the live-agent demo (/api/drive). Set as a Worker secret. */
  ANTHROPIC_API_KEY?: string
  /** Optional KV for per-IP daily rate-limiting of /api/drive. */
  DRIVE_KV?: {
    get(k: string): Promise<string | null>
    put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void>
  }
}

// ─── Live-agent demo endpoint (/api/drive) ───────────────────────────────────
// Turns a visitor's plain-English instruction into a sequence of the demo
// component's OWN @agent actions, via a real Claude tool-use call. The model is
// constrained to the component's published action allowlist — it can only
// operate the component through its contract, nothing else. Cost is bounded by
// caps + optional per-IP KV rate-limiting; the page degrades to the scripted
// run when no key is configured (503), so it never breaks.
const DRIVE_MAX_INSTRUCTION = 400
const DRIVE_MAX_TOKENS = 512
const DRIVE_DAILY_PER_IP = 30
const DRIVE_MODEL = 'claude-haiku-4-5-20251001'

interface DriveAction {
  name: string
  description?: string
}
interface DriveBody {
  instruction?: string
  tag?: string
  actions?: DriveAction[]
  state?: unknown
}

async function handleDrive(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'POST only' }, { status: 405 })
  // No key → tell the client to fall back to the scripted run (never break).
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'live_agent_unconfigured' }, { status: 503 })

  let body: DriveBody
  try {
    body = (await request.json()) as DriveBody
  } catch {
    return json({ error: 'bad json' }, { status: 400 })
  }
  const instruction = (body.instruction ?? '').trim().slice(0, DRIVE_MAX_INSTRUCTION)
  const actions = Array.isArray(body.actions) ? body.actions.slice(0, 24) : []
  if (!instruction || actions.length === 0) {
    return json({ error: 'instruction and actions required' }, { status: 400 })
  }

  // Optional per-IP daily rate limit when a KV binding is bound.
  if (env.DRIVE_KV) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'anon'
    const key = `drive:${ip}:${new Date().toISOString().slice(0, 10)}`
    const used = Number((await env.DRIVE_KV.get(key)) ?? '0')
    if (used >= DRIVE_DAILY_PER_IP) return json({ error: 'rate_limited' }, { status: 429 })
    await env.DRIVE_KV.put(key, String(used + 1), { expirationTtl: 86_400 })
  }

  // Each @agent action becomes a tool. tool_choice:any forces the model to
  // operate the component (it cannot answer in prose) and to use ONLY these.
  const tools = actions.map((a) => ({
    name: a.name,
    description: a.description ?? `Invoke the ${a.name} action on the component.`,
    input_schema: {
      type: 'object',
      properties: {
        args: {
          type: 'array',
          description: 'Positional arguments for the action (often a single value).',
          items: {},
        },
      },
      required: [],
    },
  }))

  let upstream: Response
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DRIVE_MODEL,
        max_tokens: DRIVE_MAX_TOKENS,
        system: [
          {
            type: 'text',
            text:
              'You operate a live UI component by calling its actions. The user gives an ' +
              'instruction in plain English; translate it into the tool call(s) that achieve it, ' +
              'using ONLY the provided tools, in the order they should run. Do not explain — just ' +
              'call the tools. The current component state is given for context.',
            // Prompt-cache the system + tools (stable per component) to cut cost.
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools,
        tool_choice: { type: 'any' },
        messages: [
          {
            role: 'user',
            content: `Component <${body.tag ?? 'component'}> current state: ${JSON.stringify(
              body.state ?? null,
            )}\n\nInstruction: ${instruction}`,
          },
        ],
      }),
    })
  } catch {
    return json({ error: 'upstream_unreachable' }, { status: 502 })
  }
  if (!upstream.ok) return json({ error: 'upstream', status: upstream.status }, { status: 502 })

  const data = (await upstream.json()) as {
    content?: Array<{ type: string; name?: string; input?: { args?: unknown[] } }>
  }
  const steps = (data.content ?? [])
    .filter((b) => b.type === 'tool_use' && typeof b.name === 'string')
    .map((b) => ({
      action: b.name as string,
      args: Array.isArray(b.input?.args) ? b.input?.args : [],
    }))
  return json({ steps })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Live-agent demo endpoint — must run before asset/prerender routing.
    if (url.pathname === '/api/drive') return handleDrive(request, env)

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

    // 2a. Prerendered doc page (WS1, the load-bearing serve step).
    //
    // build.ts emits a content-ful `dist/<id>/index.html` per doc page. For an
    // HTML navigation to a non-root doc route (e.g. `/reactivity/` or
    // `/guides/reactivity`), explicitly fetch `<normalizedPathname>/index.html`
    // from ASSETS and serve it when present. WITHOUT this branch the generic
    // ASSETS fetch + bare-shell fallback can resolve unmatched doc paths to the
    // ROOT shell — silently no-op'ing the whole prerender (per-page HTML built
    // but never served, LCP never improves). `/` keeps the root index.html.
    const isHtmlNav =
      request.method === 'GET' && (request.headers.get('Accept') ?? '').includes('text/html')
    const normalizedPath = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
    const looksLikeFile = /\.[a-z0-9]+$/i.test(normalizedPath)
    if (isHtmlNav && normalizedPath !== '' && !looksLikeFile) {
      try {
        const prerendered = await env.ASSETS.fetch(
          new Request(new URL(`/${normalizedPath}/index.html`, url.origin), request),
        )
        const ct = prerendered.headers.get('Content-Type') ?? ''
        if (prerendered.status === 200 && ct.includes('text/html')) {
          const enriched = new Response(prerendered.body, prerendered)
          enriched.headers.set('Link', discoveryLink)
          return enriched
        }
      } catch {
        // fall through to the generic asset / shell path below
      }
    }

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
