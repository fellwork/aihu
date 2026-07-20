import { afterEach, describe, expect, it } from 'vitest'
import { __resetRegistryForTesting, registerAgentMetadata } from '../../agent/src/registry.ts'
import {
  agentMetadataToSkills,
  generateMcpServerCard,
  skillsFromRegistry,
} from '../src/mcp-server-card.ts'

describe('@aihu-plugin/agent-readiness mcp-server-card', () => {
  afterEach(() => {
    __resetRegistryForTesting()
  })

  it('AC-2: generateMcpServerCard produces valid MCP Server Card', () => {
    const card = generateMcpServerCard({
      name: 'Test MCP',
      version: '1.0.0',
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
      name: 'Protected',
      version: '1.0.0',
      endpoint: 'https://secure.example.com/mcp',
      auth: {
        type: 'oauth2',
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['mcp:read'],
      },
    })
    expect(cardWithAuth.auth?.type).toBe('oauth2')
    const authStr = JSON.stringify(cardWithAuth.auth)
    expect(authStr).not.toContain('clientSecret')
    expect(authStr).not.toContain('password')
  })

  it('agentMetadataToSkills derives skills from actions', () => {
    const skills = agentMetadataToSkills({
      tag: 'x-btn',
      actions: { click: { describe: 'Clicks' } },
    })
    expect(skills).toHaveLength(1)
    expect(skills[0]).toEqual({ id: 'x-btn.click', name: 'click', description: 'Clicks' })
  })

  it('agentMetadataToSkills returns empty array when no actions', () => {
    const skills = agentMetadataToSkills({ tag: 'x-empty' })
    expect(skills).toEqual([])
  })

  it('DE1: server-card tools are DERIVED from the registry $action entries, not hand-edited', () => {
    // Simulate what the compiler emits from a component's `$action` block.
    registerAgentMetadata({
      tag: 'demo-root',
      actions: {
        increment: { returns: {}, describe: 'Add 1 to the value' },
        reset: { returns: {}, describe: 'Set the value to 0' },
      },
    })

    // No `skills` passed — the card must derive them from the live registry.
    const card = generateMcpServerCard({
      name: 'Demo',
      version: '0.1.0',
      endpoint: 'https://demo.example.com/mcp',
    })
    expect(card.tools?.map((t) => t.name).sort()).toEqual(['increment', 'reset'])
    expect(card.tools?.find((t) => t.name === 'increment')?.description).toBe('Add 1 to the value')

    // Remove an exposed action → the card changes WITHOUT touching config.
    __resetRegistryForTesting()
    registerAgentMetadata({
      tag: 'demo-root',
      actions: { increment: { returns: {}, describe: 'Add 1 to the value' } },
    })
    const after = generateMcpServerCard({
      name: 'Demo',
      version: '0.1.0',
      endpoint: 'https://demo.example.com/mcp',
    })
    expect(after.tools?.map((t) => t.name)).toEqual(['increment'])
  })

  it('DE1: an empty registry yields a card with no tools (no hand-written fallback)', () => {
    const card = generateMcpServerCard({
      name: 'Empty',
      version: '0.1.0',
      endpoint: 'https://empty.example.com/mcp',
    })
    expect(card.tools).toBeUndefined()
  })

  it('DE1: explicitly declared skills merge with registry-derived ones (deduped by id)', () => {
    registerAgentMetadata({
      tag: 'demo-root',
      actions: { increment: { returns: {}, describe: 'Add 1 to the value' } },
    })
    const card = generateMcpServerCard({
      name: 'Demo',
      version: '0.1.0',
      endpoint: 'https://demo.example.com/mcp',
      // A skill NOT in the registry is additive; a duplicate id defers to the
      // registry-derived source of truth.
      skills: [
        { id: 'demo-root.increment', name: 'increment', description: 'SHADOWED' },
        { id: 'other.thing', name: 'thing', description: 'A declared extra.' },
      ],
    })
    const names = card.tools?.map((t) => t.name)
    expect(names).toEqual(['increment', 'thing'])
    // registry description wins over the shadowing declared duplicate
    expect(card.tools?.find((t) => t.name === 'increment')?.description).toBe('Add 1 to the value')
  })

  it('skillsFromRegistry maps every registered component action to a skill', () => {
    registerAgentMetadata({ tag: 'a-one', actions: { go: { returns: {}, describe: 'Go' } } })
    registerAgentMetadata({ tag: 'b-two', actions: { stop: { returns: {}, describe: 'Stop' } } })
    const skills = skillsFromRegistry()
    expect(skills.map((s) => s.id).sort()).toEqual(['a-one.go', 'b-two.stop'])
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
