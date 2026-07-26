import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DARK_SELECTOR, formatSelectorList } from '../src/define-style-pack.ts'
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

  it('declares dark overrides under the dual-keyed dark selector', () => {
    // Dual-keyed per Founder-decision #3 (data-theme on <html>) while every
    // shipped `.dark` consumer keeps working — see
    // docs/plans/2026-07-26-option-4-daisyui-design.md §4.
    expect(css).toContain(`${formatSelectorList(DARK_SELECTOR)} {`)
    expect(css).toContain('.dark,\n[data-theme="dark"] {')
    // The dark block re-declares the core color tokens.
    const darkBlock = css.slice(css.indexOf(`${formatSelectorList(DARK_SELECTOR)} {`))
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
    expect(aihuDefault.toCss()).toContain(`${formatSelectorList(DARK_SELECTOR)} {`)
  })

  // The generated bundles are ALSO biome-checked, and biome's CSS formatter
  // breaks a comma-separated selector list onto separate lines. If toCss() ever
  // emits a comma list on one line, the pre-commit hook reformats the generated
  // file and the byte-parity tests above start failing on the next commit rather
  // than in CI here. Pin the canonical form so that failure is loud and local.
  it('emits comma-separated selector lists in biome canonical form (one per line)', () => {
    for (const pack of [aihuDefault, aihuGraphite]) {
      const css = pack.toCss()
      for (const line of css.split('\n')) {
        if (!line.trimEnd().endsWith('{')) continue
        expect(line, `selector list must be one-per-line: ${line}`).not.toContain(',')
      }
    }
    expect(formatSelectorList('.a, .b, .c')).toBe('.a,\n.b,\n.c')
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

  // The named-theme dimension exists but neither shipped pack uses it yet — the
  // daisyUI catalog transcription is a later slice (design doc §6, Slice 2).
  // This pins the current state so the catalog landing is a visible diff.
  it('neither shipped pack declares named themes yet', () => {
    expect(aihuDefault.themeNames).toEqual([])
    expect(aihuGraphite.themeNames).toEqual([])
    // The only `[data-theme="…"]` in a shipped pack today is the dark dual-key;
    // a named theme would emit its own standalone `[data-theme="x"] {` block.
    for (const file of ['aihu-default.css', 'aihu-graphite.css']) {
      const pack = readPack(file)
      // Exactly one `[data-theme=…]` in the whole bundle, and it is the dark
      // dual-key. A named theme would necessarily add a second occurrence.
      expect(pack.match(/\[data-theme="[a-z0-9-]+"\]/g), file).toEqual(['[data-theme="dark"]'])
      expect(pack, file).toContain(`${formatSelectorList(DARK_SELECTOR)} {`)
    }
  })
})
