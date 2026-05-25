import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.ts'
import { aihuDefault, aihuGraphite, builtinPacks } from '../src/packs.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(__dirname, '../styles')

function readPack(name: string): string {
  return readFileSync(resolve(stylesDir, name), 'utf-8')
}

/** Pull every `--token-name` declared in a CSS bundle (left of the first `:`). */
function declaredTokens(css: string): Set<string> {
  const names = new Set<string>()
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
    names.add(m[1])
  }
  return names
}

// The brand token names the utility table (tokens.rs `is_brand_token`) resolves
// `bg-primary` / `text-accent` / … against. The style pack MUST define each so a
// compiled utility never dangles on an undefined var().
const EXPECTED_BRAND_TOKENS = [
  '--color-primary',
  '--color-primary-foreground',
  '--color-secondary',
  '--color-secondary-foreground',
  '--color-accent',
  '--color-accent-foreground',
  '--color-surface',
  '--color-surface-foreground',
  '--color-background',
  '--color-foreground',
  '--color-muted',
  '--color-muted-foreground',
  '--color-border',
  '--color-ring',
  '--color-destructive',
  '--color-destructive-foreground',
  '--radius-md',
]

describe('@aihu/css-engine — aihu-default style pack', () => {
  const css = readPack('aihu-default.css')

  it('declares the expected brand + radius token set', () => {
    const tokens = declaredTokens(css)
    for (const name of EXPECTED_BRAND_TOKENS) {
      expect(tokens.has(name), `aihu-default.css must declare ${name}`).toBe(true)
    }
  })

  it('declares dark overrides under .dark for the same color tokens', () => {
    expect(css).toContain('.dark {')
    // The dark block re-declares the core color tokens.
    const darkBlock = css.slice(css.indexOf('.dark {'))
    expect(darkBlock).toContain('--color-primary:')
    expect(darkBlock).toContain('--color-accent:')
  })

  it('a compiled utility references a token the pack defines (no dangling var)', () => {
    const out = compile(['bg-primary'])
    // The utility emits `var(--color-primary)`…
    expect(out).toContain('var(--color-primary)')
    // …and the pack defines `--color-primary`, so there is no dangling var.
    expect(declaredTokens(css).has('--color-primary')).toBe(true)
  })
})

describe('@aihu/css-engine — style packs are interchangeable', () => {
  const defaultCss = readPack('aihu-default.css')
  const graphiteCss = readPack('aihu-graphite.css')

  /** Map `--token: value` → value, scoped to the :root block of a pack. */
  function rootDeclarations(css: string): Map<string, string> {
    const rootStart = css.indexOf(':root {')
    const rootEnd = css.indexOf('}', rootStart)
    const block = css.slice(rootStart, rootEnd)
    const decls = new Map<string, string>()
    for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      decls.set(m[1], m[2].trim())
    }
    return decls
  }

  it('aihu-graphite declares the SAME token names as aihu-default', () => {
    const defaultNames = declaredTokens(defaultCss)
    const graphiteNames = declaredTokens(graphiteCss)
    expect([...graphiteNames].sort()).toEqual([...defaultNames].sort())
  })

  it('graphite uses DISTINCT (monochrome) values for the color tokens', () => {
    const def = rootDeclarations(defaultCss)
    const gra = rootDeclarations(graphiteCss)
    // At least the core color tokens must differ — proving distinct packs.
    for (const name of ['--color-primary', '--color-accent', '--color-surface']) {
      expect(gra.get(name)).toBeDefined()
      expect(def.get(name)).toBeDefined()
      expect(gra.get(name), `${name} must differ between packs`).not.toBe(def.get(name))
    }
    // Graphite color tokens are monochrome oklch (chroma 0).
    expect(gra.get('--color-primary')).toContain('oklch')
  })
})

// The shipped `styles/*.css` bundles are GENERATED from the `src/packs.ts`
// StylePack objects (the source of truth) via `bun run gen:style-packs`. This
// proves the two consumer access paths — the `./packs` JS object and the
// `./styles/*.css` import — can never drift: the file is exactly `toCss()`.
describe('@aihu/css-engine — built-in packs ↔ shipped CSS parity', () => {
  it('aihuDefault.toCss() byte-equals styles/aihu-default.css', () => {
    expect(aihuDefault.toCss()).toBe(readPack('aihu-default.css'))
  })

  it('aihuGraphite.toCss() byte-equals styles/aihu-graphite.css', () => {
    expect(aihuGraphite.toCss()).toBe(readPack('aihu-graphite.css'))
  })

  it('built-in packs are the same defineStylePack() shape external orgs use', () => {
    // `aihuDefault` / `aihuGraphite` are produced by `defineStylePack()`, so the
    // built-ins carry no privileged shape: tokens map, dark map, toCss().
    expect(aihuDefault.name).toBe('aihu-default')
    expect(aihuGraphite.name).toBe('aihu-graphite')
    expect(aihuDefault.tokens['color-accent']).toBe('#c8543a')
    expect(aihuGraphite.tokens['color-accent']).toBe('oklch(0.35 0 0)')
    expect(aihuDefault.toCss()).toContain(':root {')
    expect(aihuDefault.toCss()).toContain('.dark {')
  })

  it('exposes both packs via the builtinPacks registry, keyed by name', () => {
    expect(Object.keys(builtinPacks).sort()).toEqual(['aihu-default', 'aihu-graphite'])
    expect(builtinPacks['aihu-default']).toBe(aihuDefault)
    expect(builtinPacks['aihu-graphite']).toBe(aihuGraphite)
  })

  it('both packs declare the SAME token names (interchangeable)', () => {
    expect(Object.keys(aihuGraphite.tokens).sort()).toEqual(Object.keys(aihuDefault.tokens).sort())
    expect(Object.keys(aihuGraphite.dark).sort()).toEqual(Object.keys(aihuDefault.dark).sort())
  })
})
