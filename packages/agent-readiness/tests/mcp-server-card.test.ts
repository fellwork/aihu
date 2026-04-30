import { describe, expect, it } from 'vitest'
import { agentMetadataToSkills, generateMcpServerCard } from '../src/mcp-server-card.ts'

describe('@scribe/agent-readiness mcp-server-card', () => {
  it('AC-2: generateMcpServerCard produces valid MCP Server Card', () => {
    const card = generateMcpServerCard({
      name: 'Test MCP', version: '1.0.0',
      endpoint: 'https://test.example.com/mcp',
      skills: [{ id: 'greet', name: 'Greet', description: 'Says hello.' }],
    })
    expect(card.$schema).toBe('https://modelcontextprotocol.io/schemas/server-card/v1.0')
    expect(card.version).toBe('1.0')
    expect(card.serverInfo.name).toBe('Test MCP')
    expect(['streamable-http', 'sse']).toContain(card.transport.type)
    expect(card.transport.url).toBe('https://test.example.com/mcp')
    expect(card.tools?.[0]?.name).toBe('Greet')
    expect(card.auth).toBeUndefined()
    expect(() => JSON.stringify(card)).not.toThrow()
    const cardWithAuth = generateMcpServerCard({
      name: 'Protected', version: '1.0.0', endpoint: 'https://secure.example.com/mcp',
      auth: { type: 'oauth2', authorizationUrl: 'https://auth.example.com/authorize',
              tokenUrl: 'https://auth.example.com/token', scopes: ['mcp:read'] },
    })
    expect(cardWithAuth.auth?.type).toBe('oauth2')
    const authStr = JSON.stringify(cardWithAuth.auth)
    expect(authStr).not.toContain('clientSecret')
    expect(authStr).not.toContain('password')
  })

  it('agentMetadataToSkills derives skills from actions', () => {
    const skills = agentMetadataToSkills({
      tag: 'x-btn',
      actions: { click: { desc: 'Clicks' } },
    })
    expect(skills).toHaveLength(1)
    expect(skills[0]).toEqual({ id: 'x-btn.click', name: 'click', description: 'Clicks' })
  })

  it('agentMetadataToSkills returns empty array when no actions', () => {
    const skills = agentMetadataToSkills({ tag: 'x-empty' })
    expect(skills).toEqual([])
  })

  it('generateMcpServerCard with description and homepage reflects in serverInfo', () => {
    const card = generateMcpServerCard({
      name: 'My App',
      version: '2.0.0',
      endpoint: 'https://example.com/mcp',
      description: 'A great app',
      homepage: 'https://example.com',
    })
    expect(card.serverInfo.description).toBe('A great app')
    expect(card.serverInfo.homepage).toBe('https://example.com')
  })

  it('generateMcpServerCard with transportType: sse uses sse transport', () => {
    const card = generateMcpServerCard({
      name: 'SSE App',
      version: '1.0.0',
      endpoint: 'https://example.com/mcp',
      transportType: 'sse',
    })
    expect(card.transport.type).toBe('sse')
  })

  it('generateMcpServerCard with protocolVersion overrides default', () => {
    const card = generateMcpServerCard({
      name: 'App',
      version: '1.0.0',
      endpoint: 'https://example.com/mcp',
      protocolVersion: '2025-01-01',
    })
    expect(card.protocolVersion).toBe('2025-01-01')
  })

  it('generateMcpServerCard default protocolVersion is 2025-06-18', () => {
    const card = generateMcpServerCard({
      name: 'App',
      version: '1.0.0',
      endpoint: 'https://example.com/mcp',
    })
    expect(card.protocolVersion).toBe('2025-06-18')
  })

  it('generateMcpServerCard auth block derives authorizationServer from tokenUrl origin', () => {
    const card = generateMcpServerCard({
      name: 'Protected',
      version: '1.0.0',
      endpoint: 'https://api.example.com/mcp',
      auth: {
        type: 'oauth2',
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/v1/token',
        scopes: ['read'],
      },
    })
    expect(card.auth?.authorizationServer).toBe(
      'https://auth.example.com/.well-known/oauth-authorization-server',
    )
    expect(card.auth?.resourceMetadata).toBe(
      'https://api.example.com/mcp/.well-known/oauth-protected-resource',
    )
  })
})
