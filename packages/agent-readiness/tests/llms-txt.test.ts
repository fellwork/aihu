import { describe, expect, it } from 'vitest'
import { generateLlmsFullTxt, generateLlmsTxt } from '../src/index.ts'
import { agentMetadataToLlmsTxtLink } from '../src/llms-txt.ts'

describe('@scribe/agent-readiness llms txt', () => {
  it('AC-1: formats llms.txt with name, summary, sections, and optional links', () => {
    expect(
      generateLlmsTxt({
        name: 'Scribe',
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
      '# Scribe\n\n> Agent-facing docs.\n\n## Components\n- [x-card](/components#x-card): Card docs\n\n## Optional\n- [Changelog](/changelog)',
    )
  })

  it('generateLlmsFullTxt: promotes optional links under More heading (not Optional)', () => {
    const out = generateLlmsFullTxt({
      name: 'Scribe',
      summary: 'Full agent-facing docs.',
      sections: [
        { title: 'Guides', links: [{ title: 'Intro', url: '/intro', description: 'Start here' }] },
      ],
      optional: [{ title: 'Appendix', url: '/appendix' }],
    })
    expect(out).not.toContain('## Optional')
    expect(out).toContain('## More\n- [Appendix](/appendix)')
  })

  it('maps AgentMetadata to a components link only when describes is present', () => {
    expect(
      agentMetadataToLlmsTxtLink({ tag: 'x-pane', describes: 'Pane docs' }, 'https://scribe.dev'),
    ).toEqual({
      title: 'x-pane',
      url: 'https://scribe.dev/components#x-pane',
    })
    expect(agentMetadataToLlmsTxtLink({ tag: 'x-empty' }, 'https://scribe.dev')).toBeNull()
  })
})
