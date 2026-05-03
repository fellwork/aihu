import { describe, expect, it } from 'vitest'
import { createRequestRouter, defineRoute } from '@scribe/server'
import { createAgentReadinessRoutes, createContentNegotiationHandler } from '../../src/index.ts'

const config = {
  name: 'isitagentready Test App',
  version: '1.0.0',
  endpoint: 'https://app.example.com/mcp',
  summary: 'Test app for isitagentready compliance.',
  llmsSections: [{ title: 'Docs', links: [{ title: 'API', url: '/api', description: 'API docs' }] }],
}

function buildRouter() {
  const ar = createAgentReadinessRoutes(config)
  const mdResolver = {
    async resolve(path: string) {
      if (path === '/about') return '# About\nThis app is ready.'
      return null
    },
  }
  const cnMw = createContentNegotiationHandler({ resolver: mdResolver })
  return createRequestRouter(
    {
      routes: [
        defineRoute('/llms.txt', ar.llmsTxt),
        defineRoute('/llms-full.txt', ar.llmsFullTxt),
        defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
        defineRoute('/robots.txt', ar.robotsTxt),
        defineRoute('/about', () => new Response('<html>About</html>')),
      ],
    },
    { middleware: [cnMw] },
  )
}

describe('isitagentready.com endpoint checklist', () => {
  it('GET /llms.txt returns 200 text/plain starting with # {name}', async () => {
    const router = buildRouter()
    const res = await router(new Request('https://app.example.com/llms.txt'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/)
    const body = await res.text()
    expect(body.trimStart()).toMatch(/^# isitagentready Test App/)
  })

  it('GET /llms-full.txt returns 200 with no ## Optional heading', async () => {
    const router = buildRouter()
    const res = await router(new Request('https://app.example.com/llms-full.txt'))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.trimStart()).toMatch(/^# /)
    expect(body).not.toContain('## Optional')
  })

  it('GET /.well-known/mcp/server-card.json returns 200 JSON with valid McpServerCard', async () => {
    const router = buildRouter()
    const res = await router(new Request('https://app.example.com/.well-known/mcp/server-card.json'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
    const card = await res.json()
    expect(card.$schema).toBe('https://modelcontextprotocol.io/schemas/server-card/v1.0')
    expect(card.serverInfo.name).toBe('isitagentready Test App')
  })

  it('GET /robots.txt returns 200 text/plain with User-agent entries', async () => {
    const router = buildRouter()
    const res = await router(new Request('https://app.example.com/robots.txt'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/)
    expect(await res.text()).toContain('User-agent:')
  })

  it('GET /about with Accept: text/markdown returns text/markdown via content negotiation', async () => {
    const router = buildRouter()
    const res = await router(new Request('https://app.example.com/about', {
      headers: { Accept: 'text/markdown' },
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/)
    expect(await res.text()).toContain('# About')
  })

  it('GET /about with Accept: text/html falls through to HTML route handler', async () => {
    const router = buildRouter()
    const res = await router(new Request('https://app.example.com/about', {
      headers: { Accept: 'text/html' },
    }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>About</html>')
  })

  it('GET /.well-known/mcp/server-card.json returns 404 when endpoint absent', async () => {
    const ar = createAgentReadinessRoutes({ name: 'No Endpoint' })
    const router = createRequestRouter({ routes: [defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard)] })
    const res = await router(new Request('https://app.example.com/.well-known/mcp/server-card.json'))
    expect(res.status).toBe(404)
  })
})
