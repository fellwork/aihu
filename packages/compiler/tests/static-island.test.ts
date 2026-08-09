/**
 * Unit tests for `_buildStaticIsland` and `_buildDeferredHydration`
 * (Plan 3.3 — Islands).
 *
 * Hand-crafted compiled module strings exercise the helpers without
 * requiring the Rust binary.
 */

import { describe, expect, it } from 'vitest'
import { _buildDeferredHydration, _buildStaticIsland } from '../js/index.ts'

const STATIC_OUTPUT = `import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-msg', defineComponent((_ctx) => {
  const message = 'hello'
  return branch('p', undefined, [leaf(message)])
}))
`

const INTERACTIVE_OUTPUT = `import { branch, leaf } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  return branch('span', undefined, [leaf(String(count()))])
}))
`

describe('_buildStaticIsland — Plan 3.3', () => {
  it('drops the @aihu/runtime import for static islands (#1)', () => {
    const out = _buildStaticIsland(STATIC_OUTPUT, 'x-msg')
    expect(out).not.toMatch(/from\s*'@aihu\/runtime'/)
  })

  it('adds `mount` to the @aihu/arbor import (#2)', () => {
    const out = _buildStaticIsland(STATIC_OUTPUT, 'x-msg')
    expect(out).toMatch(/import\s*\{[^}]*\bmount\b[^}]*\}\s*from\s*'@aihu\/arbor'/)
  })

  it('replaces defineElement with customElements.define (#3)', () => {
    const out = _buildStaticIsland(STATIC_OUTPUT, 'x-msg')
    expect(out).toMatch(/customElements\.define\(\s*"x-msg"/)
    expect(out).not.toMatch(/\bdefineElement\(/)
    expect(out).not.toMatch(/\bdefineComponent\(/)
  })

  it('marks the output with the AIHU_STATIC_ISLAND audit comment (#4)', () => {
    const out = _buildStaticIsland(STATIC_OUTPUT, 'x-msg')
    expect(out).toMatch(/AIHU_STATIC_ISLAND/)
  })

  it('returns input unchanged when the expected call shape is missing (#5)', () => {
    const malformed = `// no defineElement call here\nexport const x = 1\n`
    expect(_buildStaticIsland(malformed, 'x-msg')).toBe(malformed)
  })

  // ── The TAIL, which `_injectShadowMode` gets to first ─────────────────────
  //
  // `_injectShadowMode` runs BEFORE this helper in the transform pipeline, so
  // by the time an island is built the `defineElement(...)` call may already
  // carry a third argument and no longer end in `))`. The head rewrite matched
  // anyway while the tail rewrite silently no-opped, emitting a module with an
  // unclosed class body and a dangling options object — invalid JS, produced
  // with no error, surfacing downstream as `[PARSE_ERROR] … invalid JS syntax`
  // against the user's `.aihu` file. Reproduced end to end in a consumer
  // scaffold with `compiler: { islands: true }` + `css: { shadowMode: 'shadow' }`
  // on vite 6 AND vite 8.
  const withOptions = (opts: string) => STATIC_OUTPUT.replace(/\)\)\s*$/, `), { ${opts} })\n`)

  /** Every `(`/`)` and `{`/`}` outside a string literal balances. */
  function isBalanced(code: string): boolean {
    let paren = 0
    let brace = 0
    let quote: string | null = null
    for (let i = 0; i < code.length; i++) {
      const c = code[i]!
      if (quote) {
        if (c === '\\') i++
        else if (c === quote) quote = null
        continue
      }
      if (c === "'" || c === '"' || c === '`') quote = c
      else if (c === '(') paren++
      else if (c === ')') paren--
      else if (c === '{') brace++
      else if (c === '}') brace--
      if (paren < 0 || brace < 0) return false
    }
    return paren === 0 && brace === 0 && quote === null
  }

  it('emits balanced code — never a half-rewritten module — for the plain shape', () => {
    expect(isBalanced(_buildStaticIsland(STATIC_OUTPUT, 'x-msg'))).toBe(true)
  })

  it("absorbs a trailing `{ shadowMode: 'shadow' }` — the island's own open shadow root", () => {
    const out = _buildStaticIsland(withOptions("shadowMode: 'shadow'"), 'x-msg')
    expect(isBalanced(out)).toBe(true)
    expect(out).toMatch(/AIHU_STATIC_ISLAND/)
    expect(out).toContain('mount(__aihu_setup__({ host: root, element: this }), root)')
    // The option is redundant against `attachShadow({ mode: 'open' })`, so it
    // is dropped rather than carried into a class that ignores it.
    expect(out).not.toContain('shadowMode')
  })

  it('DECLINES the island when the options object carries anything else', () => {
    for (const opts of [
      'formAssociated: true',
      "shadowMode: 'shadow', formAssociated: true",
      "shadowMode: 'light', lightScopeId: 'a1b2c3d4'",
    ]) {
      const input = withOptions(opts)
      // Unchanged: the ordinary defineElement path keeps the behaviour this
      // inline class does not implement.
      expect(_buildStaticIsland(input, 'x-msg'), opts).toBe(input)
    }
  })
})

describe('_buildDeferredHydration — Plan 3.3', () => {
  it('imports _hydrateOnVisible from @aihu/runtime (#1)', () => {
    const out = _buildDeferredHydration(INTERACTIVE_OUTPUT, 'x-counter')
    expect(out).toMatch(/import\s*\{[^}]*\b_hydrateOnVisible\b[^}]*\}\s*from\s*'@aihu\/runtime'/)
  })

  it('wraps defineComponent so defer instances hydrate lazily (#2)', () => {
    const out = _buildDeferredHydration(INTERACTIVE_OUTPUT, 'x-counter')
    // Wrap-helper definition + invocation must both be present.
    expect(out).toMatch(/function\s+__aihu_wrap_defer__/)
    expect(out).toMatch(
      /defineElement\(\s*'x-counter'\s*,\s*__aihu_wrap_defer__\(\s*defineComponent\(/,
    )
    expect(out).toMatch(/_hydrateOnVisible\s*\(/)
    expect(out).toMatch(/hasAttribute\(\s*'defer'\s*\)/)
  })

  it('does not add _hydrateOnVisible twice when called repeatedly (#3)', () => {
    const once = _buildDeferredHydration(INTERACTIVE_OUTPUT, 'x-counter')
    const twice = _buildDeferredHydration(once, 'x-counter')
    const matches = twice.match(
      /import\s*\{[^}]*\b_hydrateOnVisible\b[^}]*\}\s*from\s*'@aihu\/runtime'/g,
    )
    expect(matches?.length ?? 0).toBe(1)
  })
})
