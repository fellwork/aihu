/**
 * Unit tests for `useLocalStorage` (effect-scope plan §5): default value,
 * persisted reads, `setValue` writes, cross-tab `storage` sync, and the
 * SSR-static path (no `localStorage` access at all). jsdom environment
 * (root vitest config).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useLocalStorage } from '../src/useLocalStorage/index.ts'
import { withSSR } from './_ssr.ts'

beforeEach(() => {
  window.localStorage.clear()
})

describe('@aihu/use/useLocalStorage', () => {
  it('starts at the default value when nothing is stored', () => {
    const { value } = useLocalStorage('missing-key', 42)
    expect(value()).toBe(42)
  })

  it('reads an existing stored (JSON) value', () => {
    window.localStorage.setItem('k', JSON.stringify({ a: 1 }))
    const { value } = useLocalStorage('k', { a: 0 })
    expect(value()).toEqual({ a: 1 })
  })

  it('setValue updates the getter and persists to localStorage', () => {
    const { value, setValue } = useLocalStorage('k2', 1)
    setValue(2)
    expect(value()).toBe(2)
    expect(window.localStorage.getItem('k2')).toBe(JSON.stringify(2))
  })

  it('a storage event for the same key updates the getter', () => {
    const { value } = useLocalStorage('k3', 1)
    window.localStorage.setItem('k3', JSON.stringify(99))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'k3', storageArea: window.localStorage }),
    )
    expect(value()).toBe(99)
  })

  it('a storage event for a different key is ignored', () => {
    const { value } = useLocalStorage('k4', 1)
    window.localStorage.setItem('other', JSON.stringify(99))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'other', storageArea: window.localStorage }),
    )
    expect(value()).toBe(1)
  })

  it('falls back to the default on corrupt stored JSON', () => {
    window.localStorage.setItem('bad', 'not json{')
    const { value } = useLocalStorage('bad', 'fallback')
    expect(value()).toBe('fallback')
  })

  it('falls back to an in-memory signal when accessing localStorage throws (blocked cookies/site data)', () => {
    const blockedWindow = {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError')
      },
    } as unknown as Window

    let result: ReturnType<typeof useLocalStorage<number>> | undefined
    expect(() => {
      result = useLocalStorage('k5', 5, { window: blockedWindow })
    }).not.toThrow()
    expect(result?.value()).toBe(5)

    expect(() => result?.setValue(6)).not.toThrow()
    expect(result?.value()).toBe(6)
  })

  it('setValue survives a QuotaExceededError from setItem: signal still updates, error is swallowed', () => {
    const setItemSpy = vi
      .spyOn(Object.getPrototypeOf(window.localStorage), 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })

    const { value, setValue } = useLocalStorage('k6', 1)
    expect(() => setValue(2)).not.toThrow()
    expect(value()).toBe(2)

    setItemSpy.mockRestore()
  })
})

describe('@aihu/use/useLocalStorage — SSR-static path', () => {
  it('with isClient false, returns the default and never touches localStorage', () =>
    withSSR(
      () => import('../src/useLocalStorage/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useLocalStorage<number>> | undefined
        expect(() => {
          result = mod.useLocalStorage('k', 7)
        }).not.toThrow()
        expect(result?.value()).toBe(7)
        expect(() => result?.setValue(8)).not.toThrow()
      },
    ))
})
