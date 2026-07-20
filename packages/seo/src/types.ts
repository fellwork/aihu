import type { RouteHandler } from '@aihu/server'
import type { JsonLdPage } from '@aihu-plugin/agent-readiness'

/**
 * @deprecated `@aihu/seo` is a thin compatibility shim over
 * `@aihu-plugin/agent-readiness` (#430). `JsonLdPage` now lives there; this
 * re-export is kept so existing imports keep compiling.
 */
export type { JsonLdPage } from '@aihu-plugin/agent-readiness'

/**
 * @deprecated Configure `@aihu-plugin/agent-readiness` instead
 * (`AgentReadinessConfig`): `siteName` → `name`, `baseUrl` → `siteUrl`,
 * `sitemapSources` → `sitemapPages`, `robotsOptions` → `aiAgents`/`standardBots`.
 */
export interface SeoConfig {
  readonly siteName: string
  readonly baseUrl: string // e.g., 'https://example.com' (no trailing slash)
  readonly sitemapSources?: ReadonlyArray<SitemapSource>
  readonly jsonLdDefaults?: Partial<JsonLdPage>
  readonly robotsOptions?: RobotsOptions
}

/** @deprecated Use `SitemapUrl` from `@aihu-plugin/agent-readiness` (absolute `url` instead of `path`). */
export interface SitemapSource {
  readonly path: string // e.g., '/about', '/docs/getting-started'
  readonly lastmod?: string // ISO date
  readonly changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  readonly priority?: number // 0.0–1.0
}

/**
 * @deprecated Use `aiAgents` on `@aihu-plugin/agent-readiness` instead:
 * `disallowAiBots: true` → `aiAgents: 'deny-all'`, `disallowAiBots: false` →
 * `aiAgents: 'allow-all'`, and the new tiered `aiAgents: 'allow-agents'`
 * (user-delegated fetchers allowed, training crawlers disallowed) is the
 * new package's default. Through THIS deprecated entry the historical
 * block-everything default (`deny-all`) is preserved when `disallowAiBots`
 * is absent — with a deprecation warning asking you to state your choice.
 */
export interface RobotsOptions {
  readonly disallowAiBots?: boolean // legacy default when absent: true (deny-all)
  readonly additionalRules?: ReadonlyArray<{
    userAgent: string
    allow?: string[]
    disallow?: string[]
  }>
}

/** @deprecated Use `createAgentReadinessRoutes` from `@aihu-plugin/agent-readiness`. */
export interface SeoRoutes {
  readonly sitemapXml: RouteHandler
  readonly robotsTxt: RouteHandler
  readonly llmsTxt: RouteHandler
}
