/**
 * Unit tests for `_injectShadowMode` (T4-E3 capability addition).
 *
 * Verifies the Vite-plugin post-process step that lets a project opt
 * its components out of shadow DOM (`shadowMode: 'none'`), required for
 * global utility-class CSS frameworks (Tailwind, UnoCSS, Pico).
 *
 * Tests hand-craft the compiled module shape so they do not require the
 * Rust binary to be built — they exercise the JS-side helper in isolation.
 */

import { describe, expect, it } from 'vitest'
import { _injectShadowMode } from '../js/index.ts'

const COMPILED_STATIC = `import { branch, leaf } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('x-msg', defineComponent((_ctx) => {
  return branch('p', undefined, [leaf('hello')])
}))
`

const COMPILED_INTERACTIVE = `import { branch, leaf } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('x-counter', defineComponent((ctx) => {
  const [count, setCount] = signal(0)
  return branch('span', undefined, [leaf(count)])
}))
`

describe('_injectShadowMode', () => {
  it("injects { shadowMode: 'none' } as third arg to defineElement", () => {
    const out = _injectShadowMode(COMPILED_STATIC, 'none')
    expect(out).toContain("defineElement('x-msg', defineComponent((_ctx) => {")
    expect(out).toContain("}), { shadowMode: 'none' })")
  })

  it("injects { shadowMode: 'closed' } correctly", () => {
    const out = _injectShadowMode(COMPILED_INTERACTIVE, 'closed')
    expect(out).toContain("{ shadowMode: 'closed' })")
    expect(out).not.toContain("'open'")
  })

  it("'open' is still injected explicitly when requested", () => {
    const out = _injectShadowMode(COMPILED_STATIC, 'open')
    expect(out).toContain("{ shadowMode: 'open' })")
  })

  it('leaves code untouched when no defineElement(...) call is found', () => {
    const noDefine = `import { branch } from '@scribe/arbor'\nexport const tree = branch('div', undefined, [])\n`
    expect(_injectShadowMode(noDefine, 'none')).toBe(noDefine)
  })

  it('preserves the original setup function body verbatim', () => {
    const out = _injectShadowMode(COMPILED_INTERACTIVE, 'none')
    expect(out).toContain('const [count, setCount] = signal(0)')
    expect(out).toContain("branch('span'")
  })
})
