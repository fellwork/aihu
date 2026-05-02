/**
 * Verifies `_buildDeferredHydration` correctly closes the defineElement
 * call when its input has already been processed by `_buildHmrCode`
 * (the order the Vite plugin actually invokes them).
 */

import { describe, expect, it } from 'vitest'
import { _buildDeferredHydration } from '../js/index.ts'

const HMR_PROCESSED = `import { branch, leaf } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement, _hmrReplace } from '@scribe/runtime'
let __scribe_setup__: ((ctx: any) => any) | undefined
defineElement('x-counter', defineComponent(__scribe_setup__ = (_ctx) => {
  const [c] = signal(0)
  return branch('span')
}))

export { __scribe_setup__ as default }

if (typeof __DEV__ !== 'undefined' && __DEV__ && import.meta.hot) {
  import.meta.hot.accept((newModule) => {})
}
`

describe('_buildDeferredHydration after HMR pass', () => {
  it('closes defineElement BEFORE the export postamble (#1)', () => {
    const out = _buildDeferredHydration(HMR_PROCESSED, 'x-counter')
    // The defineElement call must be balanced — i.e. exactly one extra
    // `)` must appear vs. the input, located before `\nexport`.
    expect(out).toMatch(
      /defineElement\(\s*'x-counter'\s*,\s*__scribe_wrap_defer__\(\s*defineComponent\([\s\S]*?\)\)\)\nexport\s+\{\s*__scribe_setup__/,
    )
  })
})
