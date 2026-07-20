import { describe, expect, it } from 'vitest'
import {
  generateJsonLd,
  generateLlmsFullTxt,
  generateLlmsTxt,
  seoLlmsSections,
} from '../src/index.ts'
import { agentMetadataToLlmsTxtLink } from '../src/llms-txt.ts'

describe('@aihu-plugin/agent-readiness llms txt', () => {
  it('AC-1: formats llms.txt with name, summary, sections, and optional links', () => {
    expect(
      generateLlmsTxt({
        name: 'Aihu',
        summary: 'Agent-facing docs.',
        sections: [
          {
            title: 'Components',
            links: [{ title: 'x-card', url: '/components#x-card', description: 'Card docs' }],
          },
        ],
        optional: [{ title: 'Changelog', url: '/changelog' }],
      }),
    ).toBe(
      '# Aihu\n\n> Agent-facing docs.\n\n## Components\n- [x-card](/components#x-card): Card docs\n\n## Optional\n- [Changelog](/changelog)',
    )
  })

  it('generateLlmsFullTxt: promotes optional links under More heading (not Optional)', () => {
    const out = generateLlmsFullTxt({
      name: 'Aihu',
      summary: 'Full agent-facing docs.',
      sections: [
        { title: 'Guides', links: [{ title: 'Intro', url: '/intro', description: 'Start here' }] },
      ],
      optional: [{ title: 'Appendix', url: '/appendix' }],
    })
    expect(out).not.toContain('## Optional')
    expect(out).toContain('## More\n- [Appendix](/appendix)')
  })

  it('AC-1b: renders a ## Components section with actions and state', () => {
    const out = generateLlmsTxt({
      name: 'Aihu',
      sections: [],
      components: [
        {
          tag: 'x-card',
          describes: 'A flippable card.',
          actions: { flip: { returns: { face: { type: 'enum' } } }, reset: { returns: {} } },
          state: { face: 'currently visible face' },
        },
      ],
    })
    expect(out).toContain('## Components')
    expect(out).toContain('### x-card')
    expect(out).toContain('A flippable card.')
    expect(out).toContain('Actions:')
    expect(out).toContain('- `flip()` → { face: enum }')
    expect(out).toContain('- `reset()` → {}')
    expect(out).toContain('State:')
    expect(out).toContain('- `face`: currently visible face')
  })

  it('Components section: zero components omits the header entirely', () => {
    const out = generateLlmsTxt({
      name: 'Aihu',
      sections: [{ title: 'Docs', links: [{ title: 'API', url: '/api' }] }],
      components: [],
    })
    expect(out).not.toContain('## Components')
  })

  it('Components section: renders many components in order, keeping Optional last', () => {
    const out = generateLlmsTxt({
      name: 'Aihu',
      sections: [],
      components: [
        { tag: 'x-a', describes: 'A.' },
        { tag: 'x-b', describes: 'B.' },
        { tag: 'x-c', describes: 'C.' },
      ],
      optional: [{ title: 'Changelog', url: '/changelog' }],
    })
    expect(out.indexOf('### x-a')).toBeLessThan(out.indexOf('### x-b'))
    expect(out.indexOf('### x-b')).toBeLessThan(out.indexOf('### x-c'))
    const h2s = out.split('\n').filter((l) => l.startsWith('## '))
    expect(h2s[h2s.length - 1]).toBe('## Optional')
  })

  it('Components section: a component with actions but no state omits the State block', () => {
    const out = generateLlmsTxt({
      name: 'Aihu',
      sections: [],
      components: [
        {
          tag: 'x-btn',
          describes: 'A button.',
          actions: { click: { returns: { ok: { type: 'boolean' } } } },
        },
      ],
    })
    expect(out).toContain('Actions:')
    expect(out).toContain('- `click()` → { ok: boolean }')
    expect(out).not.toContain('State:')
  })

  it('Components section: a component with state but no actions omits the Actions block', () => {
    const out = generateLlmsTxt({
      name: 'Aihu',
      sections: [],
      components: [{ tag: 'x-clock', describes: 'A live clock.', state: { time: 'current time' } }],
    })
    expect(out).toContain('State:')
    expect(out).toContain('- `time`: current time')
    expect(out).not.toContain('Actions:')
  })

  it('Components section: no trailing whitespace on any line', () => {
    const out = generateLlmsTxt({
      name: 'Aihu',
      summary: 'Docs.',
      sections: [{ title: 'Docs', links: [{ title: 'API', url: '/api' }] }],
      components: [
        {
          tag: 'x-card',
          describes: 'A flippable card.',
          actions: { flip: { returns: { face: { type: 'enum' } } } },
          state: { face: 'visible face' },
        },
      ],
      optional: [{ title: 'Changelog', url: '/changelog' }],
    })
    for (const line of out.split('\n')) expect(line).toBe(line.trimEnd())
  })

  it('generateLlmsFullTxt also renders the Components section', () => {
    const out = generateLlmsFullTxt({
      name: 'Aihu',
      sections: [],
      components: [{ tag: 'x-card', describes: 'A flippable card.' }],
    })
    expect(out).toContain('## Components')
    expect(out).toContain('### x-card')
  })

  it('maps AgentMetadata to a components link only when describes is present', () => {
    expect(
      agentMetadataToLlmsTxtLink({ tag: 'x-pane', describes: 'Pane docs' }, 'https://aihu.dev'),
    ).toEqual({
      title: 'x-pane',
      url: 'https://aihu.dev/components#x-pane',
    })
    expect(agentMetadataToLlmsTxtLink({ tag: 'x-empty' }, 'https://aihu.dev')).toBeNull()
  })
})

describe('#430 — ported seoLlmsSections + JSON-LD helpers', () => {
  it('seoLlmsSections builds one section titled after the site from sitemap sources', () => {
    const sections = seoLlmsSections({
      siteName: 'My App',
      baseUrl: 'https://x.test',
      sitemapSources: [{ path: '/docs' }, { path: '/about' }],
    })
    expect(sections).toEqual([
      {
        title: 'My App',
        links: [
          { title: '/docs', url: 'https://x.test/docs' },
          { title: '/about', url: 'https://x.test/about' },
        ],
      },
    ])
  })

  it('seoLlmsSections with no sources yields an empty-links section (skipped by the renderer)', () => {
    const sections = seoLlmsSections({ siteName: 'My App', baseUrl: 'https://x.test' })
    expect(sections[0]!.links).toHaveLength(0)
    expect(generateLlmsTxt({ name: 'My App', sections })).toBe('# My App')
  })

  it('generateJsonLd merges page overrides over schema.org WebPage defaults', () => {
    const parsed = JSON.parse(generateJsonLd({ '@type': 'Article', name: 'T' })) as Record<
      string,
      unknown
    >
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed['@type']).toBe('Article')
    expect(parsed.name).toBe('T')
  })
})
