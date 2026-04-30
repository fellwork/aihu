import { describe, expect, it } from 'vitest'
import { generateRobotsTxt, AI_BOT_LIST } from '../../src/robots.ts'

describe('robots.txt RFC 9309 compliance', () => {
  it('User-agent lines appear before Allow/Disallow in each block', () => {
    const out = generateRobotsTxt({ aiAgents: 'allow-all' })
    const blocks = out.split('\n\n').filter(b => b.trim().length > 0)
    for (const block of blocks) {
      const lines = block.split('\n')
      const firstAllowDisallow = lines.findIndex(l => l.startsWith('Allow:') || l.startsWith('Disallow:'))
      const firstUserAgent = lines.findIndex(l => l.startsWith('User-agent:'))
      if (firstAllowDisallow !== -1 && firstUserAgent !== -1) {
        expect(firstUserAgent).toBeLessThan(firstAllowDisallow)
      }
    }
  })

  it('no User-agent line has an empty value', () => {
    const out = generateRobotsTxt({ aiAgents: 'allow-all' })
    for (const line of out.split('\n')) {
      if (line.startsWith('User-agent:')) {
        expect(line.replace('User-agent:', '').trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('all Allow/Disallow paths start with /', () => {
    const out = generateRobotsTxt({
      standard: [{ userAgent: 'Googlebot', allow: ['/public'], disallow: ['/private'] }],
    })
    for (const line of out.split('\n')) {
      if (line.startsWith('Allow:') || line.startsWith('Disallow:')) {
        const path = line.split(':')[1]?.trim()
        if (path && path.length > 0) {
          expect(path).toMatch(/^\//)
        }
      }
    }
  })

  it('Sitemap appears after all User-agent records', () => {
    const out = generateRobotsTxt({ sitemap: 'https://example.com/sitemap.xml' })
    const sitemapIdx = out.indexOf('Sitemap:')
    const lastUserAgentIdx = out.lastIndexOf('User-agent:')
    expect(sitemapIdx).toBeGreaterThan(lastUserAgentIdx)
  })

  it('Crawl-delay value is a positive number when present', () => {
    const out = generateRobotsTxt({
      standard: [{ userAgent: 'Googlebot', allow: ['/'], crawlDelay: 10 }],
    })
    const cdLine = out.split('\n').find(l => l.startsWith('Crawl-delay:'))
    expect(cdLine).toBeDefined()
    const val = Number(cdLine!.replace('Crawl-delay:', '').trim())
    expect(val).toBeGreaterThan(0)
  })

  it('deny-all covers all AI_BOT_LIST entries', () => {
    const out = generateRobotsTxt({ aiAgents: 'deny-all' })
    for (const bot of AI_BOT_LIST) {
      expect(out).toContain(`User-agent: ${bot}`)
    }
  })

  it('default config (no args) returns a non-empty string', () => {
    const out = generateRobotsTxt()
    expect(out.trim().length).toBeGreaterThan(0)
    expect(out).toContain('User-agent:')
  })
})
