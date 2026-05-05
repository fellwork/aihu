/**
 * v0.6b tests for @aihu/router:
 *   - v0.6.3: RouteDefinition sidecar fields + readRouteSidecar()
 *   - v0.6.8: scanLayouts(), virtual:aihu-layouts plugin hooks
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BuildConfig, BuildTarget } from '../../server/src/index.ts'
import type { RouteDefinition } from '../src/index.ts'
import { readRouteSidecar, scanLayouts, viteRouterPlugin } from '../src/vite-plugin.ts'

// ---------------------------------------------------------------------------
// v0.6.3 — RouteDefinition sidecar fields (type-level tests)
// ---------------------------------------------------------------------------

describe('RouteDefinition — v0.6.3 sidecar fields', () => {
  it('accepts optional name field', () => {
    const route: RouteDefinition = {
      pattern: '/about',
      segments: [{ kind: 'static', path: 'about' }],
      module: () => Promise.resolve({ default: {} }),
      name: 'about-page',
    }
    expect(route.name).toBe('about-page')
  })

  it('accepts optional middleware array', () => {
    const route: RouteDefinition = {
      pattern: '/dashboard',
      segments: [{ kind: 'static', path: 'dashboard' }],
      module: () => Promise.resolve({ default: {} }),
      middleware: ['auth', 'log'],
    }
    expect(route.middleware).toEqual(['auth', 'log'])
  })

  it('accepts optional ssr boolean', () => {
    const route: RouteDefinition = {
      pattern: '/home',
      segments: [{ kind: 'static', path: 'home' }],
      module: () => Promise.resolve({ default: {} }),
      ssr: true,
    }
    expect(route.ssr).toBe(true)
  })

  it('accepts optional layout string', () => {
    const route: RouteDefinition = {
      pattern: '/admin',
      segments: [{ kind: 'static', path: 'admin' }],
      module: () => Promise.resolve({ default: {} }),
      layout: 'admin',
    }
    expect(route.layout).toBe('admin')
  })

  it('all sidecar fields are optional — plain route still valid', () => {
    const route: RouteDefinition = {
      pattern: '/',
      segments: [],
      module: () => Promise.resolve({ default: {} }),
    }
    expect(route.name).toBeUndefined()
    expect(route.middleware).toBeUndefined()
    expect(route.ssr).toBeUndefined()
    expect(route.layout).toBeUndefined()
  })

  it('accepts all sidecar fields together', () => {
    const route: RouteDefinition = {
      pattern: '/blog/:slug',
      segments: [
        { kind: 'static', path: 'blog' },
        { kind: 'param', name: 'slug' },
      ],
      module: () => Promise.resolve({ default: {} }),
      name: 'blog-post',
      middleware: ['auth'],
      ssr: false,
      layout: 'blog',
    }
    expect(route.name).toBe('blog-post')
    expect(route.middleware).toEqual(['auth'])
    expect(route.ssr).toBe(false)
    expect(route.layout).toBe('blog')
  })
})

// ---------------------------------------------------------------------------
// v0.6.3 — readRouteSidecar() with real temp files
// ---------------------------------------------------------------------------

describe('readRouteSidecar()', () => {
  it('returns null when no sidecar file exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-test-'))
    try {
      writeFileSync(join(tmp, 'index.ts'), '')
      const result = readRouteSidecar(join(tmp, 'index.ts'))
      expect(result).toBeNull()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('reads and parses sidecar JSON when it exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-test-'))
    try {
      const sidecar = { name: 'home', middleware: ['auth'], ssr: true, layout: 'default' }
      writeFileSync(join(tmp, 'index.ts'), '')
      writeFileSync(join(tmp, 'index.route.json'), JSON.stringify(sidecar))
      const result = readRouteSidecar(join(tmp, 'index.ts'))
      expect(result).toEqual(sidecar)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('returns null on malformed JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-test-'))
    try {
      writeFileSync(join(tmp, 'broken.ts'), '')
      writeFileSync(join(tmp, 'broken.route.json'), 'NOT_VALID_JSON{{{')
      const result = readRouteSidecar(join(tmp, 'broken.ts'))
      expect(result).toBeNull()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('handles .aihu extension correctly', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-test-'))
    try {
      const sidecar = { name: 'my-page', ssr: false }
      writeFileSync(join(tmp, 'page.aihu'), '')
      writeFileSync(join(tmp, 'page.route.json'), JSON.stringify(sidecar))
      const result = readRouteSidecar(join(tmp, 'page.aihu'))
      expect(result).toEqual(sidecar)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// v0.6.8 — scanLayouts() with real temp files
// ---------------------------------------------------------------------------

describe('scanLayouts()', () => {
  it('returns empty map when layouts dir does not exist', () => {
    const result = scanLayouts('/nonexistent/layouts-xyz-nope')
    expect(result).toEqual({})
  })

  it('maps .aihu files to layout names', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-layouts-'))
    try {
      writeFileSync(join(tmp, 'default.aihu'), '<layout></layout>')
      writeFileSync(join(tmp, 'admin.aihu'), '<layout></layout>')
      writeFileSync(join(tmp, 'blog.aihu'), '<layout></layout>')
      const result = scanLayouts(tmp)
      expect(Object.keys(result).sort()).toEqual(['admin', 'blog', 'default'])
      expect(result.default).toContain('default.aihu')
      expect(result.admin).toContain('admin.aihu')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('ignores non-.aihu files in layouts dir', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-layouts-'))
    try {
      writeFileSync(join(tmp, 'default.aihu'), '')
      writeFileSync(join(tmp, 'README.md'), '')
      writeFileSync(join(tmp, '_partial.ts'), '')
      const result = scanLayouts(tmp)
      expect(Object.keys(result)).toEqual(['default'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// v0.6.8 — viteRouterPlugin resolveId/load for virtual:aihu-layouts
// ---------------------------------------------------------------------------

describe('viteRouterPlugin — virtual:aihu-layouts hooks', () => {
  it('resolves virtual:aihu-layouts to internal ID', () => {
    const plugin = viteRouterPlugin()
    const resolved = plugin.resolveId?.('virtual:aihu-layouts')
    expect(resolved).toBe('\0virtual:aihu-layouts')
  })

  it('does not resolve unknown virtual IDs', () => {
    const plugin = viteRouterPlugin()
    const resolved = plugin.resolveId?.('virtual:something-else')
    expect(resolved == null).toBe(true)
  })

  it('load returns string content for virtual:aihu-layouts', () => {
    const plugin = viteRouterPlugin()
    const content = plugin.load?.('\0virtual:aihu-layouts')
    expect(typeof content).toBe('string')
    expect(content).toContain('export default')
  })

  it('load returns null for non-virtual IDs', () => {
    const plugin = viteRouterPlugin()
    const result = plugin.load?.('./some-file.ts')
    expect(result == null).toBe(true)
  })

  it('generated layouts module contains scanned layouts', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-layouts-plugin-'))
    const layoutsTmp = join(tmp, 'layouts')
    mkdirSync(layoutsTmp)
    try {
      writeFileSync(join(layoutsTmp, 'default.aihu'), '')
      writeFileSync(join(layoutsTmp, 'admin.aihu'), '')
      // Use the layoutsDir option pointing to our temp dir
      // We set cwd to tmp so relative path 'layouts' resolves correctly
      const plugin = viteRouterPlugin({ layoutsDir: 'layouts' })
      // Simulate configureServer providing the root
      const mockServer = {
        config: { root: tmp },
        watcher: { add: () => {}, on: () => {} },
        moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
      }
      plugin.configureServer?.(mockServer as Parameters<typeof plugin.configureServer>[0])
      const content = plugin.load?.('\0virtual:aihu-layouts')
      expect(typeof content).toBe('string')
      expect(content).toContain('"default"')
      expect(content).toContain('"admin"')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Type-only: BuildTarget / BuildConfig — ensure the types are importable
// ---------------------------------------------------------------------------

describe('BuildTarget type — compile-time check', () => {
  it('BuildTarget values are strings', () => {
    const values: BuildTarget[] = ['client', 'server', 'universal']
    expect(values).toHaveLength(3)
  })

  it('BuildConfig.target is optional', () => {
    const cfg: BuildConfig = {}
    expect(cfg.target).toBeUndefined()
  })
})
