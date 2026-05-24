import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.ts'

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
