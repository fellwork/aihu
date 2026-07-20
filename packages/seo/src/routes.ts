import type { RouteHandler } from '@aihu/server'
import {
  generateLlmsTxt,
  generateRobotsTxt,
  generateSitemapXml,
  type RobotsRule,
  type SitemapUrl,
  seoLlmsSections,
} from '@aihu-plugin/agent-readiness'
import type { SeoConfig, SeoRoutes } from './types.js'

/**
 * Map the legacy `robotsOptions.disallowAiBots` boolean onto the consolidated
 * `aiAgents` vocabulary. The mapping is stable forever:
 *
 *   disallowAiBots: true   → 'deny-all'
 *   disallowAiBots: false  → 'allow-all'
 *   absent                 → 'deny-all'  (this package's historical default,
 *                            preserved so published consumers' robots.txt does
 *                            not silently flip) + a deprecation warning.
 *
 * The NEW tiered default `'allow-agents'` applies only to
 * `@aihu-plugin/agent-readiness` — never through this deprecated entry.
 */
function legacyAiAgents(config: SeoConfig): 'allow-all' | 'deny-all' {
  const disallowAiBots = config.robotsOptions?.disallowAiBots
  if (disallowAiBots === undefined) {
    console.warn(
      '[@aihu/seo] deprecated: robots.txt is blocking ALL AI agents because ' +
        '`robotsOptions.disallowAiBots` is absent and @aihu/seo preserves its ' +
        'legacy block-everything default. State your choice in the new ' +
        'vocabulary instead: migrate to @aihu-plugin/agent-readiness and set ' +
        "`aiAgents` to 'allow-agents' (tiered — user-delegated fetchers allowed, " +
        "training crawlers disallowed; the new default), 'allow-all', 'deny-all', " +
        'or an array of rules.',
    )
    return 'deny-all'
  }
  return disallowAiBots ? 'deny-all' : 'allow-all'
}

/**
 * Create typed RouteHandler objects for SEO routes.
 *
 * @deprecated `@aihu/seo` is a compatibility shim (#430): these handlers now
 * delegate to `@aihu-plugin/agent-readiness`'s generators (gaining XML escaping
 * in the sitemap). Use `createAgentReadinessRoutes` there instead.
 *
 * Routes:
 *   - sitemapXml: GET /sitemap.xml  — application/xml
 *   - robotsTxt:  GET /robots.txt   — text/plain
 *   - llmsTxt:    GET /llms.txt     — text/plain
 */
export function createSeoRoutes(config: SeoConfig): SeoRoutes {
  const aiAgents = legacyAiAgents(config)

  const sitemapXml: RouteHandler = (_req) => {
    const pages: ReadonlyArray<SitemapUrl> = (config.sitemapSources ?? []).map((s) => ({
      url: config.baseUrl + s.path,
      ...(s.lastmod !== undefined ? { lastmod: s.lastmod } : {}),
      ...(s.changefreq !== undefined ? { changefreq: s.changefreq } : {}),
      ...(s.priority !== undefined ? { priority: s.priority } : {}),
    }))
    const xml = generateSitemapXml({ pages })
    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  const robotsTxt: RouteHandler = (_req) => {
    // Legacy block order is preserved: additional rules first, then the AI-bot
    // blocks, then the trailing wildcard Allow (always emitted here — the old
    // @aihu/seo behavior, which is also the consolidated default).
    const additionalRules = config.robotsOptions?.additionalRules
    const txt = generateRobotsTxt({
      aiAgents,
      ...(additionalRules?.length
        ? { standard: additionalRules as ReadonlyArray<RobotsRule> }
        : {}),
    })
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const llmsTxt: RouteHandler = (_req) => {
    // Delegates to the consolidated generator; output is byte-identical to the
    // pre-shim rendering (`# <siteName>` then one section of sitemap links).
    const txt = generateLlmsTxt({
      name: config.siteName,
      sections: seoLlmsSections(config),
    })
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return { sitemapXml, robotsTxt, llmsTxt }
}
