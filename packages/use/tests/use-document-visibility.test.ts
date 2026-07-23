/**
 * Unit tests for `useDocumentVisibility` (effect-scope plan §5):
 * `visibilitychange` tracking, scope cleanup, and the SSR-static path
 * (`'visible'`). jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useDocumentVisibility } from '../src/useDocumentVisibility/index.ts'
import { withSSR } from './_ssr.ts'

function fireVisibilityChange(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('@aihu/use/useDocumentVisibility', () => {
  it('starts at the current document.visibilityState', () => {
    const { visibility } = useDocumentVisibility()
    expect(visibility()).toBe(document.visibilityState)
  })

  it('updates on visibilitychange', () => {
    const { visibility } = useDocumentVisibility()
    fireVisibilityChange('hidden')
    expect(visibility()).toBe('hidden')
    fireVisibilityChange('visible')
    expect(visibility()).toBe('visible')
  })

  it('scope.stop() removes the listener (getter freezes)', () => {
    const scope = effectScope()
    const doc = scope.run(() => useDocumentVisibility()) as ReturnType<typeof useDocumentVisibility>
    scope.stop()
    fireVisibilityChange('hidden')
    expect(doc.visibility()).toBe('visible')
  })
})

describe('@aihu/use/useDocumentVisibility — SSR-static path', () => {
  it("with isClient false, returns a static 'visible' getter and registers nothing", () =>
    withSSR(
      () => import('../src/useDocumentVisibility/index.ts'),
      (mod) => {
        let result: { visibility: () => DocumentVisibilityState } | undefined
        expect(() => {
          result = mod.useDocumentVisibility()
        }).not.toThrow()
        expect(result?.visibility()).toBe('visible')
      },
    ))
})
