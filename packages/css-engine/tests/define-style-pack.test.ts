import { describe, expect, it } from 'vitest'
import { defineStylePack } from '../src/define-style-pack.ts'

describe('@aihu/css-engine — defineStylePack()', () => {
  it('produces a descriptor with the expected shape', () => {
    const acme = defineStylePack({
      name: 'acme',
      tokens: { 'color-primary': '#0a7', 'radius-md': '6px' },
      dark: { 'color-primary': '#3fc' },
    })

    expect(acme.name).toBe('acme')
    expect(acme.tokens['color-primary']).toBe('#0a7')
    expect(acme.dark['color-primary']).toBe('#3fc')
    expect(typeof acme.toCss).toBe('function')
  })

  it('serializes to a :root (+ .dark) CSS block matching the shipped pack shape', () => {
    const acme = defineStylePack({
      name: 'acme',
      tokens: { 'color-primary': '#0a7' },
      dark: { 'color-primary': '#3fc' },
    })
    const css = acme.toCss()
    expect(css).toContain(':root {')
    expect(css).toContain('--color-primary: #0a7;')
    expect(css).toContain('.dark {')
    expect(css).toContain('--color-primary: #3fc;')
  })

  it('normalizes names whether or not they carry the leading --', () => {
    const pack = defineStylePack({
      name: 'p',
      tokens: { '--color-accent': 'red', 'radius-md': '8px' },
    })
    const css = pack.toCss()
    expect(css).toContain('--color-accent: red;')
    expect(css).toContain('--radius-md: 8px;')
    // No double-dashing.
    expect(css).not.toContain('----')
  })

  it('the built-in packs are expressible through the same API', () => {
    // aihu-default's brand token contract, expressed programmatically.
    const aihuDefault = defineStylePack({
      name: 'aihu-default',
      tokens: {
        'color-primary': '#1a1d24',
        'color-accent': '#c8543a',
        'color-surface': '#faf8f4',
        'radius-md': '8px',
      },
      dark: {
        'color-primary': '#ede8e0',
        'color-accent': '#e8705a',
      },
    })
    expect(aihuDefault.name).toBe('aihu-default')
    expect(aihuDefault.toCss()).toContain('--color-accent: #c8543a;')
    expect(aihuDefault.toCss()).toContain('.dark {')
  })

  it('rejects an empty name or empty token map', () => {
    expect(() => defineStylePack({ name: '', tokens: { a: '1' } })).toThrow()
    expect(() => defineStylePack({ name: 'x', tokens: {} })).toThrow()
  })
})
