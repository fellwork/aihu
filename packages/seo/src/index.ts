/**
 * @aihu/seo — DEPRECATED compatibility shim (#430).
 *
 * This package consolidated into `@aihu-plugin/agent-readiness`; the name is
 * kept for discoverability (someone wanting SEO searches "seo"), but every
 * capability now lives in the sibling:
 *
 *   - sitemap.xml / robots.txt / llms.txt → `createAgentReadinessRoutes`
 *   - `seoLlmsSections`                   → ported, re-exported here
 *   - JSON-LD (`JsonLdPage`, `generateJsonLd`) → ported, `JsonLdPage` re-exported here
 *
 * Behavioral guarantee: entering through this shim with
 * `robotsOptions.disallowAiBots` ABSENT preserves the historical
 * block-all-AI-bots default (`deny-all`) and emits a deprecation warning.
 * The new tiered default (`aiAgents: 'allow-agents'`) applies only to the
 * new package.
 */
/** @deprecated Import `seoLlmsSections` from `@aihu-plugin/agent-readiness`. */
export { seoLlmsSections } from '@aihu-plugin/agent-readiness'
export { seo } from './plugin.js'
export { createSeoRoutes } from './routes.js'
export type {
  JsonLdPage,
  RobotsOptions,
  SeoConfig,
  SeoRoutes,
  SitemapSource,
} from './types.js'
