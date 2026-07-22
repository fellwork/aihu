import { computed, signal } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetStoreRegistry } from '../src/registry.ts'
import { hydrateStores, serializeStores } from '../src/ssr.ts'
import { defineStore } from '../src/store.ts'

beforeEach(() => {
  _resetStoreRegistry()
})

function defineUser(id: string) {
  return defineStore(id, () => {
    const [name, setName] = signal('anon')
    const [visits, setVisits] = signal(0)
    const shout = computed(() => name().toUpperCase())
    function visit() {
      setVisits((prev) => prev + 1)
    }
    return { name, setName, visits, setVisits, shout, visit }
  })
}

describe('serialize / hydrate (registry-based, arbor-independent)', () => {
  it('serializes only state — never getters or actions', () => {
    const store = defineUser('h1')()
    store.setName('ada')
    store.visit()
    expect(serializeStores()).toEqual({ h1: { name: 'ada', visits: 1 } })
  })

  it('round-trips through JSON (wire shape is <script type="application/json"> safe)', () => {
    const store = defineUser('h2')()
    store.setName('grace')
    const wire = JSON.stringify(serializeStores()).replace(/</g, '\\u003c')
    _resetStoreRegistry() // "new page load"
    hydrateStores(JSON.parse(wire))
    const fresh = defineUser('h2')()
    expect(fresh.name()).toBe('grace')
    expect(fresh.shout()).toBe('GRACE') // getters re-derive from adopted state
  })

  it('pre-seeded snapshot is adopted lazily on FIRST use (kept until then)', () => {
    hydrateStores({ h3: { name: 'lin', visits: 3 }, never_used: { x: 1 } })
    // Nothing instantiated yet; snapshot sits pending. First use adopts it:
    const store = defineUser('h3')()
    expect(store.name()).toBe('lin')
    expect(store.visits()).toBe(3)
    // Adoption happens before any subscriber could observe defaults, and
    // the unused entry stays pending without erroring.
    const again = defineUser('h3')()
    expect(again).toBe(store)
  })

  it('hydrating after a store is already live patches it immediately', () => {
    const store = defineUser('h4')()
    expect(store.name()).toBe('anon')
    hydrateStores({ h4: { name: 'joan', visits: 9 } })
    expect(store.name()).toBe('joan')
    expect(store.visits()).toBe(9)
  })

  it('a client store missing from the snapshot initializes fresh', () => {
    hydrateStores({ some_other_store: { a: 1 } })
    const store = defineUser('h5')()
    expect(store.name()).toBe('anon')
    expect(store.visits()).toBe(0)
  })

  it('snapshot keys that are not state on the store are ignored', () => {
    hydrateStores({ h6: { name: 'ok', shout: 'HAX', visit: 'nope', ghost: 1 } })
    const store = defineUser('h6')()
    expect(store.name()).toBe('ok')
    expect(store.shout()).toBe('OK')
    expect(typeof store.visit).toBe('function')
  })

  it('serializing never subscribes (untracked reads)', () => {
    const store = defineUser('h7')()
    serializeStores()
    // A write after serialization must not re-trigger anything serialization
    // could have subscribed — proxy check: no throw, state advances normally.
    store.visit()
    expect(store.visits()).toBe(1)
    expect(serializeStores()).toEqual({ h7: { name: 'anon', visits: 1 } })
  })
})
