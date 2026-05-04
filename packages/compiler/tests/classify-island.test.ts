/**
 * Unit tests for `_classifyIsland` and the static-island / deferred-
 * hydration emit helpers (Plan 3.3).
 *
 * Tests intentionally hand-craft the compiled module shape so they do not
 * require the Rust binary to be built — they exercise the JS-side helpers
 * in isolation.
 */

import { describe, expect, it } from 'vitest'
import { _classifyIsland } from '../js/index.ts'

const STATIC_OUTPUT = `import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('x-msg', defineComponent((_ctx) => {
  const message = 'hello'
  return branch('p', undefined, [leaf(message)])
}))
`

const INTERACTIVE_OUTPUT = `import { branch, leaf } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('x-counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  return branch('span', undefined, [leaf([count, setCount] as unknown as Signal<string>)])
}))
`

describe('_classifyIsland — Plan 3.3', () => {
  it('classifies a leaf-only template as static (#1)', () => {
    expect(_classifyIsland(STATIC_OUTPUT)).toBe('static')
  })

  it('classifies a signal()-bearing template as interactive (#2)', () => {
    expect(_classifyIsland(INTERACTIVE_OUTPUT)).toBe('interactive')
  })

  it('treats computed() as interactive (#3)', () => {
    const code = STATIC_OUTPUT.replace(
      "const message = 'hello'",
      "const message = computed(() => 'hi')",
    )
    expect(_classifyIsland(code)).toBe('interactive')
  })

  it('treats effect() as interactive (#4)', () => {
    const code = STATIC_OUTPUT.replace(
      "const message = 'hello'",
      "effect(() => { console.log('side') })\n  const message = 'hello'",
    )
    expect(_classifyIsland(code)).toBe('interactive')
  })

  it('treats setSignal() as interactive (#5)', () => {
    const code = STATIC_OUTPUT.replace(
      "const message = 'hello'",
      "setSignal(somewhere, 'value')\n  const message = 'hello'",
    )
    expect(_classifyIsland(code)).toBe('interactive')
  })

  it('does NOT mistake a bare `signal` import for an interactive call (#6)', () => {
    // An unused import line containing the identifier `signal` but no
    // call expression should leave the file classified as static.
    const codeWithBareImport = `import { signal } from '@scribe/signals'\n${STATIC_OUTPUT}`
    expect(_classifyIsland(codeWithBareImport)).toBe('static')
  })

  it('matches identifiers with whitespace before the paren (#7)', () => {
    const code = STATIC_OUTPUT.replace("const message = 'hello'", 'const [v] = signal (0)')
    expect(_classifyIsland(code)).toBe('interactive')
  })
})
