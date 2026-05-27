import type { JsonLdPage } from './types.js'

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
