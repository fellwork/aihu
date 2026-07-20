import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AI_BOT_LIST,
  AI_TRAINING_CRAWLER_BOTS,
  AI_USER_FETCHER_BOTS,
  generateJsonLd,
} from '@aihu-plugin/agent-readiness'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SeoConfig, SeoRoutes } from '../src/index.js'
import { createSeoRoutes, seo, seoLlmsSections } from '../src/index.js'

const BASE_CONFIG: SeoConfig = {
  siteName: 'My App',
  baseUrl: 'https://x.test',
}

const CONFIG_WITH_SOURCES: SeoConfig = {
  ...BASE_CONFIG,
  sitemapSources: [{ path: '/about' }, { path: '/docs' }],
}

// ---------------------------------------------------------------------------
// SAMPLE-S02 — Public exports
// ---------------------------------------------------------------------------
describe('SAMPLE-S02 — public exports', () => {
  it('exports seo, createSeoRoutes, seoLlmsSections', () => {
    expect(typeof seo).toBe('function')
    expect(typeof createSeoRoutes).toBe('function')
    expect(typeof seoLlmsSections).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S03 — Plugin factory shape
// ---------------------------------------------------------------------------
describe('SAMPLE-S03 — plugin factory shape', () => {
  it('returns a Plugin with name @aihu/seo and hooks', () => {
    const plugin = seo(BASE_CONFIG)
    expect(plugin.name).toBe('@aihu/seo')
    expect(plugin).toHaveProperty('hooks')
    // brand check
    expect((plugin as { __aihu_plugin: boolean }).__aihu_plugin).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S04 — createSeoRoutes returns RouteHandler record
// ---------------------------------------------------------------------------
describe('SAMPLE-S04 — createSeoRoutes returns RouteHandler record', () => {
  it('returns sitemapXml, robotsTxt, llmsTxt handlers', async () => {
    const routes: SeoRoutes = createSeoRoutes(BASE_CONFIG)
    expect(routes).toHaveProperty('sitemapXml')
    expect(routes).toHaveProperty('robotsTxt')
    expect(routes).toHaveProperty('llmsTxt')

    const mockReq = new Request('https://x.test/sitemap.xml')
    const mockCtx = { params: {}, url: new URL('https://x.test/sitemap.xml') }

    const sitemapRes = await routes.sitemapXml(mockReq, mockCtx)
    expect(sitemapRes).toBeInstanceOf(Response)

    const robotsRes = await routes.robotsTxt(mockReq, mockCtx)
    expect(robotsRes).toBeInstanceOf(Response)

    const llmsRes = await routes.llmsTxt(mockReq, mockCtx)
    expect(llmsRes).toBeInstanceOf(Response)
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S05 — Sitemap XML well-formed
// ---------------------------------------------------------------------------
describe('SAMPLE-S05 — sitemap XML well-formed', () => {
  it('returns application/xml response with proper XML body', async () => {
    const routes = createSeoRoutes(CONFIG_WITH_SOURCES)
    const req = new Request('https://x.test/sitemap.xml')
    const ctx = { params: {}, url: new URL('https://x.test/sitemap.xml') }

    const res = await routes.sitemapXml(req, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/xml')

    const body = await res.text()
    expect(body).toMatch(/^<\?xml/)
    expect(body).toContain('<url>')
    expect(body).toContain('/about')
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S06 — robots.txt includes AI bot directives
// ---------------------------------------------------------------------------
describe('SAMPLE-S06 — robots.txt includes AI bot directives', () => {
  it('includes GPTBot and Disallow directive by default', async () => {
    const routes = createSeoRoutes(BASE_CONFIG)
    const req = new Request('https://x.test/robots.txt')
    const ctx = { params: {}, url: new URL('https://x.test/robots.txt') }

    const res = await routes.robotsTxt(req, ctx)
    const body = await res.text()

    expect(body).toContain('User-agent: GPTBot')
    expect(body).toContain('Disallow:')
  })
})

// ---------------------------------------------------------------------------
// #430 — the shim preserves the legacy robots default and maps explicitly
// ---------------------------------------------------------------------------
describe('#430 — shim robots mapping (deprecated @aihu/seo entry)', () => {
  const req = new Request('https://x.test/robots.txt')
  const ctx = { params: {}, url: new URL('https://x.test/robots.txt') }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('absent disallowAiBots → deny-all (legacy default) + deprecation warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = createSeoRoutes(BASE_CONFIG)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('[@aihu/seo] deprecated')
    expect(warn.mock.calls[0]![0]).toContain("'allow-agents'")

    const body = await (await routes.robotsTxt(req, ctx)).text()
    for (const bot of AI_BOT_LIST) {
      expect(body).toContain(`User-agent: ${bot}\nDisallow: /`)
    }
    expect(body).toContain('User-agent: *\nAllow: /')
    expect(body).not.toContain('User-agent: *\nDisallow: /')
  })

  it('explicit disallowAiBots: true → deny-all, no vocabulary warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = createSeoRoutes({ ...BASE_CONFIG, robotsOptions: { disallowAiBots: true } })
    expect(warn).not.toHaveBeenCalled()

    const body = await (await routes.robotsTxt(req, ctx)).text()
    for (const bot of AI_BOT_LIST) {
      expect(body).toContain(`User-agent: ${bot}\nDisallow: /`)
    }
    expect(body).toContain('User-agent: *\nAllow: /')
  })

  it('explicit disallowAiBots: false → allow-all, no vocabulary warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = createSeoRoutes({ ...BASE_CONFIG, robotsOptions: { disallowAiBots: false } })
    expect(warn).not.toHaveBeenCalled()

    const body = await (await routes.robotsTxt(req, ctx)).text()
    for (const bot of AI_BOT_LIST) {
      expect(body).toContain(`User-agent: ${bot}\nAllow: /`)
    }
    expect(body).not.toContain('Disallow:')
  })

  it('the NEW tiered default never leaks through the shim (fetchers are still denied)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = createSeoRoutes(BASE_CONFIG)
    const body = await (await routes.robotsTxt(req, ctx)).text()
    // Under 'allow-agents' these would be allowed; the shim must deny them.
    for (const bot of AI_USER_FETCHER_BOTS) {
      expect(body).toContain(`User-agent: ${bot}\nDisallow: /`)
    }
    for (const bot of AI_TRAINING_CRAWLER_BOTS) {
      expect(body).toContain(`User-agent: ${bot}\nDisallow: /`)
    }
  })

  it('additionalRules are emitted before the AI-bot blocks (legacy order)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = createSeoRoutes({
      ...BASE_CONFIG,
      robotsOptions: {
        disallowAiBots: true,
        additionalRules: [{ userAgent: 'Googlebot', disallow: ['/admin'] }],
      },
    })
    const body = await (await routes.robotsTxt(req, ctx)).text()
    expect(body.indexOf('User-agent: Googlebot')).toBeGreaterThanOrEqual(0)
    expect(body.indexOf('User-agent: Googlebot')).toBeLessThan(body.indexOf('User-agent: GPTBot'))
    expect(body).toContain('Disallow: /admin')
  })
})

// ---------------------------------------------------------------------------
// #430 — the shim sitemap now XML-escapes (regression: & in a path)
// ---------------------------------------------------------------------------
describe('#430 — shim sitemap XML-escapes', () => {
  it('escapes & in a source path to &amp;', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = createSeoRoutes({
      ...BASE_CONFIG,
      sitemapSources: [{ path: '/search?a=1&b=2' }],
    })
    const req = new Request('https://x.test/sitemap.xml')
    const ctx = { params: {}, url: new URL('https://x.test/sitemap.xml') }
    const body = await (await routes.sitemapXml(req, ctx)).text()
    expect(body).toContain('<loc>https://x.test/search?a=1&amp;b=2</loc>')
    expect(body).not.toContain('&b=2')
    vi.restoreAllMocks()
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S07 — JSON-LD injection (afterParse)
// ---------------------------------------------------------------------------
describe('SAMPLE-S07 — JSON-LD injection via afterParse', () => {
  it('afterParse exists and is a function', () => {
    const plugin = seo(BASE_CONFIG)
    expect(typeof plugin.hooks?.afterParse).toBe('function')
  })

  it('afterParse does not throw with mock context', async () => {
    const plugin = seo(BASE_CONFIG)
    const mockCtx = {
      config: {},
      mode: 'build' as const,
      outputDir: '/tmp/out',
      projectRoot: '/tmp',
      sfcPath: '/tmp/foo.aihu',
      componentName: 'Foo',
      symbolTable: {},
    }
    const mockAst = { type: 'root', children: [] }

    // Should not throw
    const result = await plugin.hooks!.afterParse!(mockCtx, mockAst)

    // The AST is returned (possibly mutated with __seoJsonLd)
    expect(result).toBeDefined()
  })

  it('generateJsonLd produces object with @context and @type', () => {
    const jsonLdStr = generateJsonLd({ url: 'https://x.test' })
    const parsed = JSON.parse(jsonLdStr) as Record<string, unknown>
    expect(parsed).toHaveProperty('@context')
    expect(parsed).toHaveProperty('@type')
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed['@type']).toBe('WebPage')
  })

  it('generateJsonLd merges page overrides over defaults', () => {
    const jsonLdStr = generateJsonLd({ '@type': 'Article', name: 'Test' })
    const parsed = JSON.parse(jsonLdStr) as Record<string, unknown>
    expect(parsed['@type']).toBe('Article')
    expect(parsed.name).toBe('Test')
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S08 — seoLlmsSections returns composable shape
// ---------------------------------------------------------------------------
describe('SAMPLE-S08 — seoLlmsSections returns composable shape', () => {
  it('returns an array with at least one entry having a title field', () => {
    const sections = seoLlmsSections({
      siteName: 'My App',
      baseUrl: 'https://x.test',
      sitemapSources: [{ path: '/docs' }],
    })
    expect(Array.isArray(sections)).toBe(true)
    expect(sections.length).toBeGreaterThanOrEqual(1)
    const firstSection = sections[0]!
    expect(firstSection).toHaveProperty('title')
    expect(typeof firstSection.title).toBe('string')
    expect(firstSection).toHaveProperty('links')
    expect(Array.isArray(firstSection.links)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S09 — Composition pattern works
// ---------------------------------------------------------------------------
describe('SAMPLE-S09 — composition pattern', () => {
  it('seoLlmsSections can be spread into a user sections array', () => {
    const userSections = [{ title: 'Getting Started', links: [] }]
    const seoSections = seoLlmsSections({
      siteName: 'My App',
      baseUrl: 'https://x.test',
      sitemapSources: [{ path: '/about' }],
    })
    const merged = [...userSections, ...seoSections]
    expect(merged.length).toBe(userSections.length + seoSections.length)
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S10 — Dep-free thesis (no third-party SDKs)
// ---------------------------------------------------------------------------
describe('SAMPLE-S10 — dep-free thesis', () => {
  it('package.json dependencies are only @aihu/* or @aihu-plugin/* scopes', () => {
    const pkgPath = resolve(import.meta.dirname, '../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>
    }
    const deps = Object.keys(pkg.dependencies ?? {})
    for (const dep of deps) {
      const isAihuScoped = dep.startsWith('@aihu/') || dep.startsWith('@aihu-plugin/')
      expect(isAihuScoped, `Unexpected external dep: ${dep}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S11 — install-manifest validates
// ---------------------------------------------------------------------------
describe('SAMPLE-S11 — install-manifest validates', () => {
  it('install-manifest.json has required fields', () => {
    const manifestPath = resolve(import.meta.dirname, '../install-manifest.json')

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      pluginName: string
      pluginVersion: string
      aihuVersion: string
      installSteps: unknown[]
    }

    expect(manifest.pluginName).toBe('@aihu/seo')
    expect(manifest.aihuVersion).toBeTruthy()
    expect(Array.isArray(manifest.installSteps)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SAMPLE-S13 — NO size-limit row
// ---------------------------------------------------------------------------
describe('SAMPLE-S13 — no size-limit row', () => {
  it('.size-limit.json does NOT contain @aihu/seo entry', () => {
    const sizeLimitPath = resolve(import.meta.dirname, '../../../.size-limit.json')
    const entries = JSON.parse(readFileSync(sizeLimitPath, 'utf-8')) as Array<{
      name?: string
      path?: string
    }>
    const hasSeoRow = entries.some(
      (e) => e.name?.includes('@aihu/seo') || e.path?.includes('packages/seo'),
    )
    expect(hasSeoRow).toBe(false)
  })
})
