/**
 * B2 tests for @aihu/router — per-route `<head>` threading:
 *   - RouteHead type is part of RouteDefinition (type-level)
 *   - RouteSidecar carries `head`
 *   - `head` survives into the generated `virtual:aihu-routes` module
 *     (i.e. the SK sidecar-key allowlist passes it through)
 *   - a route WITHOUT `head` stays backward compatible (no head key)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RouteDefinition, RouteHead } from '../src/index.ts'
import { readRouteSidecar, viteRouterPlugin } from '../src/vite-plugin.ts'

// ---------------------------------------------------------------------------
// Type-level: RouteHead on RouteDefinition
// ---------------------------------------------------------------------------

describe('RouteHead — type surface', () => {
  it('accepts a fully populated head on a RouteDefinition', () => {
    const head: RouteHead = {
      title: 'About Us',
      description: 'Who we are',
      canonical: '/about',
      og: {
        title: 'About',
        description: '...',
        image: '/og.png',
        type: 'website',
        url: '/about',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'About',
        description: '...',
        image: '/og.png',
        site: '@acme',
      },
      jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
    }
    const route: RouteDefinition = {
      pattern: '/about',
      segments: [{ kind: 'static', path: 'about' }],
      module: () => Promise.resolve({ default: {} }),
      head,
    }
    expect(route.head?.title).toBe('About Us')
    expect(route.head?.og?.image).toBe('/og.png')
    expect(route.head?.twitter?.card).toBe('summary_large_image')
    expect((route.head?.jsonld as { '@type': string })['@type']).toBe('Organization')
  })

  it('head is optional — a plain route omits it', () => {
    const route: RouteDefinition = {
      pattern: '/',
      segments: [],
      module: () => Promise.resolve({ default: {} }),
    }
    expect(route.head).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// readRouteSidecar() carries `head`
// ---------------------------------------------------------------------------

describe('readRouteSidecar() — head field', () => {
  it('reads a head block out of the sidecar JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-head-'))
    try {
      const sidecar = {
        name: 'about',
        ssr: true,
        head: {
          title: 'About Us',
          description: 'Who we are',
          canonical: '/about',
          og: { title: 'About', image: '/og.png', type: 'website' },
          twitter: { card: 'summary_large_image', site: '@acme' },
          jsonld: { '@context': 'https://schema.org', '@type': 'Organization' },
        },
      }
      writeFileSync(join(tmp, 'about.aihu'), '')
      writeFileSync(join(tmp, 'about.route.json'), JSON.stringify(sidecar))
      const result = readRouteSidecar(join(tmp, 'about.aihu'))
      expect(result?.head?.title).toBe('About Us')
      expect(result?.head?.og?.image).toBe('/og.png')
      expect(result?.head?.jsonld).toEqual({
        '@context': 'https://schema.org',
        '@type': 'Organization',
      })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('omits head when the sidecar has none', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-head-'))
    try {
      writeFileSync(join(tmp, 'plain.aihu'), '')
      writeFileSync(join(tmp, 'plain.route.json'), JSON.stringify({ name: 'plain', ssr: true }))
      const result = readRouteSidecar(join(tmp, 'plain.aihu'))
      expect(result?.head).toBeUndefined()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// head survives into the generated virtual:aihu-routes module (SK passthrough)
// ---------------------------------------------------------------------------

function generateRoutesModule(pages: Record<string, string>): string {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-routes-head-'))
  const pagesDir = join(tmp, 'pages')
  mkdirSync(pagesDir)
  try {
    for (const [name, contents] of Object.entries(pages)) {
      writeFileSync(join(pagesDir, name), contents)
    }
    const plugin = viteRouterPlugin({ pagesDir: 'pages' })
    const mockServer = {
      config: { root: tmp },
      watcher: { add: () => {}, on: () => {} },
      moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
    }
    plugin.configureServer?.(mockServer as Parameters<typeof plugin.configureServer>[0])
    const content = plugin.load?.('\0virtual:aihu-routes')
    if (typeof content !== 'string') throw new Error('expected generated module string')
    return content
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

describe('virtual:aihu-routes — head passthrough (SK allowlist)', () => {
  it('emits the head object (including nested og/twitter/jsonld) for a route with head', () => {
    const sidecar = {
      name: 'about',
      ssr: true,
      head: {
        title: 'About Us',
        description: 'Who we are',
        canonical: '/about',
        og: { title: 'About', image: '/og.png', type: 'website', url: '/about' },
        twitter: { card: 'summary_large_image', title: 'About', site: '@acme' },
        jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
      },
    }
    const mod = generateRoutesModule({
      'about.aihu': '',
      'about.route.json': JSON.stringify(sidecar),
    })

    // The generated module must contain a `head:` key (the SK allowlist now
    // includes 'head' — without it the key is silently dropped).
    expect(mod).toContain('head:')
    expect(mod).toContain('"About Us"')
    expect(mod).toContain('"og"')
    expect(mod).toContain('"twitter"')
    expect(mod).toContain('summary_large_image')
    // jsonld raw object survives verbatim
    expect(mod).toContain('"@type":"Organization"')

    // Evaluate the generated module to prove a real RouteDefinition shape:
    // strip the `module: () => import(...)` thunk so we can JSON-parse safely.
    const routes = evalRoutes(mod)
    const about = routes.find((r) => r.pattern === '/about')
    expect(about).toBeDefined()
    expect(about?.head?.title).toBe('About Us')
    expect(about?.head?.og?.image).toBe('/og.png')
    expect(about?.head?.twitter?.card).toBe('summary_large_image')
    expect(about?.head?.jsonld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Acme',
    })
  })

  it('omits head for a route WITHOUT head (backward compatible)', () => {
    const sidecar = { name: 'plain', ssr: true }
    const mod = generateRoutesModule({
      'plain.aihu': '',
      'plain.route.json': JSON.stringify(sidecar),
    })
    const routes = evalRoutes(mod)
    const plain = routes.find((r) => r.pattern === '/plain')
    expect(plain).toBeDefined()
    expect(plain?.name).toBe('plain')
    expect(plain?.head).toBeUndefined()
  })
})

/**
 * Evaluate a generated `virtual:aihu-routes` module string into plain objects.
 * The `module: () => import(...)` thunk is replaced with `undefined` so the
 * module body can be eval'd without a real import resolver.
 */
function evalRoutes(mod: string): Array<RouteDefinition & { head?: RouteHead }> {
  const body = mod
    .replace(/^\/\/ AUTO-GENERATED\n/, '')
    .replace(/export default /, 'return ')
    .replace(/module: \(\) => import\([^)]*\),/g, 'module: undefined,')
  // eslint-disable-next-line no-new-func
  const fn = new Function(body) as () => Array<RouteDefinition & { head?: RouteHead }>
  return fn()
}
