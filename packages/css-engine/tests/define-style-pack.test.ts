import { describe, expect, it } from 'vitest'
import { DARK_SELECTOR, defineStylePack, formatSelectorList } from '../src/define-style-pack.ts'

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

  it('serializes to a :root (+ dark) CSS block matching the shipped pack shape', () => {
    const acme = defineStylePack({
      name: 'acme',
      tokens: { 'color-primary': '#0a7' },
      dark: { 'color-primary': '#3fc' },
    })
    const css = acme.toCss()
    expect(css).toContain(':root {')
    expect(css).toContain('--color-primary: #0a7;')
    expect(css).toContain(`${formatSelectorList(DARK_SELECTOR)} {`)
    expect(css).toContain('--color-primary: #3fc;')
  })

  // Founder-decision #3 (2026-07-23) ratifies `data-theme` on `<html>` as the
  // theme convention; every shipped consumer today keys dark off `.dark`. The
  // dark block is dual-keyed so both resolve, and neither convention has to
  // move on a flag day. See docs/plans/2026-07-26-option-4-daisyui-design.md §4.
  it('dual-keys the dark block on BOTH .dark and [data-theme="dark"]', () => {
    const css = defineStylePack({
      name: 'acme',
      tokens: { 'color-primary': '#0a7' },
      dark: { 'color-primary': '#3fc' },
    }).toCss()

    expect(DARK_SELECTOR).toBe('.dark, [data-theme="dark"]')
    expect(css).toContain('.dark,\n[data-theme="dark"] {')
    // Exactly one dark block — not two duplicated ones.
    expect(css.match(/--color-primary: #3fc;/g)).toHaveLength(1)
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
    expect(aihuDefault.toCss()).toContain(`${formatSelectorList(DARK_SELECTOR)} {`)
  })

  it('rejects an empty name or empty token map', () => {
    expect(() => defineStylePack({ name: '', tokens: { a: '1' } })).toThrow()
    expect(() => defineStylePack({ name: 'x', tokens: {} })).toThrow()
  })
})

// The named-theme dimension: the axis a swappable theme catalog (daisyUI's
// light/cupcake/dracula/… set) transcribes into. Before this, `StylePackInput`
// admitted exactly two themes — `tokens` (:root) and `dark` (.dark) — with no
// way to express a third named theme at all.
describe('@aihu/css-engine — defineStylePack() named themes', () => {
  const pack = defineStylePack({
    name: 'catalog',
    tokens: { 'color-primary': '#0a7', 'color-background': '#fff' },
    dark: { 'color-primary': '#3fc' },
    themes: {
      cupcake: { 'color-primary': '#65c3c8', 'color-background': '#faf7f5' },
      dracula: { 'color-primary': '#ff79c6' },
    },
  })

  it('exposes the named themes on the descriptor, in declaration order', () => {
    expect(pack.themeNames).toEqual(['cupcake', 'dracula'])
    expect(pack.themes.cupcake['color-primary']).toBe('#65c3c8')
    expect(pack.themes.dracula['color-primary']).toBe('#ff79c6')
  })

  it('emits one [data-theme="<name>"] block per named theme', () => {
    const css = pack.toCss()
    expect(css).toContain('[data-theme="cupcake"] {')
    expect(css).toContain('  --color-primary: #65c3c8;')
    expect(css).toContain('  --color-background: #faf7f5;')
    expect(css).toContain('[data-theme="dracula"] {')
    expect(css).toContain('  --color-primary: #ff79c6;')
  })

  // Cascade order is load-bearing: `:root`, `.dark`, and `[data-theme="…"]` all
  // weigh (0,1,0), so the LAST matching block wins. Named themes must come after
  // the dark block, or `<html class="dark" data-theme="cupcake">` would render
  // dark rather than cupcake.
  it('emits :root, then dark, then named themes — in that order', () => {
    const css = pack.toCss()
    const at = (needle: string) => {
      const i = css.indexOf(needle)
      expect(i, `expected to find ${needle}`).toBeGreaterThanOrEqual(0)
      return i
    }
    expect(at(':root {')).toBeLessThan(at(`${formatSelectorList(DARK_SELECTOR)} {`))
    expect(at(`${formatSelectorList(DARK_SELECTOR)} {`)).toBeLessThan(at('[data-theme="cupcake"]'))
    expect(at('[data-theme="cupcake"]')).toBeLessThan(at('[data-theme="dracula"]'))
  })

  it('a named theme is an override layer, not a full theme — base tokens still apply', () => {
    // `dracula` overrides only `color-primary`; `color-background` is inherited
    // from the `:root` block, exactly as `dark` behaves today.
    expect(pack.themes.dracula['color-background']).toBeUndefined()
    expect(pack.tokens['color-background']).toBe('#fff')
  })

  it('defaults to no named themes, and changes nothing for packs that declare none', () => {
    const plain = defineStylePack({ name: 'plain', tokens: { 'color-primary': '#0a7' } })
    expect(plain.themeNames).toEqual([])
    expect(plain.themes).toEqual({})
    expect(plain.toCss()).not.toContain('[data-theme=')
  })

  it('rejects `dark` as a named theme — it has its own dual-keyed selector', () => {
    expect(() =>
      defineStylePack({
        name: 'x',
        tokens: { a: '1' },
        themes: { dark: { a: '2' } },
      }),
    ).toThrow(/reserved/)
  })

  it('rejects theme names that are not safe attribute-selector idents', () => {
    for (const bad of ['Cupcake', 'my theme', 'a"b', '2cool', '']) {
      expect(() =>
        defineStylePack({ name: 'x', tokens: { a: '1' }, themes: { [bad]: { a: '2' } } }),
      ).toThrow()
    }
  })

  it('rejects an empty token map for a named theme', () => {
    expect(() =>
      defineStylePack({ name: 'x', tokens: { a: '1' }, themes: { cupcake: {} } }),
    ).toThrow(/at least one token/)
  })

  it('copies the input maps — mutating the input does not mutate the pack', () => {
    const themes = { cupcake: { 'color-primary': '#65c3c8' } }
    const p = defineStylePack({ name: 'x', tokens: { a: '1' }, themes })
    themes.cupcake['color-primary'] = '#000'
    expect(p.themes.cupcake['color-primary']).toBe('#65c3c8')
  })
})
