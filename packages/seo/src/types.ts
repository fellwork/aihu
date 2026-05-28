import type { RouteHandler } from '@aihu/server'

export interface SeoConfig {
  readonly siteName: string
  readonly baseUrl: string // e.g., 'https://example.com' (no trailing slash)
  readonly sitemapSources?: ReadonlyArray<SitemapSource>
  readonly jsonLdDefaults?: Partial<JsonLdPage>
  readonly robotsOptions?: RobotsOptions
}

export interface SitemapSource {
  readonly path: string // e.g., '/about', '/docs/getting-started'
  readonly lastmod?: string // ISO date
  readonly changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  readonly priority?: number // 0.0–1.0
}

export interface JsonLdPage {
  readonly '@context': string // 'https://schema.org'
  readonly '@type': string // 'WebPage', 'Article', etc.
  readonly name?: string
  readonly description?: string
  readonly url?: string
  [key: string]: unknown
}

export interface RobotsOptions {
  readonly disallowAiBots?: boolean // default: true
  readonly additionalRules?: ReadonlyArray<{
    userAgent: string
    allow?: string[]
    disallow?: string[]
  }>
}

export interface SeoRoutes {
  readonly sitemapXml: RouteHandler
  readonly robotsTxt: RouteHandler
  readonly llmsTxt: RouteHandler
}
