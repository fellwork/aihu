import { createRequestRouter, defineRoute } from '@aihu/server'
import { describe, expect, it } from 'vitest'
import { createAgentReadinessRoutes, createContentNegotiationHandler } from '../src/index.ts'

describe('integration: createRequestRouter + createContentNegotiationHandler', () => {
  it('content-negotiation middleware intercepts text/markdown requests before route handler', async () => {
    const mdResolver = {
      async resolve(path: string) {
        if (path === '/docs') return '# Docs\nWelcome.'
        return null
      },
    }
    const cnMw = createContentNegotiationHandler({ resolver: mdResolver })
    const router = createRequestRouter(
      {
        routes: [defineRoute('/docs', () => new Response('<html>Docs</html>'))],
      },
      { middleware: [cnMw] },
    )

    // text/markdown — should get markdown, not HTML
    const mdReq = new Request('https://example.com/docs', {
      headers: { Accept: 'text/markdown' },
    })
    const mdRes = await router(mdReq)
    expect(mdRes.status).toBe(200)
    expect(mdRes.headers.get('Content-Type')).toMatch(/text\/markdown/)
    expect(await mdRes.text()).toContain('# Docs')

    // text/html — should get HTML from route handler
    const htmlReq = new Request('https://example.com/docs', {
      headers: { Accept: 'text/html' },
    })
    const htmlRes = await router(htmlReq)
    expect(htmlRes.status).toBe(200)
    expect(await htmlRes.text()).toBe('<html>Docs</html>')
  })

  it('agent-readiness routes integrate with createRequestRouter', async () => {
    const ar = createAgentReadinessRoutes({
      name: 'Integration Test App',
      endpoint: 'https://app.example.com/mcp',
    })
    const router = createRequestRouter({
      routes: [
        defineRoute('/llms.txt', ar.llmsTxt),
        defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
        defineRoute('/robots.txt', ar.robotsTxt),
      ],
    })

    const llmsRes = await router(new Request('https://app.example.com/llms.txt'))
    expect(llmsRes.status).toBe(200)
    expect(await llmsRes.text()).toContain('# Integration Test App')

    const cardRes = await router(
      new Request('https://app.example.com/.well-known/mcp/server-card.json'),
    )
    expect(cardRes.status).toBe(200)
    const card = await cardRes.json()
    expect(card.serverInfo.name).toBe('Integration Test App')

    const robotsRes = await router(new Request('https://app.example.com/robots.txt'))
    expect(robotsRes.status).toBe(200)
  })
})
