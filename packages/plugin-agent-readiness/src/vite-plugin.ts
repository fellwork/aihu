import type { RouteHandler } from '@aihu/server'
import { json, notFound } from '@aihu/server'
import { generateA2aCard } from './a2a-card.ts'
import { generateLlmsFullTxt, generateLlmsTxt } from './llms-txt.ts'
import { generateMcpDiscovery } from './mcp-discovery.ts'
import { generateMcpServerCard } from './mcp-server-card.ts'
import { generateRobotsTxt } from './robots.ts'
import { generateSitemapXml } from './sitemap.ts'
import type { AgentReadinessConfig } from './types.ts'

/**
 * Minimal Vite Plugin interface — avoids importing from 'vite' at compile time
 * while remaining structurally compatible. `vite` is external in rolldown.config.ts.
 * @internal
 */
interface VitePlugin {
  readonly name: string
  configureServer?: (server: {
    middlewares: {
      use: (fn: (req: any, res: any, next: () => void) => void) => void
    }
  }) => void
  generateBundle?: (options: any, bundle: any) => Promise<void>
  transformIndexHtml?: (html: string) => string
}

/**
 * Create fetch-API route handlers for all agent-readiness endpoints.
 * Each handler generates fresh content on every request (pure functions, negligible cost).
 *
 * @example
 * const ar = createAgentReadinessRoutes({ name: 'My App', endpoint: '...' })
 * const router = createRequestRouter({
 *   routes: [
 *     defineRoute('/llms.txt', ar.llmsTxt),
 *     defineRoute('/llms-full.txt', ar.llmsFullTxt),
 *     defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
 *     defineRoute('/robots.txt', ar.robotsTxt),
 *     ...appRoutes,
 *   ],
 * })
 */
export function createAgentReadinessRoutes(config: AgentReadinessConfig): {
  readonly llmsTxt: RouteHandler
  readonly llmsFullTxt: RouteHandler
  readonly mcpServerCard: RouteHandler
  readonly robotsTxt: RouteHandler
  readonly a2aCard: RouteHandler
  readonly mcpDiscovery: RouteHandler
  readonly sitemapXml: RouteHandler
} {
  const llmsTxt: RouteHandler = (_req) => {
    const txt = generateLlmsTxt({
      name: config.name,
      sections: config.llmsSections ?? [],
      ...(config.summary !== undefined ? { summary: config.summary } : {}),
      ...(config.llmsOptional !== undefined ? { optional: config.llmsOptional } : {}),
    })
    // TODO: add Components section once @aihu/agent exports getAllAgentMetadata()
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const llmsFullTxt: RouteHandler = (_req) => {
    const txt = generateLlmsFullTxt({
      name: config.name,
      sections: config.llmsSections ?? [],
      ...(config.summary !== undefined ? { summary: config.summary } : {}),
      ...(config.llmsOptional !== undefined ? { optional: config.llmsOptional } : {}),
    })
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const mcpServerCard: RouteHandler = (_req) => {
    if (!config.endpoint) return notFound()
    const card = generateMcpServerCard({
      name: config.name,
      version: config.version ?? '0.0.0',
      endpoint: config.endpoint,
      ...(config.skills !== undefined ? { skills: config.skills } : {}),
      ...(config.auth !== undefined ? { auth: config.auth } : {}),
      ...(config.summary !== undefined ? { description: config.summary } : {}),
    })
    return json(card)
  }

  const robotsTxt: RouteHandler = (_req) => {
    const txt = generateRobotsTxt({
      ...(config.aiAgents !== undefined ? { aiAgents: config.aiAgents } : {}),
      ...(config.standardBots !== undefined ? { standard: config.standardBots } : {}),
      ...(config.sitemap !== undefined ? { sitemap: config.sitemap } : {}),
    })
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const a2aCard: RouteHandler = (_req) => {
    if (!config.a2aCard) return notFound()
    if (!config.siteUrl) return notFound()
    const a2aConfig = config.a2aCard === true ? {} : config.a2aCard
    const card = generateA2aCard({
      name: config.name,
      url: config.siteUrl,
      ...(config.summary !== undefined ? { description: config.summary } : {}),
      ...(config.version !== undefined ? { version: config.version } : {}),
      ...(a2aConfig.capabilities !== undefined ? { capabilities: a2aConfig.capabilities } : {}),
      ...(a2aConfig.skills !== undefined ? { skills: a2aConfig.skills } : {}),
    })
    return json(card)
  }

  const mcpDiscovery: RouteHandler = (_req) => {
    if (!config.mcpDiscovery) return notFound()
    const mcpUrl =
      config.endpoint ??
      (config.siteUrl ? `${config.siteUrl}/.well-known/mcp/server-card.json` : undefined)
    if (!mcpUrl) return notFound()
    const discovery = generateMcpDiscovery({
      name: config.name,
      url: mcpUrl,
      ...(config.summary !== undefined ? { description: config.summary } : {}),
    })
    return json(discovery)
  }

  const sitemapXml: RouteHandler = (_req) => {
    if (!config.sitemapPages) return notFound()
    const xml = generateSitemapXml({ pages: config.sitemapPages })
    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  return { llmsTxt, llmsFullTxt, mcpServerCard, robotsTxt, a2aCard, mcpDiscovery, sitemapXml }
}

/**
 * The `viteAgentReadinessIntegration()` Vite plugin (v0.7.4 canonical name).
 *
 * configureServer (dev): serves /llms.txt, /llms-full.txt, /.well-known/mcp/server-card.json, /robots.txt
 * generateBundle (build): writes all four files as static assets to output dir
 *
 * Route injection: does NOT inject into createRequestRouter automatically.
 * Use createAgentReadinessRoutes() for fetch-API integration.
 *
 * Previously named `agentReadiness`. That name is kept as a deprecated alias
 * until v1.0 to avoid a breaking change.
 */
export function viteAgentReadinessIntegration(config: AgentReadinessConfig): VitePlugin {
  const routes = createAgentReadinessRoutes(config)

  const serveResponse = async (path: string, handler: RouteHandler, res: any): Promise<boolean> => {
    const req = new Request(`http://localhost${path}`)
    const response = await handler(req, { params: {}, url: new URL(`http://localhost${path}`) })
    const body = await response.text()
    const ct = response.headers.get('Content-Type') ?? 'text/plain'
    if (response.status === 404) return false
    res.writeHead(response.status, { 'Content-Type': ct })
    res.end(body)
    return true
  }

  function buildJsonLdTags(): string {
    if (config.jsonLd === false) return ''
    if (Array.isArray(config.jsonLd)) {
      return config.jsonLd
        .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
        .join('\n')
    }
    if (config.siteUrl) {
      const schema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: config.name,
        url: config.siteUrl,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }
      if (config.summary !== undefined) schema.description = config.summary
      if (config.version !== undefined) schema.version = config.version
      return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    }
    return ''
  }

  return {
    name: 'aihu-agent-readiness',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url as string | undefined) ?? '/'
        const pathMap: Array<[string, RouteHandler]> = [
          ['/llms.txt', routes.llmsTxt],
          ['/llms-full.txt', routes.llmsFullTxt],
          ['/.well-known/mcp/server-card.json', routes.mcpServerCard],
          ['/robots.txt', routes.robotsTxt],
          ['/.well-known/agent.json', routes.a2aCard],
          ['/.well-known/mcp.json', routes.mcpDiscovery],
          ['/sitemap.xml', routes.sitemapXml],
        ]
        for (const [path, handler] of pathMap) {
          if (url === path || url.startsWith(`${path}?`)) {
            const handled = await serveResponse(url, handler, res)
            if (handled) return
          }
        }
        next()
      })
    },
    async generateBundle(_options, _bundle) {
      const files: Array<[string, RouteHandler]> = [
        ['llms.txt', routes.llmsTxt],
        ['llms-full.txt', routes.llmsFullTxt],
        ['.well-known/mcp/server-card.json', routes.mcpServerCard],
        ['robots.txt', routes.robotsTxt],
        ['.well-known/agent.json', routes.a2aCard],
        ['.well-known/mcp.json', routes.mcpDiscovery],
        ['sitemap.xml', routes.sitemapXml],
      ]
      for (const [name, handler] of files) {
        const req = new Request(`http://localhost/${name}`)
        const response = await handler(req, {
          params: {},
          url: new URL(`http://localhost/${name}`),
        })
        if (response.status === 200) {
          const body = await response.text()
          ;(this as any).emitFile({ type: 'asset', fileName: name, source: body })
        }
      }
    },
    transformIndexHtml(html: string): string {
      const tags = buildJsonLdTags()
      if (!tags) return html
      return html.replace('</head>', `${tags}\n</head>`)
    },
  }
}

/** @deprecated Use `viteAgentReadinessIntegration` instead. Will be removed in v1.0. */
export const agentReadiness = viteAgentReadinessIntegration
