import { describe, expect, it } from 'vitest'
import { createAgentReadinessRoutes } from '../src/index.ts'

describe('@aihu/agent-readiness createAgentReadinessRoutes', () => {
  const config = {
    name: 'Test App',
    version: '1.0.0',
    endpoint: 'https://test.example.com/mcp',
    summary: 'A test application.',
    llmsSections: [
      { title: 'Docs', links: [{ title: 'API', url: '/api', description: 'API reference' }] },
    ],
  }

  it('llmsTxt handler returns 200 text/plain with valid llms.txt content', async () => {
    const routes = createAgentReadinessRoutes(config)
    const req = new Request('https://test.example.com/llms.txt')
    const ctx = { params: {}, url: new URL('https://test.example.com/llms.txt') }
    const res = await routes.llmsTxt(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/)
    const body = await res.text()
    expect(body).toContain('# Test App')
    expect(body).toContain('> A test application.')
    expect(body).toContain('## Docs')
  })

  it('llmsFullTxt handler returns 200 with full content', async () => {
    const routes = createAgentReadinessRoutes(config)
    const req = new Request('https://test.example.com/llms-full.txt')
    const ctx = { params: {}, url: new URL('https://test.example.com/llms-full.txt') }
    const res = await routes.llmsFullTxt(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('# Test App')
  })

  it('mcpServerCard handler returns 200 JSON matching McpServerCard shape', async () => {
    const routes = createAgentReadinessRoutes(config)
    const req = new Request('https://test.example.com/.well-known/mcp/server-card.json')
    const ctx = {
      params: {},
      url: new URL('https://test.example.com/.well-known/mcp/server-card.json'),
    }
    const res = await routes.mcpServerCard(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
    const card = await res.json()
    expect(card.$schema).toBe('https://modelcontextprotocol.io/schemas/server-card/v1.0')
    expect(card.serverInfo.name).toBe('Test App')
    expect(card.transport.url).toBe('https://test.example.com/mcp')
  })

  it('mcpServerCard handler returns 404 when endpoint is absent', async () => {
    const routes = createAgentReadinessRoutes({ name: 'No Endpoint App' })
    const req = new Request('https://test.example.com/.well-known/mcp/server-card.json')
    const ctx = {
      params: {},
      url: new URL('https://test.example.com/.well-known/mcp/server-card.json'),
    }
    const res = await routes.mcpServerCard(req, ctx)
    expect(res.status).toBe(404)
  })

  it('robotsTxt handler returns 200 with valid robots.txt content', async () => {
    const routes = createAgentReadinessRoutes(config)
    const req = new Request('https://test.example.com/robots.txt')
    const ctx = { params: {}, url: new URL('https://test.example.com/robots.txt') }
    const res = await routes.robotsTxt(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/)
    const body = await res.text()
    expect(body).toContain('User-agent')
  })
})
