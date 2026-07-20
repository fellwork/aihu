/**
 * JSON-LD structured-data helpers.
 *
 * Ported from `@aihu/seo` in the #430 consolidation — `JsonLdPage` and
 * `generateJsonLd` are live public API (the deprecated `@aihu/seo` shim
 * re-exports them, and examples consume `JsonLdPage` directly).
 *
 * The Vite integration's `<head>` injection path (`buildJsonLdTags` in
 * vite-plugin.ts, driven by `AgentReadinessConfig.jsonLd`) remains the
 * config-level JSON-LD surface; these helpers are the low-level building
 * blocks for hand-rolled emission.
 */

/** A schema.org page object. `@context`/`@type` plus arbitrary keys. */
export interface JsonLdPage {
  readonly '@context': string // 'https://schema.org'
  readonly '@type': string // 'WebPage', 'Article', etc.
  readonly name?: string
  readonly description?: string
  readonly url?: string
  [key: string]: unknown
}

const JSON_LD_DEFAULTS: Pick<JsonLdPage, '@context' | '@type'> = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
}

/**
 * Generate a JSON-LD object string. Merges the `page` argument over defaults.
 * The caller is responsible for wrapping the returned string in a
 * `<script type="application/ld+json">...</script>` tag.
 *
 * Defaults:
 *   - @context: 'https://schema.org'
 *   - @type: 'WebPage'
 */
export function generateJsonLd(page: Partial<JsonLdPage>): string {
  const merged: JsonLdPage = {
    ...JSON_LD_DEFAULTS,
    ...page,
  } as JsonLdPage
  return JSON.stringify(merged)
}
