// @vitest-environment node
//
// Hard correctness requirement: on the server, stores are per-request.
// Two concurrent runWithContext scopes must see distinct instances, and
// serializeStores() must read only the active request's registry.
import { clearSsrContextMap, runWithContext, setSsrContextMap } from '@aihu/context'
import { signal } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetStoreRegistry } from '../src/registry.ts'
import { serializeStores } from '../src/ssr.ts'
import { defineStore } from '../src/store.ts'

beforeEach(() => {
  _resetStoreRegistry()
})

function defineCounter(id: string) {
  return defineStore(id, () => {
    const [count, setCount] = signal(0)
    return { count, setCount }
  })
}

describe('SSR per-request isolation', () => {
  it('two runWithContext scopes see distinct instances', () => {
    const useCounter = defineCounter('s1')
    let first: unknown
    runWithContext(new Map(), () => {
      const store = useCounter()
      first = store
      store.setCount(41)
      expect(store.count()).toBe(41)
    })
    runWithContext(new Map(), () => {
      const store = useCounter()
      expect(store).not.toBe(first)
      expect(store.count()).toBe(0) // request B never sees request A's writes
    })
  })

  it('two CONCURRENT (interleaved) request scopes never share state', () => {
    const useCounter = defineCounter('s2')
    const mapA = new Map<symbol, unknown>()
    const mapB = new Map<symbol, unknown>()

    // Interleave the two requests' work, as a scheduler would between
    // synchronous render slices.
    setSsrContextMap(mapA)
    const storeA = useCounter()
    storeA.setCount(1)
    setSsrContextMap(mapB)
    const storeB = useCounter()
    setSsrContextMap(mapA)
    storeA.setCount(2)
    setSsrContextMap(mapB)
    expect(useCounter()).toBe(storeB)
    expect(storeB.count()).toBe(0)
    setSsrContextMap(mapA)
    expect(useCounter()).toBe(storeA)
    expect(storeA.count()).toBe(2)
    clearSsrContextMap()
  })

  it('serializeStores() reads the active request registry only', () => {
    const useCounter = defineCounter('s3')
    const snapA = runWithContext(new Map(), () => {
      useCounter().setCount(7)
      return serializeStores()
    })
    const snapB = runWithContext(new Map(), () => serializeStores())
    expect(snapA).toEqual({ s3: { count: 7 } })
    expect(snapB).toEqual({}) // request B never used the store
  })

  it('outside any request scope the server falls back to a module registry', () => {
    const useCounter = defineCounter('s4')
    const a = useCounter()
    a.setCount(5)
    expect(useCounter()).toBe(a)
    // ...and a request scope does not see the fallback instance:
    runWithContext(new Map(), () => {
      expect(useCounter().count()).toBe(0)
    })
  })
})
