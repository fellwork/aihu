/**
 * Unit tests for `useBrowserLanguage` (effect-scope plan §5):
 * `navigator.language`, updated on `languagechange`, and the SSR-static
 * path. jsdom environment (root vitest config).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBrowserLanguage } from '../src/useBrowserLanguage/index.ts'
import { withSSR } from './_ssr.ts'

const ORIGINAL = navigator.language

beforeEach(() => {
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    value: 'en-US',
  })
})

afterEach(() => {
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    value: ORIGINAL,
  })
})

describe('@aihu/use/useBrowserLanguage', () => {
  it('starts with the current navigator.language', () => {
    const { language } = useBrowserLanguage()
    expect(language()).toBe('en-US')
  })

  it('updates on languagechange', () => {
    const { language } = useBrowserLanguage()
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'fr-FR',
    })
    window.dispatchEvent(new Event('languagechange'))
    expect(language()).toBe('fr-FR')
  })
})

describe('@aihu/use/useBrowserLanguage — SSR-static path', () => {
  it('with isClient false, returns a static undefined getter and registers nothing', () =>
    withSSR(
      () => import('../src/useBrowserLanguage/index.ts'),
      (mod) => {
        let result: { language: () => string | undefined } | undefined
        expect(() => {
          result = mod.useBrowserLanguage()
        }).not.toThrow()
        expect(result?.language()).toBeUndefined()
      },
    ))
})
