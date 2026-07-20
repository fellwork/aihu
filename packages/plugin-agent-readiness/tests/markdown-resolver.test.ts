import { describe, expect, it } from 'vitest'
import type { ComponentMetaLike } from '../src/llms-txt.ts'
import { createRouteMarkdownResolver, RouteMarkdownResolver } from '../src/markdown-resolver.ts'

const components: ReadonlyArray<ComponentMetaLike> = [
  {
    tag: 'product-search',
    describes: 'Search the catalog.',
    actions: { search: { returns: { results: { type: 'Product[]' } } } },
    state: { query: 'the current query string' },
  },
]

const resolver = () =>
  new RouteMarkdownResolver({
    siteName: 'Shop',
    readComponents: () => components,
    routes: [
      {
        path: '/about',
        title: 'About Shop',
        description: 'Who we are.',
        body: 'We sell things.',
      },
      { path: '/search', title: 'Search', components: ['product-search'] },
      { path: '/', title: 'Home' },
    ],
  })

describe('RouteMarkdownResolver', () => {
  it('DA1: renders a declared route as markdown', async () => {
    const md = await resolver().resolve('/about')
    expect(md).toContain('# About Shop')
    expect(md).toContain('> Who we are.')
    expect(md).toContain('We sell things.')
  })

  it('DA1: returns null for an undeclared route, so HTML still serves', async () => {
    expect(await resolver().resolve('/nope')).toBeNull()
  })

  it('DA1: projects callable actions that never appear in rendered HTML', async () => {
    const md = await resolver().resolve('/search')
    // The load-bearing claim: this section is derived from declarations, so an
    // HTML->markdown converter (the CDN approach) could not have produced it.
    expect(md).toContain('## Interactive capabilities')
    expect(md).toContain('### product-search')
    expect(md).toContain('`search()` → { results: Product[] }')
    expect(md).toContain('`query`: the current query string')
  })

  it('DA1: omits the capabilities section when the route declares no components', async () => {
    const md = await resolver().resolve('/about')
    expect(md).not.toContain('## Interactive capabilities')
  })

  it('DA1: a declared component absent from the registry is skipped, not rendered empty', async () => {
    const r = new RouteMarkdownResolver({
      readComponents: () => [],
      routes: [{ path: '/search', title: 'Search', components: ['product-search'] }],
    })
    const md = await r.resolve('/search')
    expect(md).toContain('# Search')
    expect(md).not.toContain('## Interactive capabilities')
  })

  it('DA1: `/about.md` and `/about/` address the same route as `/about`', async () => {
    const r = resolver()
    const canonical = await r.resolve('/about')
    expect(await r.resolve('/about.md')).toBe(canonical)
    expect(await r.resolve('/about/')).toBe(canonical)
  })

  it('DA1: root path is not collapsed away', async () => {
    expect(await resolver().resolve('/')).toContain('# Home')
  })

  it('DA1: rejects traversal and null-byte paths', async () => {
    const r = resolver()
    expect(await r.resolve('/../etc/passwd')).toBeNull()
    expect(await r.resolve('/about/../../secret')).toBeNull()
    expect(await r.resolve('/about\0.md')).toBeNull()
    expect(await r.resolve('about')).toBeNull()
  })

  it('DA1: never throws — a failing registry read resolves to null', async () => {
    const r = new RouteMarkdownResolver({
      readComponents: () => {
        throw new Error('registry exploded')
      },
      routes: [{ path: '/search', title: 'Search', components: ['product-search'] }],
    })
    await expect(r.resolve('/search')).resolves.toBeNull()
  })

  it('DA1: exposes its route keys', () => {
    expect(resolver().paths).toEqual(['/about', '/search', '/'])
  })

  it('DA1: the factory form produces an equivalent resolver', async () => {
    const r = createRouteMarkdownResolver({
      siteName: 'Shop',
      readComponents: () => components,
      routes: [{ path: '/about', title: 'About Shop' }],
    })
    expect(await r.resolve('/about')).toContain('# About Shop')
  })

  it('DA1: falls back to siteName then path when a route declares no title', async () => {
    const named = new RouteMarkdownResolver({ siteName: 'Shop', routes: [{ path: '/x' }] })
    expect(await named.resolve('/x')).toContain('# Shop')
    const unnamed = new RouteMarkdownResolver({ routes: [{ path: '/x' }] })
    expect(await unnamed.resolve('/x')).toContain('# /x')
  })
})
