// @vitest-environment node

import {
  clearSsrContextMap,
  createContext,
  inject,
  provide,
  runWithContext,
  setSsrContextMap,
} from '@scribe/context'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// 1. createContext returns an opaque token with correct default
// ---------------------------------------------------------------------------
describe('createContext', () => {
  it('returns a token with the supplied default value', () => {
    const token = createContext<number>(42)
    expect(token._default).toBe(42)
    expect(typeof token._id).toBe('symbol')
  })

  it('returns a token with undefined default when no default is supplied', () => {
    const token = createContext<string>()
    expect(token._default).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. provide + inject round-trip within runWithContext
// ---------------------------------------------------------------------------
it('provide + inject round-trip within runWithContext', () => {
  const token = createContext<string>('default')
  const result = runWithContext(new Map(), () => {
    provide(token, 'hello')
    return inject(token)
  })
  expect(result).toBe('hello')
})

// ---------------------------------------------------------------------------
// 3. inject with no active map returns default value
// ---------------------------------------------------------------------------
it('inject with no active map returns default value', () => {
  // Ensure no map is active
  clearSsrContextMap()
  const token = createContext<number>(99)
  expect(inject(token)).toBe(99)
})

// ---------------------------------------------------------------------------
// 4. inject with no active map and no default returns undefined
// ---------------------------------------------------------------------------
it('inject with no active map and no default returns undefined', () => {
  clearSsrContextMap()
  const token = createContext<string>()
  expect(inject(token)).toBeUndefined()
})

// ---------------------------------------------------------------------------
// 5. runWithContext restores null in finally even if fn throws
// ---------------------------------------------------------------------------
it('runWithContext clears map in finally when fn throws', () => {
  const token = createContext<string>('original-default')
  expect(() => {
    runWithContext(new Map(), () => {
      provide(token, 'inside')
      throw new Error('boom')
    })
  }).toThrow('boom')
  // After throw, map must be cleared — inject returns the default
  expect(inject(token)).toBe('original-default')
})

// ---------------------------------------------------------------------------
// 6. Nested runWithContext: inner overrides outer (inner replaces the map)
// ---------------------------------------------------------------------------
it('nested runWithContext: inner map replaces outer map', () => {
  const token = createContext<string>('default')
  const outerMap = new Map<symbol, unknown>()
  const innerMap = new Map<symbol, unknown>()

  runWithContext(outerMap, () => {
    provide(token, 'outer')
    expect(inject(token)).toBe('outer')

    runWithContext(innerMap, () => {
      // inner map is fresh — token not yet provided here
      expect(inject(token)).toBe('default')
      provide(token, 'inner')
      expect(inject(token)).toBe('inner')
    })

    // After inner runWithContext finishes, the map is cleared to null
    // (not restored to outerMap — inner call clears unconditionally)
    expect(inject(token)).toBe('default')
  })
})

// ---------------------------------------------------------------------------
// 7. provide multiple tokens to same map, inject each returns correct value
// ---------------------------------------------------------------------------
it('provide multiple tokens, each inject returns the correct value', () => {
  const tokenA = createContext<string>('a-default')
  const tokenB = createContext<number>(0)

  runWithContext(new Map(), () => {
    provide(tokenA, 'hello')
    provide(tokenB, 42)
    expect(inject(tokenA)).toBe('hello')
    expect(inject(tokenB)).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// 8. inject for a key not provided returns default, not a throw
// ---------------------------------------------------------------------------
it('inject for un-provided key returns default without throwing', () => {
  const token = createContext<boolean>(true)
  const unprovidedToken = createContext<string>('fallback')

  runWithContext(new Map(), () => {
    provide(token, false)
    // unprovidedToken was never provided
    expect(() => inject(unprovidedToken)).not.toThrow()
    expect(inject(unprovidedToken)).toBe('fallback')
  })
})

// ---------------------------------------------------------------------------
// 9. setSsrContextMap / clearSsrContextMap round-trip
// ---------------------------------------------------------------------------
it('setSsrContextMap and clearSsrContextMap round-trip', () => {
  const token = createContext<string>('default')
  const map = new Map<symbol, unknown>()

  setSsrContextMap(map)
  provide(token, 'via-set')
  expect(inject(token)).toBe('via-set')

  clearSsrContextMap()
  expect(inject(token)).toBe('default')
})

// ---------------------------------------------------------------------------
// 10. No DOM reference: the module works in a pure Node/vitest environment
// ---------------------------------------------------------------------------
it('context API is fully usable in a Node environment (no DOM dependency)', () => {
  // If window were referenced in the source this import would fail in
  // a non-jsdom test run. We assert the API round-trips correctly here
  // to confirm no DOM globals are required at runtime.
  const token = createContext<{ x: number }>({ x: 0 })
  const result = runWithContext(new Map(), () => {
    provide(token, { x: 7 })
    return inject(token)
  })
  expect(result).toEqual({ x: 7 })

  // Verify window is not referenced in the source (checked by import success above)
  // The source has no `typeof window` or `document` references.
  expect(typeof createContext).toBe('function')
  expect(typeof provide).toBe('function')
  expect(typeof inject).toBe('function')
  expect(typeof runWithContext).toBe('function')
  expect(typeof setSsrContextMap).toBe('function')
  expect(typeof clearSsrContextMap).toBe('function')
})

// ---------------------------------------------------------------------------
// 11. Shadow: second provide for same token overwrites first (T5)
// ---------------------------------------------------------------------------
it('provide overwrites previous value for same token', () => {
  const token = createContext<number>(0)
  const map = new Map<symbol, unknown>()
  runWithContext(map, () => {
    provide(token, 1)
    provide(token, 2)
    expect(inject(token)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 12. Token identity: two createContext calls produce distinct _id symbols (T1)
// ---------------------------------------------------------------------------
it('two createContext calls produce tokens with distinct _id symbols', () => {
  const t1 = createContext<string>()
  const t2 = createContext<string>()
  // biome-ignore lint/suspicious/noExplicitAny: testing internal _id field
  expect((t1 as any)._id).not.toBe((t2 as any)._id)
})
