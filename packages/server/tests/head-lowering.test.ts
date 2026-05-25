import { describe, expect, it } from 'vitest'
import type { RouteHead } from '../src/head-lowering.ts'
import { routeHeadToSsrHead } from '../src/head-lowering.ts'
import type { HeadConfig, MetaTag } from '../src/ssr.ts'
import { renderToString } from '../src/ssr.ts'

const SITE = 'https://example.com'

function metaWith(
  head: HeadConfig,
  key: { name?: string; property?: string },
): MetaTag | undefined {
  return (head.meta ?? []).find(
    (m) =>
      (key.name !== undefined && m.name === key.name) ||
      (key.property !== undefined && m.property === key.property),
  )
}

describe('routeHeadToSsrHead — field mapping', () => {
  const full: RouteHead = {
    title: 'My Post',
    description: 'A great post',
    canonical: '/posts/hello',
    og: {
      title: 'OG Title',
      description: 'OG Desc',
      image: '/img/hero.png',
      type: 'article',
      url: '/posts/hello',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'TW Title',
      description: 'TW Desc',
      image: '/img/hero.png',
      site: '@acme',
    },
    jsonld: '{"@context":"https://schema.org","@type":"Article","headline":"Hi"}',
  }

  it('maps title → HeadConfig.title', () => {
    expect(routeHeadToSsrHead(full, { siteUrl: SITE }).title).toBe('My Post')
  })

  it('maps description → <meta name=description>', () => {
    const head = routeHeadToSsrHead(full, { siteUrl: SITE })
    expect(metaWith(head, { name: 'description' })?.content).toBe('A great post')
  })

  it('maps canonical → <link rel=canonical> resolved absolute', () => {
    const head = routeHeadToSsrHead(full, { siteUrl: SITE })
    const link = (head.links ?? []).find((l) => l.rel === 'canonical')
    expect(link?.href).toBe('https://example.com/posts/hello')
  })

  it('maps og.* → og:* meta, image/url resolved absolute', () => {
    const head = routeHeadToSsrHead(full, { siteUrl: SITE })
    expect(metaWith(head, { property: 'og:title' })?.content).toBe('OG Title')
    expect(metaWith(head, { property: 'og:description' })?.content).toBe('OG Desc')
    expect(metaWith(head, { property: 'og:type' })?.content).toBe('article')
    expect(metaWith(head, { property: 'og:image' })?.content).toBe(
      'https://example.com/img/hero.png',
    )
    expect(metaWith(head, { property: 'og:url' })?.content).toBe('https://example.com/posts/hello')
  })

  it('maps twitter.* → twitter:* meta (image resolved absolute)', () => {
    const head = routeHeadToSsrHead(full, { siteUrl: SITE })
    expect(metaWith(head, { name: 'twitter:card' })?.content).toBe('summary_large_image')
    expect(metaWith(head, { name: 'twitter:title' })?.content).toBe('TW Title')
    expect(metaWith(head, { name: 'twitter:description' })?.content).toBe('TW Desc')
    expect(metaWith(head, { name: 'twitter:site' })?.content).toBe('@acme')
    expect(metaWith(head, { name: 'twitter:image' })?.content).toBe(
      'https://example.com/img/hero.png',
    )
  })

  it('maps jsonld → <script type=application/ld+json> (verbatim string)', () => {
    const head = routeHeadToSsrHead(full, { siteUrl: SITE })
    const script = (head.scripts ?? []).find((s) => s.type === 'application/ld+json')
    expect(script?.content).toBe(
      '{"@context":"https://schema.org","@type":"Article","headline":"Hi"}',
    )
  })

  it('jsonld given as a parsed object is JSON.stringified', () => {
    const head = routeHeadToSsrHead({ jsonld: { '@type': 'Thing', name: 'x' } }, {})
    const script = (head.scripts ?? []).find((s) => s.type === 'application/ld+json')
    expect(script?.content).toBe('{"@type":"Thing","name":"x"}')
  })
})

describe('routeHeadToSsrHead — URL resolution', () => {
  it('absolute canonical/og.image/og.url are left untouched', () => {
    const head = routeHeadToSsrHead(
      {
        canonical: 'https://other.com/x',
        og: { image: 'https://cdn.com/a.png', url: 'https://other.com/x' },
      },
      { siteUrl: SITE },
    )
    expect((head.links ?? [])[0]?.href).toBe('https://other.com/x')
    expect(metaWith(head, { property: 'og:image' })?.content).toBe('https://cdn.com/a.png')
    expect(metaWith(head, { property: 'og:url' })?.content).toBe('https://other.com/x')
  })

  it('protocol-relative URLs are left untouched', () => {
    const head = routeHeadToSsrHead({ og: { image: '//cdn.com/a.png' } }, { siteUrl: SITE })
    expect(metaWith(head, { property: 'og:image' })?.content).toBe('//cdn.com/a.png')
  })

  it('no siteUrl → relative values left as-is (documented)', () => {
    const head = routeHeadToSsrHead({ canonical: '/posts/hello' }, {})
    expect((head.links ?? [])[0]?.href).toBe('/posts/hello')
  })

  it('siteUrl without trailing slash resolves root-relative paths correctly', () => {
    const head = routeHeadToSsrHead({ canonical: '/a/b' }, { siteUrl: 'https://x.io' })
    expect((head.links ?? [])[0]?.href).toBe('https://x.io/a/b')
  })
})

describe('routeHeadToSsrHead — merge with globalHead', () => {
  const globalHead: HeadConfig = {
    title: 'Site Default',
    lang: 'en',
    meta: [
      { name: 'description', content: 'Global description' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }

  it('route title wins per field; global lang preserved', () => {
    const head = routeHeadToSsrHead({ title: 'Route Title' }, { globalHead })
    expect(head.title).toBe('Route Title')
    expect(head.lang).toBe('en')
  })

  it('global title kept when route has none', () => {
    const head = routeHeadToSsrHead({ description: 'd' }, { globalHead })
    expect(head.title).toBe('Site Default')
  })

  it('meta array key-merged: route description wins, global viewport preserved', () => {
    const head = routeHeadToSsrHead({ description: 'Route description' }, { globalHead })
    expect(metaWith(head, { name: 'description' })?.content).toBe('Route description')
    expect(metaWith(head, { name: 'viewport' })?.content).toBe(
      'width=device-width, initial-scale=1',
    )
  })

  it('links array key-merged: route canonical appended, global icon preserved', () => {
    const head = routeHeadToSsrHead({ canonical: '/here' }, { siteUrl: SITE, globalHead })
    const rels = (head.links ?? []).map((l) => l.rel)
    expect(rels).toContain('icon')
    expect(rels).toContain('canonical')
  })

  it('undefined head → returns globalHead unchanged', () => {
    expect(routeHeadToSsrHead(undefined, { globalHead })).toBe(globalHead)
  })

  it('undefined head + no globalHead → empty config', () => {
    expect(routeHeadToSsrHead(undefined, {})).toEqual({})
  })

  it('empty route head + no global → empty config (omits absent fields)', () => {
    expect(routeHeadToSsrHead({}, {})).toEqual({})
  })
})

describe('routeHeadToSsrHead — end-to-end via renderToString', () => {
  it('full RouteHead renders correct <head> markup', async () => {
    const head = routeHeadToSsrHead(
      {
        title: 'My Post',
        description: 'A great post',
        canonical: '/posts/hello',
        og: {
          title: 'OG Title',
          image: '/img/hero.png',
          type: 'article',
          url: '/posts/hello',
        },
        twitter: { card: 'summary_large_image', site: '@acme' },
        jsonld: '{"@context":"https://schema.org","@type":"Article"}',
      },
      { siteUrl: SITE },
    )

    const html = await renderToString({ toHtml: () => '<main>Body</main>' }, { head })

    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<title>My Post</title>')
    expect(html).toContain('<meta name="description" content="A great post">')
    expect(html).toContain('<link rel="canonical" href="https://example.com/posts/hello">')
    expect(html).toContain('<meta property="og:title" content="OG Title">')
    expect(html).toContain('<meta property="og:image" content="https://example.com/img/hero.png">')
    expect(html).toContain('<meta property="og:url" content="https://example.com/posts/hello">')
    expect(html).toContain('<meta property="og:type" content="article">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html).toContain('<meta name="twitter:site" content="@acme">')
    expect(html).toContain(
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>',
    )
    expect(html).toContain('<main>Body</main>')
    // JSON-LD script lands inside <head>.
    expect(html.indexOf('application/ld+json')).toBeLessThan(html.indexOf('</head>'))
  })

  it('JSON-LD content with a </script> sequence is neutralized', async () => {
    const head = routeHeadToSsrHead({ jsonld: '{"x":"</script><b>oops"}' }, {})
    const html = await renderToString({ toHtml: () => '' }, { head })
    // No raw closing tag escapes the script element.
    expect(html).not.toContain('</script><b>oops')
    expect(html).toContain('<\\/script>')
  })
})
