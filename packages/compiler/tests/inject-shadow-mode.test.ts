/**
 * Unit tests for `_injectShadowMode` (T4-E3 capability addition).
 *
 * Verifies the Vite-plugin post-process step that lets a project opt
 * its components out of shadow DOM (`shadowMode: 'light'`), required for
 * global utility-class CSS frameworks (Tailwind, UnoCSS, Pico).
 *
 * Tests hand-craft the compiled module shape so they do not require the
 * Rust binary to be built — they exercise the JS-side helper in isolation.
 */

import { describe, expect, it } from 'vitest'
import { _injectShadowMode } from '../js/index.ts'

const COMPILED_STATIC = `import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-msg', defineComponent((_ctx) => {
  return branch('p', undefined, [leaf('hello')])
}))
`

const COMPILED_INTERACTIVE = `import { branch, leaf } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-counter', defineComponent((ctx) => {
  const [count, setCount] = signal(0)
  return branch('span', undefined, [leaf(count)])
}))
`

describe('_injectShadowMode', () => {
  it("injects { shadowMode: 'light' } as third arg to defineElement", () => {
    const out = _injectShadowMode(COMPILED_STATIC, 'light')
    expect(out).toContain("defineElement('x-msg', defineComponent((_ctx) => {")
    expect(out).toContain("}), { shadowMode: 'light' })")
  })

  it("'shadow' is still injected explicitly when requested", () => {
    const out = _injectShadowMode(COMPILED_STATIC, 'shadow')
    expect(out).toContain("{ shadowMode: 'shadow' })")
  })

  it('leaves code untouched when no defineElement(...) call is found', () => {
    const noDefine = `import { branch } from '@aihu/arbor'\nexport const tree = branch('div', undefined, [])\n`
    expect(_injectShadowMode(noDefine, 'light')).toBe(noDefine)
  })

  it('preserves the original setup function body verbatim', () => {
    const out = _injectShadowMode(COMPILED_INTERACTIVE, 'light')
    expect(out).toContain('const [count, setCount] = signal(0)')
    expect(out).toContain("branch('span'")
  })

  it('folds lightScopeId into the SAME options object as shadowMode (LDF §10 step 3)', () => {
    const out = _injectShadowMode(COMPILED_STATIC, 'light', 'a1b2c3d4')
    expect(out).toContain("}), { shadowMode: 'light', lightScopeId: 'a1b2c3d4' })")
    // Exactly one options object — not two independent injections colliding.
    expect(out.match(/\{ shadowMode:/g)).toHaveLength(1)
  })

  it('omits lightScopeId entirely when not provided (shadow mode)', () => {
    const out = _injectShadowMode(COMPILED_STATIC, 'shadow')
    expect(out).toContain("{ shadowMode: 'shadow' })")
    expect(out).not.toContain('lightScopeId')
  })
})
