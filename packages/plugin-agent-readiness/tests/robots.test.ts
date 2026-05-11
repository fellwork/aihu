import { describe, expect, it } from 'vitest'
import { AI_BOT_LIST, generateRobotsTxt } from '../src/index.ts'

describe('@aihu-plugin/agent-readiness robots', () => {
  it('AC-5: deny-all emits named bot Disallow entries and ends with wildcard Allow', () => {
    const output = generateRobotsTxt({ aiAgents: 'deny-all' })
    for (const bot of AI_BOT_LIST) {
      expect(output).toContain(`User-agent: ${bot}\nDisallow: /`)
    }
    expect(output).toContain('User-agent: *\nAllow: /')
    // S-3: must never emit a blanket wildcard deny (blocks humans)
    expect(output).not.toContain('User-agent: *\nDisallow: /')
  })

  it('allow-all (default): emits only wildcard Allow, no Disallow', () => {
    const out = generateRobotsTxt({ aiAgents: 'allow-all' })
    expect(out).toContain('User-agent: *')
    expect(out).toContain('Allow: /')
    expect(out).not.toContain('Disallow:')
  })

  it('appends Sitemap line when sitemap is provided', () => {
    const out = generateRobotsTxt({
      aiAgents: 'allow-all',
      sitemap: 'https://aihu.dev/sitemap.xml',
    })
    expect(out).toMatch(/Sitemap: https:\/\/aihu\.dev\/sitemap\.xml$/)
  })
})
