/**
 * GX Phase 3 (#437-GX) — the compliance-tier noindex signal in
 * `createServerRouter.handle` (spec §8): a route whose compiled `extract.read`
 * is `'none'` or any hard value (`'verified'`/`'human'`/`{ scope }`) — or
 * malformed, fail-closed — carries `X-Robots-Tag: noindex`. Advisory only
 * (honored by compliant crawlers); the body is served in full either way —
 * hard-tier content withholding is Phase 4, not this header.
 */
import { describe, expect, it } from 'vitest'
import type { RouteDefinition } from '../src/index.ts'
import { createServerRouter } from '../src/server.ts'

function route(pattern: string, extract?: RouteDefinition['extract']): RouteDefinition {
  return {
    pattern,
    segments: pattern
      .split('/')
      .filter(Boolean)
      .map((p) => ({ kind: 'static' as const, path: p })),
    module: () => Promise.resolve({ default: { toHtml: () => '<div>page</div>' } }),
    ...(extract !== undefined ? { extract } : {}),
  }
}

async function headerFor(extract?: RouteDefinition['extract']): Promise<string | null> {
  const router = createServerRouter([route('/p', extract)])
  const res = await router.handle(new Request('http://localhost/p'))
  expect(res.status).toBe(200)
  return res.headers.get('X-Robots-Tag')
}

describe('handle() — X-Robots-Tag derivation from extract.read', () => {
  it('no declaration (pre-GX route) → no header (the resolved default is indexable)', async () => {
    expect(await headerFor()).toBeNull()
  })

  it("public compliance values ('all'/'agents'/'search') → no header", async () => {
    expect(await headerFor({ read: 'all', call: 'anonymous' })).toBeNull()
    expect(await headerFor({ read: 'agents', call: 'anonymous' })).toBeNull()
    expect(await headerFor({ read: 'search', call: 'anonymous' })).toBeNull()
  })

  it("read:'none' → noindex", async () => {
    expect(await headerFor({ read: 'none', call: 'anonymous' })).toBe('noindex')
  })

  it('hard values → noindex (and the body still serves — compliance tier only)', async () => {
    expect(await headerFor({ read: 'verified', call: 'verified' })).toBe('noindex')
    expect(await headerFor({ read: 'human', call: 'verified' })).toBe('noindex')
    expect(await headerFor({ read: { scope: 'reports:read' }, call: 'anonymous' })).toBe('noindex')
    const router = createServerRouter([route('/p', { read: 'verified', call: 'verified' })])
    const res = await router.handle(new Request('http://localhost/p'))
    expect(await res.text()).toContain('<div>page</div>')
  })

  it('a malformed read value fails closed → noindex', async () => {
    expect(await headerFor({ read: 'everyone', call: 'anonymous' })).toBe('noindex')
  })
})
