import type { AgentReadinessConfig } from './types.ts'
import { generateLlmsTxt, generateLlmsFullTxt } from './llms-txt.ts'
import { generateMcpServerCard } from './mcp-server-card.ts'
import { generateRobotsTxt } from './robots.ts'
import { json, notFound } from '@scribe/server'
import type { RouteHandler } from '@scribe/server'

/**
 * Minimal Vite Plugin interface — avoids importing from 'vite' at compile time
 * while remaining structurally compatible. `vite` is external in rolldown.config.ts.
 * @internal
 */
interface VitePlugin {
  readonly name: string
  configureServer?: (server: {
    middlewares: {
      use: (
        fn: (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req: any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res: any,
          next: () => void,
        ) => void,
      ) => void
    }
  }) => void
  generateBundle?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bundle: any,
  ) => Promise<void>
}

/**
 * Create fetch-API route handlers for all agent-readiness endpoints.
 * Each handler generates fresh content on every request (pure functions, negligible cost).
 *
 * @example
 * const ar = createAgentReadinessRoutes({ name: 'My App', endpoint: '...' })
 * const router = createRouter({
 *   routes: [
 *     defineRoute('/llms.txt', ar.llmsTxt),
 *     defineRoute('/llms-full.txt', ar.llmsFullTxt),
 *     defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
 *     defineRoute('/robots.txt', ar.robotsTxt),
 *     ...appRoutes,
 *   ],
 * })
 */
export function createAgentReadinessRoutes(
  config: AgentReadinessConfig,
): {
  readonly llmsTxt: RouteHandler
  readonly llmsFullTxt: RouteHandler
  readonly mcpServerCard: RouteHandler
  readonly robotsTxt: RouteHandler
} {
  const llmsTxt: RouteHandler = (_req) => {
    const txt = generateLlmsTxt({
      name: config.name,
      sections: config.llmsSections ?? [],
      ...(config.summary !== undefined ? { summary: config.summary } : {}),
      ...(config.llmsOptional !== undefined ? { optional: config.llmsOptional } : {}),
    })
    // TODO: add Components section once @scribe/agent exports getAllAgentMetadata()
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const llmsFullTxt: RouteHandler = (_req) => {
    const txt = generateLlmsFullTxt({
      name: config.name,
      sections: config.llmsSections ?? [],
      ...(config.summary !== undefined ? { summary: config.summary } : {}),
      ...(config.llmsOptional !== undefined ? { optional: config.llmsOptional } : {}),
    })
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
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
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  return { llmsTxt, llmsFullTxt, mcpServerCard, robotsTxt }
}

/**
 * The `viteAgentReadinessIntegration()` Vite plugin (v0.7.4 canonical name).
 *
 * configureServer (dev): serves /llms.txt, /llms-full.txt, /.well-known/mcp/server-card.json, /robots.txt
 * generateBundle (build): writes all four files as static assets to output dir
 *
 * Route injection: does NOT inject into createRouter automatically.
 * Use createAgentReadinessRoutes() for fetch-API integration.
 *
 * Previously named `agentReadiness`. That name is kept as a deprecated alias
 * until v1.0 to avoid a breaking change.
 */
export function viteAgentReadinessIntegration(config: AgentReadinessConfig): VitePlugin {
  const routes = createAgentReadinessRoutes(config)

  const serveResponse = async (
    path: string,
    handler: RouteHandler,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res: any,
  ): Promise<boolean> => {
    const req = new Request(`http://localhost${path}`)
    const response = await handler(req, { params: {}, url: new URL(`http://localhost${path}`) })
    const body = await response.text()
    const ct = response.headers.get('Content-Type') ?? 'text/plain'
    if (response.status === 404) return false
    res.writeHead(response.status, { 'Content-Type': ct })
    res.end(body)
    return true
  }

  return {
    name: 'scribe-agent-readiness',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url as string | undefined) ?? '/'
        const pathMap: Array<[string, RouteHandler]> = [
          ['/llms.txt', routes.llmsTxt],
          ['/llms-full.txt', routes.llmsFullTxt],
          ['/.well-known/mcp/server-card.json', routes.mcpServerCard],
          ['/robots.txt', routes.robotsTxt],
        ]
        for (const [path, handler] of pathMap) {
          if (url === path || url.startsWith(path + '?')) {
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
      ]
      for (const [name, handler] of files) {
        const req = new Request(`http://localhost/${name}`)
        const response = await handler(req, { params: {}, url: new URL(`http://localhost/${name}`) })
        if (response.status === 200) {
          const body = await response.text()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(this as any).emitFile({ type: 'asset', fileName: name, source: body })
        }
      }
    },
  }
}

/** @deprecated Use `viteAgentReadinessIntegration` instead. Will be removed in v1.0. */
export const agentReadiness = viteAgentReadinessIntegration
