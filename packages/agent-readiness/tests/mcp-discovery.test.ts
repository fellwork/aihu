import { describe, expect, it } from 'vitest'
import { generateMcpDiscovery } from '../src/mcp-discovery.ts'

describe('generateMcpDiscovery', () => {
  it('produces { mcpServers: { [key]: { url, name } } }', () => {
    const discovery = generateMcpDiscovery({
      name: 'aihu',
      url: 'https://aihu.dev/.well-known/mcp/server-card.json',
    })
    expect(discovery).toHaveProperty('mcpServers')
    const server = discovery.mcpServers['aihu']
    expect(server).toBeDefined()
    expect(server.url).toBe('https://aihu.dev/.well-known/mcp/server-card.json')
    expect(server.name).toBe('aihu')
  })

  it('normalizes "My App" to key "my-app"', () => {
    const discovery = generateMcpDiscovery({
      name: 'My App',
      url: 'https://myapp.example.com/mcp',
    })
    expect(discovery.mcpServers['my-app']).toBeDefined()
    expect(discovery.mcpServers['my-app'].name).toBe('My App')
  })

  it('normalizes "aihu" to key "aihu"', () => {
    const discovery = generateMcpDiscovery({
      name: 'aihu',
      url: 'https://aihu.dev/mcp',
    })
    expect(discovery.mcpServers['aihu']).toBeDefined()
  })

  it('includes description when provided', () => {
    const discovery = generateMcpDiscovery({
      name: 'My App',
      url: 'https://myapp.example.com/mcp',
      description: 'An awesome app',
    })
    expect(discovery.mcpServers['my-app'].description).toBe('An awesome app')
  })

  it('omits description when not provided', () => {
    const discovery = generateMcpDiscovery({
      name: 'My App',
      url: 'https://myapp.example.com/mcp',
    })
    expect('description' in discovery.mcpServers['my-app']).toBe(false)
  })

  it('strips leading and trailing hyphens from key', () => {
    const discovery = generateMcpDiscovery({
      name: '  My App  ',
      url: 'https://example.com/mcp',
    })
    // Leading/trailing spaces become hyphens then are stripped
    expect(Object.keys(discovery.mcpServers)[0]).not.toMatch(/^-|-$/)
  })
})
