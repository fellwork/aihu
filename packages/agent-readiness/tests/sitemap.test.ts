import { describe, expect, it } from 'vitest'
import { generateSitemapXml } from '../src/sitemap.ts'

describe('generateSitemapXml', () => {
  it('produces valid XML with <loc> for a single URL', () => {
    const xml = generateSitemapXml({ pages: [{ url: 'https://example.com/' }] })
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('</urlset>')
  })

  it('includes lastmod when set', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/', lastmod: '2024-01-15' }],
    })
    expect(xml).toContain('<lastmod>2024-01-15</lastmod>')
  })

  it('omits lastmod when not set', () => {
    const xml = generateSitemapXml({ pages: [{ url: 'https://example.com/' }] })
    expect(xml).not.toContain('<lastmod>')
  })

  it('includes changefreq when set', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/', changefreq: 'weekly' }],
    })
    expect(xml).toContain('<changefreq>weekly</changefreq>')
  })

  it('omits changefreq when not set', () => {
    const xml = generateSitemapXml({ pages: [{ url: 'https://example.com/' }] })
    expect(xml).not.toContain('<changefreq>')
  })

  it('includes priority when set', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/', priority: 0.8 }],
    })
    expect(xml).toContain('<priority>0.8</priority>')
  })

  it('omits priority when not set', () => {
    const xml = generateSitemapXml({ pages: [{ url: 'https://example.com/' }] })
    expect(xml).not.toContain('<priority>')
  })

  it('formats priority to one decimal place for 1.0', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/', priority: 1 }],
    })
    expect(xml).toContain('<priority>1.0</priority>')
  })

  it('formats priority to one decimal place for 0.5', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/', priority: 0.5 }],
    })
    expect(xml).toContain('<priority>0.5</priority>')
  })

  it('escapes & in URL to &amp;', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/search?a=1&b=2' }],
    })
    expect(xml).toContain('https://example.com/search?a=1&amp;b=2')
    expect(xml).not.toContain('&b=2')
  })

  it('handles multiple pages', () => {
    const xml = generateSitemapXml({
      pages: [{ url: 'https://example.com/' }, { url: 'https://example.com/about' }],
    })
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/about</loc>')
  })

  it('produces an empty urlset for no pages', () => {
    const xml = generateSitemapXml({ pages: [] })
    expect(xml).toContain('<urlset')
    expect(xml).toContain('</urlset>')
    expect(xml).not.toContain('<url>')
  })
})
