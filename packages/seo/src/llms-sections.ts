import type { LlmsTxtSection } from '@aihu-plugin/agent-readiness'
import type { SeoConfig } from './types.js'

/**
 * Returns an array of LlmsTxtSection entries for composition into
 * @aihu-plugin/agent-readiness's llmsSections config field.
 *
 * Usage:
 *   llmsSections: [...userSections, ...seoLlmsSections(config)]
 */
export function seoLlmsSections(config: SeoConfig): ReadonlyArray<LlmsTxtSection> {
  return [
    {
      title: config.siteName,
      links: (config.sitemapSources ?? []).map((s) => ({
        title: s.path,
        url: config.baseUrl + s.path,
      })),
    },
  ]
}
