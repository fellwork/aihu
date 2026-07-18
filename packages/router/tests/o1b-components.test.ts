/**
 * O1b tests for @aihu/router — the compile-time tag → module registry:
 *   - componentTagFor(): local copy of the compiler's kebabComponentTag
 *   - readAihuComponentTag(): @meta name → @route name → file-stem resolution
 *   - scanComponents() / genC(): recursive scan + virtual:aihu-components codegen
 *   - RouteSidecar `components` plumbing through genR (SK whitelist)
 *   - viteRouterPlugin resolveId/load hooks for virtual:aihu-components
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RouteDefinition } from '../src/index.ts'
import {
  componentTagFor,
  genC,
  genL,
  readAihuComponentTag,
  readAihuLayoutComponents,
  scanComponents,
  viteRouterPlugin,
} from '../src/vite-plugin.ts'

// ---------------------------------------------------------------------------
// componentTagFor() — must match the compiler's kebabComponentTag contract
// ---------------------------------------------------------------------------

describe('componentTagFor()', () => {
  it('kebabs multi-word PascalCase', () => {
    expect(componentTagFor('UserCard')).toBe('user-card')
  })

  it('splits acronym boundaries (prev upper AND next lower)', () => {
    expect(componentTagFor('APIClient')).toBe('api-client')
  })

  it('passes hyphenated names through lowercased', () => {
    expect(componentTagFor('my-widget')).toBe('my-widget')
  })

  it('lowercases single-word PascalCase without inserting a hyphen', () => {
    expect(componentTagFor('Card')).toBe('card')
  })
})

// ---------------------------------------------------------------------------
// readAihuComponentTag() — @meta name → @route name → file-stem precedence
// ---------------------------------------------------------------------------

describe('readAihuComponentTag()', () => {
  it('falls back to the (normalized) file stem when no @meta/@route name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-comp-tag-'))
    try {
      const f = join(tmp, 'UserCard.aihu')
      writeFileSync(f, '@template { <div>card</div> }\n')
      expect(readAihuComponentTag(f)).toBe('user-card')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('prefers @meta { name } over the file stem', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-comp-tag-'))
    try {
      const f = join(tmp, 'Whatever.aihu')
      writeFileSync(f, '@meta {\n  name: "x-thing"\n}\n@template { <div/> }\n')
      expect(readAihuComponentTag(f)).toBe('x-thing')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('prefers @route { name } over the file stem when no @meta', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-comp-tag-'))
    try {
      const f = join(tmp, 'Whatever.aihu')
      writeFileSync(f, '@route {\n  name: "RouteNamed"\n}\n@template { <div/> }\n')
      expect(readAihuComponentTag(f)).toBe('route-named')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// scanComponents() / genC() — recursive scan + registry codegen
// ---------------------------------------------------------------------------

function writeFixture(tmp: string): void {
  writeFileSync(join(tmp, 'UserCard.aihu'), '@template { <div>card</div> }\n')
  mkdirSync(join(tmp, 'widgets'))
  writeFileSync(join(tmp, 'widgets', 'my-widget.aihu'), '@template { <div>w</div> }\n')
  // Explicit @meta name that differs from the file stem.
  writeFileSync(
    join(tmp, 'SomethingElse.aihu'),
    '@meta {\n  name: "x-thing"\n}\n@template { <div>x</div> }\n',
  )
}

describe('scanComponents()', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty map when components dir does not exist', () => {
    expect(scanComponents('/nonexistent/components-xyz-nope')).toEqual({})
  })

  it('maps normalized tags to absolute POSIX paths, recursing into subdirs', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-components-'))
    try {
      writeFixture(tmp)
      const result = scanComponents(tmp)
      expect(Object.keys(result).sort()).toEqual(['my-widget', 'user-card', 'x-thing'])
      expect(result['user-card']).toContain('UserCard.aihu')
      expect(result['my-widget']).toContain('widgets/my-widget.aihu')
      expect(result['x-thing']).toContain('SomethingElse.aihu')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('warns on a tag collision (last file wins)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-components-collide-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      writeFileSync(join(tmp, 'UserCard.aihu'), '@template { <div/> }\n')
      mkdirSync(join(tmp, 'nested'))
      writeFileSync(join(tmp, 'nested', 'user-card.aihu'), '@template { <div/> }\n')
      const result = scanComponents(tmp)
      expect(Object.keys(result)).toEqual(['user-card'])
      expect(warn).toHaveBeenCalledTimes(1)
      const msg = String(warn.mock.calls[0]?.[0])
      expect(msg).toContain('"user-card"')
      expect(msg).toContain('UserCard.aihu')
      expect(msg).toContain('nested/user-card.aihu')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('genC()', () => {
  it('emits a sorted tag → () => import(path) registry', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-genc-'))
    try {
      writeFixture(tmp)
      const content = genC(tmp)
      expect(content).toContain('// AUTO-GENERATED')
      expect(content).toContain('export default')
      // Bare loader thunks keyed by normalized tag — no { tag, load } wrapper.
      expect(content).toMatch(/"my-widget": \(\) => import\(".*widgets\/my-widget\.aihu"\)/)
      expect(content).toMatch(/"user-card": \(\) => import\(".*UserCard\.aihu"\)/)
      expect(content).toMatch(/"x-thing": \(\) => import\(".*SomethingElse\.aihu"\)/)
      // Deterministic output: keys in sorted order.
      const iMy = content.indexOf('"my-widget"')
      const iUser = content.indexOf('"user-card"')
      const iX = content.indexOf('"x-thing"')
      expect(iMy).toBeGreaterThan(-1)
      expect(iMy).toBeLessThan(iUser)
      expect(iUser).toBeLessThan(iX)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// F2: readAihuLayoutComponents() / genL() — a layout's own referenced
// component tags, carried on each virtual:aihu-layouts entry
// ---------------------------------------------------------------------------

describe('readAihuLayoutComponents()', () => {
  it('extracts + normalizes component-shaped tags from the @template block', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-layout-comps-'))
    try {
      const f = join(tmp, 'app.aihu')
      writeFileSync(
        f,
        [
          '@template {',
          '  <div class="shell">',
          '    <some-widget size="lg" />',
          '    <OtherThing label="x">nested</OtherThing>',
          '    <header><$outlet /></header>',
          '  </div>',
          '}',
          '',
        ].join('\n'),
      )
      // Sorted, deduped, normalized (OtherThing → other-thing); plain HTML
      // tags (div, header) and the <$outlet> marker are never collected.
      expect(readAihuLayoutComponents(f)).toEqual(['other-thing', 'some-widget'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('survives nested braces inside the template (brace-balanced walk)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-layout-comps-nested-'))
    try {
      const f = join(tmp, 'app.aihu')
      writeFileSync(
        f,
        '@template {\n  @if { open } {\n    <nav-bar />\n  }\n  <p>{count}</p>\n  <UserCard />\n}\n',
      )
      expect(readAihuLayoutComponents(f)).toEqual(['nav-bar', 'user-card'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('returns [] for a layout referencing no components, and for missing @template/file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-layout-comps-empty-'))
    try {
      const plain = join(tmp, 'plain.aihu')
      writeFileSync(plain, '@template {\n  <div><header/><$outlet /></div>\n}\n')
      expect(readAihuLayoutComponents(plain)).toEqual([])
      const noTemplate = join(tmp, 'meta-only.aihu')
      writeFileSync(noTemplate, '@meta {\n  name: "whatever"\n}\n')
      expect(readAihuLayoutComponents(noTemplate)).toEqual([])
      expect(readAihuLayoutComponents(join(tmp, 'nope.aihu'))).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('genL() — layout entries carry `components`', () => {
  it('emits a components array per layout entry', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-genl-comps-'))
    try {
      writeFileSync(
        join(tmp, 'app.aihu'),
        '@template {\n  <some-widget />\n  <OtherThing />\n  <$outlet />\n}\n',
      )
      writeFileSync(join(tmp, 'bare.aihu'), '@template {\n  <div><$outlet /></div>\n}\n')
      const content = genL(tmp)
      expect(content).toContain('// AUTO-GENERATED')
      // Entry shape: { tag, load, components } — components normalized+sorted.
      expect(content).toMatch(
        /"app": \{ tag: "aihu-layout-app", load: \(\) => import\(".*app\.aihu"\), components: \["other-thing","some-widget"\] \}/,
      )
      // A layout referencing no components still carries an explicit [].
      expect(content).toMatch(
        /"bare": \{ tag: "aihu-layout-bare", load: \(\) => import\(".*bare\.aihu"\), components: \[\] \}/,
      )
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// RouteSidecar `components` plumbing — SK whitelist → genR route entries
// ---------------------------------------------------------------------------

describe('genR — route `components` from route metadata', () => {
  it('embeds components from a .route.json sidecar', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-routes-components-'))
    const pagesTmp = join(tmp, 'pages')
    mkdirSync(pagesTmp)
    try {
      writeFileSync(join(pagesTmp, 'index.aihu'), '@template { <div>home</div> }\n')
      writeFileSync(
        join(pagesTmp, 'index.route.json'),
        JSON.stringify({ name: 'home-page', components: ['hn-comment'] }),
      )
      const plugin = viteRouterPlugin({ pagesDir: 'pages' })
      const mockServer = {
        config: { root: tmp },
        watcher: { add: () => {}, on: () => {} },
        moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
      }
      plugin.configureServer?.(mockServer as Parameters<typeof plugin.configureServer>[0])
      const content = plugin.load?.('\0virtual:aihu-routes') as string
      expect(content).toContain('components: ["hn-comment"]')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('embeds components via a compileRouteMeta stub when no sidecar', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-routes-components-meta-'))
    const pagesTmp = join(tmp, 'pages')
    mkdirSync(pagesTmp)
    try {
      writeFileSync(join(pagesTmp, 'index.aihu'), '@template { <div>home</div> }\n')
      const compileRouteMeta = () => ({
        name: 'home-page',
        components: ['hn-comment', 'user-card'],
      })
      const plugin = viteRouterPlugin({ pagesDir: 'pages', compileRouteMeta })
      const mockServer = {
        config: { root: tmp },
        watcher: { add: () => {}, on: () => {} },
        moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
      }
      plugin.configureServer?.(mockServer as Parameters<typeof plugin.configureServer>[0])
      const content = plugin.load?.('\0virtual:aihu-routes') as string
      expect(content).toContain('components: ["hn-comment","user-card"]')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('RouteDefinition accepts an optional components field', () => {
    const route: RouteDefinition = {
      pattern: '/',
      segments: [],
      module: () => Promise.resolve({ default: {} }),
      components: ['hn-comment'],
    }
    expect(route.components).toEqual(['hn-comment'])
  })
})

// ---------------------------------------------------------------------------
// viteRouterPlugin resolveId/load hooks for virtual:aihu-components
// ---------------------------------------------------------------------------

describe('viteRouterPlugin — virtual:aihu-components hooks', () => {
  it('resolves virtual:aihu-components to internal ID', () => {
    const plugin = viteRouterPlugin()
    const resolved = plugin.resolveId?.('virtual:aihu-components')
    expect(resolved).toBe('\0virtual:aihu-components')
  })

  it('load returns the generated registry for virtual:aihu-components', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-components-plugin-'))
    const componentsTmp = join(tmp, 'components')
    mkdirSync(componentsTmp)
    try {
      writeFileSync(join(componentsTmp, 'UserCard.aihu'), '@template { <div/> }\n')
      const plugin = viteRouterPlugin({ componentsDir: 'components' })
      const mockServer = {
        config: { root: tmp },
        watcher: { add: () => {}, on: () => {} },
        moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
      }
      plugin.configureServer?.(mockServer as Parameters<typeof plugin.configureServer>[0])
      const content = plugin.load?.('\0virtual:aihu-components') as string
      expect(typeof content).toBe('string')
      expect(content).toContain('export default')
      expect(content).toContain('"user-card": () => import(')
      expect(content).toContain('UserCard.aihu')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
