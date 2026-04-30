import { describe, expect, it } from 'vitest'
import { createContentNegotiationHandler } from '../src/content-negotiation.ts'
import type { MarkdownResolver } from '../src/content-negotiation.ts'

describe('@scribe/agent-readiness content-negotiation', () => {
  it('AC-3: returns text/markdown when Accept includes text/markdown', async () => {
    const resolver: MarkdownResolver = {
      async resolve(path) { return path === '/about' ? '# About\nThis is about.' : null },
    }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/about', {
      headers: { Accept: 'text/html, text/markdown' },
    })
    let nextCalled = false
    const res = await mw(req, async () => { nextCalled = true; return new Response('HTML') })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/)
    expect(Number(res.headers.get('x-markdown-tokens'))).toBeGreaterThan(0)
    expect(await res.text()).toContain('# About')
    expect(nextCalled).toBe(false)
  })

  it('AC-4: falls through when resolver returns null', async () => {
    const resolver: MarkdownResolver = { async resolve(_path) { return null } }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/missing', {
      headers: { Accept: 'text/markdown' },
    })
    let nextCalled = false
    const res = await mw(req, async () => { nextCalled = true; return new Response('Fallback') })
    expect(nextCalled).toBe(true)
    expect(await res.text()).toBe('Fallback')
  })

  it('falls through when Accept does not include text/markdown', async () => {
    const resolver: MarkdownResolver = {
      async resolve() { return '# Should not be returned' },
    }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/about', {
      headers: { Accept: 'text/html, application/json' },
    })
    let nextCalled = false
    const res = await mw(req, async () => { nextCalled = true; return new Response('HTML page') })
    expect(nextCalled).toBe(true)
    expect(await res.text()).toBe('HTML page')
  })

  it('custom estimateTokens is used for x-markdown-tokens header', async () => {
    const content = '# Test\n\nSome content here.'
    const resolver: MarkdownResolver = { async resolve() { return content } }
    const estimateTokens = (_c: string) => 999
    const mw = createContentNegotiationHandler({ resolver, estimateTokens })
    const req = new Request('https://example.com/test', {
      headers: { Accept: 'text/markdown' },
    })
    const res = await mw(req, async () => new Response('fallback'))
    expect(res.headers.get('x-markdown-tokens')).toBe('999')
  })

  it('x-markdown-tokens default is ceil(content.length / 4)', async () => {
    const content = 'abcdefgh' // 8 chars → ceil(8/4) = 2
    const resolver: MarkdownResolver = { async resolve() { return content } }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/', {
      headers: { Accept: 'text/markdown' },
    })
    const res = await mw(req, async () => new Response('fallback'))
    expect(res.headers.get('x-markdown-tokens')).toBe('2')
  })
})
