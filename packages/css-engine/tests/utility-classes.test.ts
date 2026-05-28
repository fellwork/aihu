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

// Round 2 (tailwind-support): ring widths + ring-offset. `ring-{n}` emits the
// Tailwind v4 box-shadow ring composed from `--tw-ring-*` custom props;
// `ring-offset-{n}` sets `--tw-ring-offset-width`. A combined `ring-2
// ring-blue-500` case proves the WIDTH and COLOR sides coexist on one element.
describe('@aihu/css-engine — ring widths + offset (Round 2)', () => {
  it('ring-{n} emits the box-shadow ring from --tw-ring-* props', () => {
    const css = compileSfc(`@template { <div class="ring-2 ring-blue-500">x</div> }`, 'Ring.aihu')
    expect(css).toContain('ring-2')
    // The composed ring shadow at the requested width.
    expect(css).toContain('calc(2px + var(--tw-ring-offset-width))')
    expect(css).toContain('box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow)')
    // Regression: the color side still emits --tw-ring-color on the same render.
    expect(css).toContain('--tw-ring-color: var(--color-blue-500)')
  })

  it('bare ring is the 3px default', () => {
    const css = compileSfc(`@template { <div class="ring">x</div> }`, 'RingDefault.aihu')
    expect(css).toContain('calc(3px + var(--tw-ring-offset-width))')
  })

  it('ring-offset-{n} sets --tw-ring-offset-width', () => {
    const css = compileSfc(`@template { <div class="ring-offset-2">x</div> }`, 'RingOffset.aihu')
    expect(css).toContain('--tw-ring-offset-width: 2px')
  })

  it('ring-inset flips the inset slot', () => {
    const css = compileSfc(`@template { <div class="ring-inset">x</div> }`, 'RingInset.aihu')
    expect(css).toContain('--tw-ring-inset: inset')
  })
})
