/**
 * Unit tests for `usePageLeave` (effect-scope plan §5): the bare-getter
 * return shape, `mouseleave`/`mouseenter` tracking on `document`, scope
 * cleanup, and the SSR-static path.
 */
import { effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { usePageLeave } from '../src/usePageLeave/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/usePageLeave', () => {
  it('starts false', () => {
    const isLeft = usePageLeave()
    expect(isLeft()).toBe(false)
  })

  it('flips true on document mouseleave, false again on mouseenter', () => {
    const isLeft = usePageLeave()
    document.dispatchEvent(new MouseEvent('mouseleave'))
    expect(isLeft()).toBe(true)
    document.dispatchEvent(new MouseEvent('mouseenter'))
    expect(isLeft()).toBe(false)
  })

  it('scope.stop() removes both listeners (getter freezes)', () => {
    const scope = effectScope()
    const isLeft = scope.run(() => usePageLeave()) as ReturnType<typeof usePageLeave>
    scope.stop()
    document.dispatchEvent(new MouseEvent('mouseleave'))
    expect(isLeft()).toBe(false)
  })
})

describe('@aihu/use/usePageLeave — SSR-static path', () => {
  it('with isClient false, returns a static false getter and registers nothing', () =>
    withSSR(
      () => import('../src/usePageLeave/index.ts'),
      (mod) => {
        let isLeft: (() => boolean) | undefined
        expect(() => {
          isLeft = mod.usePageLeave()
        }).not.toThrow()
        expect(isLeft?.()).toBe(false)
      },
    ))
})
