import { describe, expect, it } from 'vitest'
import { compileSfc } from '../src/index.ts'

// Round 1 (tailwind-support): one case per new utility family, asserting the
// public-API CSS output contains the expected declarations. Drives the same
// `compileSfc` path the production bridge uses, so a green case proves the
// class actually emits — not just that the Rust unit test passed.
describe('@aihu/css-engine — new utility families (Round 1)', () => {
  it('space-y-* emits the nested sibling-margin recipe', () => {
    const css = compileSfc(`@template { <ul class="space-y-4">x</ul> }`, 'Space.aihu')
    expect(css).toContain('space-y-4')
    expect(css).toContain('margin-block-start: 1rem')
  })

  it('space-x-* emits margin-inline-start on siblings', () => {
    const css = compileSfc(`@template { <div class="space-x-2">x</div> }`, 'SpaceX.aihu')
    expect(css).toContain('margin-inline-start: 0.5rem')
  })

  it('mx-auto resolves to margin-inline: auto', () => {
    const css = compileSfc(`@template { <div class="mx-auto">x</div> }`, 'Center.aihu')
    expect(css).toContain('mx-auto')
    expect(css).toContain('margin-inline: auto')
  })

  it('max-w-* named scale resolves (max-w-7xl → 80rem)', () => {
    const css = compileSfc(`@template { <div class="max-w-7xl">x</div> }`, 'MaxW.aihu')
    expect(css).toContain('max-w-7xl')
    expect(css).toContain('max-width: 80rem')
  })

  it('grid-cols-N emits a repeat() template', () => {
    const css = compileSfc(`@template { <div class="grid grid-cols-3">x</div> }`, 'Grid.aihu')
    expect(css).toContain('grid-cols-3')
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  })

  it('col-span-N emits a grid-column span', () => {
    const css = compileSfc(`@template { <div class="col-span-2">x</div> }`, 'Span.aihu')
    expect(css).toContain('grid-column: span 2 / span 2')
  })

  it('border-{n} emits the matching border-width', () => {
    const css = compileSfc(`@template { <div class="border-2">x</div> }`, 'Border.aihu')
    expect(css).toContain('border-2')
    expect(css).toContain('border-width: 2px')
  })

  it('directional border-{n} emits the side-specific width', () => {
    const css = compileSfc(`@template { <div class="border-t-4">x</div> }`, 'BorderT.aihu')
    expect(css).toContain('border-top-width: 4px')
  })
})

// Round 2 (tailwind-support — named scales): position scale
// (top/right/bottom/left/inset[-x|-y] + auto + negatives) and the named
// typography scales (leading-*, tracking-*). One case per family asserting the
// public-API emitted CSS.
describe('@aihu/css-engine — named scales (Round 2)', () => {
  it('top-<n> resolves to the spacing scale', () => {
    const css = compileSfc(`@template { <div class="absolute top-4 right-4">x</div> }`, 'Pos.aihu')
    expect(css).toContain('top-4')
    expect(css).toContain('top: 1rem')
    expect(css).toContain('right: 1rem')
  })

  it('inset-0 emits inset: 0 and inset-x/-y the logical shorthands', () => {
    expect(compileSfc(`@template { <div class="inset-0">x</div> }`, 'Inset.aihu')).toContain(
      'inset: 0',
    )
    expect(compileSfc(`@template { <div class="inset-x-2">x</div> }`, 'InsetX.aihu')).toContain(
      'inset-inline: 0.5rem',
    )
    expect(compileSfc(`@template { <div class="inset-y-4">x</div> }`, 'InsetY.aihu')).toContain(
      'inset-block: 1rem',
    )
  })

  it('negative position (-left-2) emits a negative offset', () => {
    const css = compileSfc(`@template { <div class="-left-2">x</div> }`, 'NegLeft.aihu')
    expect(css).toContain('left: -0.5rem')
  })

  it('top-auto emits top: auto', () => {
    const css = compileSfc(`@template { <div class="top-auto">x</div> }`, 'TopAuto.aihu')
    expect(css).toContain('top: auto')
  })

  it('leading-* named scale resolves (leading-relaxed → 1.625)', () => {
    const css = compileSfc(`@template { <p class="leading-relaxed">x</p> }`, 'Lead.aihu')
    expect(css).toContain('leading-relaxed')
    expect(css).toContain('line-height: 1.625')
  })

  it('leading-tight / leading-none resolve to unitless multipliers', () => {
    expect(compileSfc(`@template { <p class="leading-tight">x</p> }`, 'Lt.aihu')).toContain(
      'line-height: 1.25',
    )
    expect(compileSfc(`@template { <p class="leading-none">x</p> }`, 'Ln.aihu')).toContain(
      'line-height: 1',
    )
  })

  it('tracking-* named scale resolves (tracking-wide → 0.025em)', () => {
    const css = compileSfc(`@template { <h1 class="tracking-wide">x</h1> }`, 'Track.aihu')
    expect(css).toContain('tracking-wide')
    expect(css).toContain('letter-spacing: 0.025em')
  })

  it('tracking-tighter / tracking-widest resolve to the em extremes', () => {
    expect(compileSfc(`@template { <h1 class="tracking-tighter">x</h1> }`, 'Tt.aihu')).toContain(
      'letter-spacing: -0.05em',
    )
    expect(compileSfc(`@template { <h1 class="tracking-widest">x</h1> }`, 'Tw.aihu')).toContain(
      'letter-spacing: 0.1em',
    )
  })

  it('regression: arbitrary forms still work (arbitrary_prop untouched)', () => {
    expect(compileSfc(`@template { <div class="top-[3px]">x</div> }`, 'ArbTop.aihu')).toContain(
      'top: 3px',
    )
    expect(compileSfc(`@template { <p class="leading-[2]">x</p> }`, 'ArbLead.aihu')).toContain(
      'line-height: 2',
    )
  })
})
