/**
 * XML Sitemap generator.
 * Spec: https://www.sitemaps.org/protocol.html
 */

export type SitemapChangefreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

export interface SitemapUrl {
  readonly url: string
  readonly lastmod?: string
  readonly changefreq?: SitemapChangefreq
  readonly priority?: number
}

export interface SitemapConfig {
  readonly pages: ReadonlyArray<SitemapUrl>
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generate a sitemap.xml string from a list of page URLs.
 * Pure function. No I/O.
 */
export function generateSitemapXml(config: SitemapConfig): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ]
  for (const page of config.pages) {
    lines.push('  <url>')
    lines.push(`    <loc>${escapeXml(page.url)}</loc>`)
    if (page.lastmod) lines.push(`    <lastmod>${page.lastmod}</lastmod>`)
    if (page.changefreq) lines.push(`    <changefreq>${page.changefreq}</changefreq>`)
    if (page.priority !== undefined) {
      lines.push(`    <priority>${page.priority.toFixed(1)}</priority>`)
    }
    lines.push('  </url>')
  }
  lines.push('</urlset>')
  return lines.join('\n')
}
