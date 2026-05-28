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

// Round 2 (tailwind-support `motion` track): transform / translate / rotate /
// scale / transition / duration / ease / animate. One case per family proving
// the public-API CSS output emits the expected declarations — including the
// hoisted `@keyframes` for `animate-*`.
describe('@aihu/css-engine — motion utilities (Round 2)', () => {
  it('transition shorthand emits property + duration + timing', () => {
    const css = compileSfc(`@template { <div class="transition">x</div> }`, 'Transition.aihu')
    expect(css).toContain('transition-property')
    expect(css).toContain('transition-duration: 150ms')
    expect(css).toContain('transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('transition-transform narrows to the transform property', () => {
    const css = compileSfc(
      `@template { <div class="transition-transform">x</div> }`,
      'TransitionTransform.aihu',
    )
    expect(css).toContain('transition-property: transform')
  })

  it('duration-N emits transition-duration in ms', () => {
    const css = compileSfc(`@template { <div class="duration-300">x</div> }`, 'Duration.aihu')
    expect(css).toContain('transition-duration: 300ms')
  })

  it('rotate-N emits a transform rotate', () => {
    const css = compileSfc(`@template { <div class="rotate-45">x</div> }`, 'Rotate.aihu')
    expect(css).toContain('transform: rotate(45deg)')
  })

  it('-translate-x-N emits a negative translateX', () => {
    const css = compileSfc(`@template { <div class="-translate-x-2">x</div> }`, 'NegTranslate.aihu')
    expect(css).toContain('transform: translateX(-0.5rem)')
  })

  it('scale-N maps the percentage to a unit factor', () => {
    const css = compileSfc(`@template { <div class="scale-105">x</div> }`, 'Scale.aihu')
    expect(css).toContain('transform: scale(1.05)')
  })

  it('ease-in-out emits the timing function', () => {
    const css = compileSfc(`@template { <div class="ease-in-out">x</div> }`, 'Ease.aihu')
    expect(css).toContain('transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('animate-spin emits the animation shorthand AND the hoisted @keyframes', () => {
    const css = compileSfc(`@template { <div class="animate-spin">x</div> }`, 'Animate.aihu')
    expect(css).toContain('animation: spin 1s linear infinite')
    expect(css).toContain('@keyframes spin')
  })
})
