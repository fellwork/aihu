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
