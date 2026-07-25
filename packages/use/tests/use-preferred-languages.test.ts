/**
 * Unit tests for `usePreferredLanguages` (effect-scope plan §5):
 * `navigator.languages`, updated on `languagechange`, and the SSR-static
 * path. jsdom environment (root vitest config).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePreferredLanguages } from '../src/usePreferredLanguages/index.ts'
import { withSSR } from './_ssr.ts'

const ORIGINAL = navigator.languages

beforeEach(() => {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: ['en-US', 'en'],
  })
})

afterEach(() => {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: ORIGINAL,
  })
})

describe('@aihu/use/usePreferredLanguages', () => {
  it('starts with the current navigator.languages, snapshotted as a plain array', () => {
    const { languages } = usePreferredLanguages()
    expect(languages()).toEqual(['en-US', 'en'])
  })

  it('updates on languagechange', () => {
    const { languages } = usePreferredLanguages()
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['fr-FR', 'fr'],
    })
    window.dispatchEvent(new Event('languagechange'))
    expect(languages()).toEqual(['fr-FR', 'fr'])
  })
})

describe('@aihu/use/usePreferredLanguages — SSR-static path', () => {
  it('with isClient false, returns a static empty-array getter and registers nothing', () =>
    withSSR(
      () => import('../src/usePreferredLanguages/index.ts'),
      (mod) => {
        let result: { languages: () => readonly string[] } | undefined
        expect(() => {
          result = mod.usePreferredLanguages()
        }).not.toThrow()
        expect(result?.languages()).toEqual([])
      },
    ))
})
