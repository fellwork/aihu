import { describe, expect, it } from 'vitest'
import { createAgentReadinessRoutes, viteAgentReadinessIntegration } from '../src/index.ts'

describe('@aihu-plugin/agent-readiness createAgentReadinessRoutes', () => {
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

describe('createAgentReadinessRoutes — a2aCard handler', () => {
  const ctx = { params: {}, url: new URL('https://test.example.com/.well-known/agent.json') }
  const req = new Request('https://test.example.com/.well-known/agent.json')

  it('returns 200 JSON when a2aCard: true and siteUrl is set', async () => {
    const routes = createAgentReadinessRoutes({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
      a2aCard: true,
    })
    const res = await routes.a2aCard(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
    const body = await res.json()
    expect(body.name).toBe('Test App')
    expect(body.url).toBe('https://test.example.com')
    expect(body.capabilities).toEqual({ streaming: false, pushNotifications: false })
  })

  it('returns 404 when a2aCard is absent', async () => {
    const routes = createAgentReadinessRoutes({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
    })
    const res = await routes.a2aCard(req, ctx)
    expect(res.status).toBe(404)
  })

  it('returns 404 when siteUrl is absent', async () => {
    const routes = createAgentReadinessRoutes({ name: 'Test App', a2aCard: true })
    const res = await routes.a2aCard(req, ctx)
    expect(res.status).toBe(404)
  })
})

describe('createAgentReadinessRoutes — mcpDiscovery handler', () => {
  const ctx = { params: {}, url: new URL('https://test.example.com/.well-known/mcp.json') }
  const req = new Request('https://test.example.com/.well-known/mcp.json')

  it('returns 200 JSON when mcpDiscovery: true and endpoint is set', async () => {
    const routes = createAgentReadinessRoutes({
      name: 'Test App',
      endpoint: 'https://test.example.com/mcp',
      mcpDiscovery: true,
    })
    const res = await routes.mcpDiscovery(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
    const body = await res.json()
    expect(body).toHaveProperty('mcpServers')
    const server = body.mcpServers['test-app']
    expect(server).toBeDefined()
    expect(server.url).toBe('https://test.example.com/mcp')
  })

  it('falls back to siteUrl when endpoint is absent', async () => {
    const routes = createAgentReadinessRoutes({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
      mcpDiscovery: true,
    })
    const res = await routes.mcpDiscovery(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mcpServers['test-app'].url).toBe(
      'https://test.example.com/.well-known/mcp/server-card.json',
    )
  })

  it('returns 404 when mcpDiscovery is absent', async () => {
    const routes = createAgentReadinessRoutes({
      name: 'Test App',
      endpoint: 'https://test.example.com/mcp',
    })
    const res = await routes.mcpDiscovery(req, ctx)
    expect(res.status).toBe(404)
  })

  it('returns 404 when neither endpoint nor siteUrl is set', async () => {
    const routes = createAgentReadinessRoutes({ name: 'Test App', mcpDiscovery: true })
    const res = await routes.mcpDiscovery(req, ctx)
    expect(res.status).toBe(404)
  })
})

describe('createAgentReadinessRoutes — sitemapXml handler', () => {
  const ctx = { params: {}, url: new URL('https://test.example.com/sitemap.xml') }
  const req = new Request('https://test.example.com/sitemap.xml')

  it('returns 200 application/xml when sitemapPages is provided', async () => {
    const routes = createAgentReadinessRoutes({
      name: 'Test App',
      sitemapPages: [{ url: 'https://test.example.com/' }],
    })
    const res = await routes.sitemapXml(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/xml/)
    const body = await res.text()
    expect(body).toContain('<loc>https://test.example.com/</loc>')
  })

  it('returns 404 when sitemapPages is absent', async () => {
    const routes = createAgentReadinessRoutes({ name: 'Test App' })
    const res = await routes.sitemapXml(req, ctx)
    expect(res.status).toBe(404)
  })
})

describe('viteAgentReadinessIntegration — transformIndexHtml', () => {
  const baseHtml = '<html><head><title>Test</title></head><body></body></html>'

  it('injects a JSON-LD SoftwareApplication script tag when siteUrl is set', () => {
    const plugin = viteAgentReadinessIntegration({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
    })
    const result = plugin.transformIndexHtml!(baseHtml)
    expect(result).toContain('<script type="application/ld+json">')
    expect(result).toContain('"@type":"SoftwareApplication"')
    expect(result).toContain('"url":"https://test.example.com"')
    expect(result).toContain('</head>')
  })

  it('skips injection when jsonLd: false', () => {
    const plugin = viteAgentReadinessIntegration({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
      jsonLd: false,
    })
    const result = plugin.transformIndexHtml!(baseHtml)
    expect(result).not.toContain('<script type="application/ld+json">')
    expect(result).toBe(baseHtml)
  })

  it('injects each object in jsonLd array as a separate script tag', () => {
    const plugin = viteAgentReadinessIntegration({
      name: 'Test App',
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
        { '@context': 'https://schema.org', '@type': 'WebSite', url: 'https://acme.com' },
      ],
    })
    const result = plugin.transformIndexHtml!(baseHtml)
    const matches = result.match(/<script type="application\/ld\+json">/g)
    expect(matches).toHaveLength(2)
  })

  it('includes description in auto-generated schema when summary is set', () => {
    const plugin = viteAgentReadinessIntegration({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
      summary: 'A great app',
    })
    const result = plugin.transformIndexHtml!(baseHtml)
    expect(result).toContain('"description":"A great app"')
  })

  it('includes version in auto-generated schema when version is set', () => {
    const plugin = viteAgentReadinessIntegration({
      name: 'Test App',
      siteUrl: 'https://test.example.com',
      version: '2.0.0',
    })
    const result = plugin.transformIndexHtml!(baseHtml)
    expect(result).toContain('"version":"2.0.0"')
  })

  it('skips injection when siteUrl is absent and jsonLd is absent', () => {
    const plugin = viteAgentReadinessIntegration({ name: 'Test App' })
    const result = plugin.transformIndexHtml!(baseHtml)
    expect(result).not.toContain('<script type="application/ld+json">')
  })
})
