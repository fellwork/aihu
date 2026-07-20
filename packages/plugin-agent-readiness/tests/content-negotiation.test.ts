import { describe, expect, it } from 'vitest'
import type { MarkdownResolver } from '../src/content-negotiation.ts'
import {
  createContentNegotiationHandler,
  isAiCrawlerUserAgent,
} from '../src/content-negotiation.ts'
import { AI_BOT_LIST } from '../src/robots.ts'

describe('@aihu-plugin/agent-readiness content-negotiation', () => {
  it('AC-3: returns text/markdown when Accept includes text/markdown', async () => {
    const resolver: MarkdownResolver = {
      async resolve(path) {
        return path === '/about' ? '# About\nThis is about.' : null
      },
    }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/about', {
      headers: { Accept: 'text/html, text/markdown' },
    })
    let nextCalled = false
    const res = await mw(req, async () => {
      nextCalled = true
      return new Response('HTML')
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/)
    expect(Number(res.headers.get('x-markdown-tokens'))).toBeGreaterThan(0)
    expect(await res.text()).toContain('# About')
    expect(nextCalled).toBe(false)
  })

  it('AC-4: falls through when resolver returns null', async () => {
    const resolver: MarkdownResolver = {
      async resolve(_path) {
        return null
      },
    }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/missing', {
      headers: { Accept: 'text/markdown' },
    })
    let nextCalled = false
    const res = await mw(req, async () => {
      nextCalled = true
      return new Response('Fallback')
    })
    expect(nextCalled).toBe(true)
    expect(await res.text()).toBe('Fallback')
  })

  it('falls through when Accept does not include text/markdown', async () => {
    const resolver: MarkdownResolver = {
      async resolve() {
        return '# Should not be returned'
      },
    }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/about', {
      headers: { Accept: 'text/html, application/json' },
    })
    let nextCalled = false
    const res = await mw(req, async () => {
      nextCalled = true
      return new Response('HTML page')
    })
    expect(nextCalled).toBe(true)
    expect(await res.text()).toBe('HTML page')
  })

  it('custom estimateTokens is used for x-markdown-tokens header', async () => {
    const content = '# Test\n\nSome content here.'
    const resolver: MarkdownResolver = {
      async resolve() {
        return content
      },
    }
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
    const resolver: MarkdownResolver = {
      async resolve() {
        return content
      },
    }
    const mw = createContentNegotiationHandler({ resolver })
    const req = new Request('https://example.com/', {
      headers: { Accept: 'text/markdown' },
    })
    const res = await mw(req, async () => new Response('fallback'))
    expect(res.headers.get('x-markdown-tokens')).toBe('2')
  })
})

// ─── DA2: user-agent-aware negotiation, BOTH directions ──────────────────────
//
// AI crawlers do not send `Accept: text/markdown` — of 7 agents tested only 3
// do, and those are coding agents, not search crawlers (docs/domain-hints/
// seo-and-agent-discoverability.md §7.5). Meanwhile GPTBot/ClaudeBot/
// PerplexityBot fetch ~940M pages/month and none execute JS (§1.2). Without a
// UA fallback the negotiation path is unreachable for the clients with volume.
//
// The over-application direction matters EQUALLY: serving markdown to a human
// is a thesis violation in the opposite direction.

const markdownResolver: MarkdownResolver = {
  async resolve() {
    return '# Doc\n\nbody'
  },
}

const negotiate = async (headers: Record<string, string>, opts = {}) => {
  const mw = createContentNegotiationHandler({ resolver: markdownResolver, ...opts })
  return mw(
    new Request('https://example.com/docs', { headers }),
    async () =>
      new Response('<html><body>ui</body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
  )
}

const isMarkdown = (res: Response) =>
  (res.headers.get('Content-Type') ?? '').includes('text/markdown')

describe('DA2: agent direction — crawlers with NO Accept header receive markdown', () => {
  it('DA2: a GPTBot user-agent with NO Accept header receives markdown', async () => {
    const res = await negotiate({
      'User-Agent':
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
    })
    expect(isMarkdown(res)).toBe(true)
    expect(res.headers.get('x-content-negotiated-by')).toBe('user-agent')
    expect(await res.text()).toContain('# Doc')
  })

  it.each([
    ['ClaudeBot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['PerplexityBot', 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/bot)'],
    ['CCBot', 'CCBot/2.0 (https://commoncrawl.org/faq/)'],
    ['OAI-SearchBot', 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'],
    ['Bytespider', 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)'],
  ])('DA2: %s with no Accept header receives markdown', async (_name, ua) => {
    expect(isMarkdown(await negotiate({ 'User-Agent': ua }))).toBe(true)
  })

  it('DA2: a crawler sending Accept: */* still receives markdown', async () => {
    expect(isMarkdown(await negotiate({ 'User-Agent': 'GPTBot/1.1', Accept: '*/*' }))).toBe(true)
  })

  it('DA2: an explicit Accept: text/markdown still wins, and is reported as such', async () => {
    const res = await negotiate({ Accept: 'text/markdown' })
    expect(isMarkdown(res)).toBe(true)
    expect(res.headers.get('x-content-negotiated-by')).toBe('accept')
  })
})

describe('DA2: human direction — browsers must keep receiving HTML', () => {
  it('DA2: a browser UA receives HTML, never markdown', async () => {
    const res = await negotiate({
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    })
    expect(isMarkdown(res)).toBe(false)
    expect(await res.text()).toContain('<html>')
  })

  it.each([
    // Safari on macOS: contains "AppleWebKit", which must NOT match "Applebot".
    [
      'Safari/macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    ],
    ['Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'],
    [
      'Chrome/Android',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ],
  ])('DA2: %s is not mistaken for a crawler, even with no Accept header', async (_name, ua) => {
    expect(isAiCrawlerUserAgent(ua)).toBe(false)
    expect(isMarkdown(await negotiate({ 'User-Agent': ua }))).toBe(false)
  })

  it('DA2: an explicit text/html preference beats a crawler UA', async () => {
    // The UA is only ever a DEFAULT for a client that expressed nothing. A
    // client that asked for HTML gets HTML, whatever its user-agent says.
    const res = await negotiate({ 'User-Agent': 'GPTBot/1.1', Accept: 'text/html' })
    expect(isMarkdown(res)).toBe(false)
  })

  it('DA2: a request with neither Accept nor User-Agent receives HTML', async () => {
    expect(isMarkdown(await negotiate({}))).toBe(false)
  })
})

describe('DA2: configuration and cache correctness', () => {
  it('DA2: userAgentFallback:false restores strict Accept-only negotiation', async () => {
    expect(
      isMarkdown(await negotiate({ 'User-Agent': 'GPTBot/1.1' }, { userAgentFallback: false })),
    ).toBe(false)
    // The explicit-Accept path is unaffected by the opt-out.
    expect(
      isMarkdown(await negotiate({ Accept: 'text/markdown' }, { userAgentFallback: false })),
    ).toBe(true)
  })

  it('DA2: isAgentUserAgent can override detection', async () => {
    const opts = { isAgentUserAgent: (ua: string) => ua === 'my-private-agent' }
    expect(isMarkdown(await negotiate({ 'User-Agent': 'my-private-agent' }, opts))).toBe(true)
    expect(isMarkdown(await negotiate({ 'User-Agent': 'GPTBot/1.1' }, opts))).toBe(false)
  })

  it('DA2: both representations carry Vary: Accept, User-Agent', async () => {
    // One URL now yields two representations. A shared cache that saw Vary on
    // only the markdown variant would serve that markdown to a browser.
    const md = await negotiate({ 'User-Agent': 'GPTBot/1.1' })
    expect(md.headers.get('Vary')).toContain('User-Agent')
    const html = await negotiate({ Accept: 'text/html' })
    expect(html.headers.get('Vary')).toContain('User-Agent')
  })

  it('DA2: a crawler UA on a path the resolver cannot serve falls through to HTML', async () => {
    const mw = createContentNegotiationHandler({
      resolver: {
        async resolve() {
          return null
        },
      },
    })
    const res = await mw(
      new Request('https://example.com/app', { headers: { 'User-Agent': 'GPTBot/1.1' } }),
      async () => new Response('<html>ui</html>'),
    )
    expect(isMarkdown(res)).toBe(false)
    expect(await res.text()).toContain('<html>')
  })

  it('DA2: the crawler list is the SAME AI_BOT_LIST robots.txt is generated from', async () => {
    // A second bot list would be a `check:derived` violation. Assert reuse by
    // driving detection with every token robots.txt advertises.
    for (const bot of AI_BOT_LIST) {
      expect(isAiCrawlerUserAgent(`Mozilla/5.0 (compatible; ${bot}/1.0)`)).toBe(true)
    }
  })
})
