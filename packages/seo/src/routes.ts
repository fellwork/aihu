import type { RouteHandler } from '@aihu/server'
import { seoLlmsSections } from './llms-sections.js'
import { generateRobots } from './robots.js'
import { generateSitemap } from './sitemap.js'
import type { SeoConfig, SeoRoutes } from './types.js'

/**
 * Create typed RouteHandler objects for SEO routes.
 * Mirrors the pattern from createAgentReadinessRoutes in @aihu-plugin/agent-readiness.
 *
 * Routes:
 *   - sitemapXml: GET /sitemap.xml  — application/xml
 *   - robotsTxt:  GET /robots.txt   — text/plain
 *   - llmsTxt:    GET /llms.txt     — text/plain
 */
export function createSeoRoutes(config: SeoConfig): SeoRoutes {
  const sitemapXml: RouteHandler = (_req) => {
    const sources = config.sitemapSources ?? []
    const xml = generateSitemap(config.baseUrl, sources)
    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  const robotsTxt: RouteHandler = (_req) => {
    const txt = generateRobots(config)
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const llmsTxt: RouteHandler = (_req) => {
    // Render a basic llms.txt using seoLlmsSections for composition.
    // Full llms.txt generation (with header, summary, optional) is available
    // by passing seoLlmsSections(config) into @aihu-plugin/agent-readiness's
    // llmsSections field and using its createAgentReadinessRoutes.
    const sections = seoLlmsSections(config)
    const lines: string[] = [`# ${config.siteName}`, '']
    for (const section of sections) {
      if (section.links.length === 0) continue
      lines.push(`## ${section.title}`)
      for (const link of section.links) {
        lines.push(`- [${link.title}](${link.url})`)
      }
      lines.push('')
    }
    const txt = lines.join('\n').trimEnd()
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return { sitemapXml, robotsTxt, llmsTxt }
}
