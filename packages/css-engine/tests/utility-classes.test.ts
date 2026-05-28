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

// Round 2 (tailwind-support / aria-data-container): aria-*/data-* attribute
// variants + container queries (@container). Each case drives the public
// `compileSfc` path so a green case proves the variant actually emits.
describe('@aihu/css-engine — aria/data variants + container queries (Round 2)', () => {
  it('aria-expanded: emits an attribute selector ([aria-expanded="true"])', () => {
    const css = compileSfc(
      `@template { <button class="aria-expanded:bg-accent">x</button> }`,
      'AriaExpanded.aihu',
    )
    expect(css).toContain('[aria-expanded="true"]')
    expect(css).toContain('background-color: var(--color-accent)')
  })

  it('data-[state=open]: emits a data-attribute selector', () => {
    const css = compileSfc(
      `@template { <div class="data-[state=open]:underline">x</div> }`,
      'DataState.aihu',
    )
    expect(css).toContain('[data-state="open"]')
    expect(css).toContain('text-decoration-line: underline')
  })

  it('@container marker + @md: child wrap in a container query', () => {
    // The proven user-visible pattern: a @container parent and an @md:flex child.
    const css = compileSfc(
      `@template { <div class="@container"><div class="@md:flex">x</div></div> }`,
      'Container.aihu',
    )
    expect(css).toContain('container-type: inline-size')
    expect(css).toContain('@container (min-width: 28rem)')
    expect(css).toContain('display: flex')
  })
})
