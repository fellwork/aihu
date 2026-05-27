import type { SitemapSource } from './types.js'

/**
 * Generate a valid XML sitemap string from an array of SitemapSource entries.
 * Each URL entry derives its <loc> from baseUrl + source.path.
 */
export function generateSitemap(baseUrl: string, sources: ReadonlyArray<SitemapSource>): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ]

  for (const source of sources) {
    lines.push('  <url>')
    lines.push(`    <loc>${baseUrl}${source.path}</loc>`)
    if (source.lastmod !== undefined) {
      lines.push(`    <lastmod>${source.lastmod}</lastmod>`)
    }
    if (source.changefreq !== undefined) {
      lines.push(`    <changefreq>${source.changefreq}</changefreq>`)
    }
    if (source.priority !== undefined) {
      lines.push(`    <priority>${source.priority.toFixed(1)}</priority>`)
    }
    lines.push('  </url>')
  }

  lines.push('</urlset>')
  return lines.join('\n')
}
