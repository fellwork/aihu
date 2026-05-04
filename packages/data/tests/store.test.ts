// @vitest-environment node

import { createResourceSerializer, createResourceStore } from '@scribe/data'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// createResourceStore
// ---------------------------------------------------------------------------
describe('createResourceStore', () => {
  it('get returns undefined for missing keys', () => {
    const store = createResourceStore()
    expect(store.get('/missing')).toBeUndefined()
  })

  it('set and get round-trip', () => {
    const store = createResourceStore()
    store.set('/api/a', { status: 'ready', data: 42 })
    expect(store.get('/api/a')).toEqual({ status: 'ready', data: 42 })
  })

  it('delete removes the entry', () => {
    const store = createResourceStore()
    store.set('/api/a', { status: 'ready', data: 'x' })
    store.delete('/api/a')
    expect(store.get('/api/a')).toBeUndefined()
  })

  it('entries() iterates all set entries', () => {
    const store = createResourceStore()
    store.set('/api/a', { status: 'ready', data: 1 })
    store.set('/api/b', { status: 'loading' })
    const entries = [...store.entries()]
    expect(entries).toHaveLength(2)
    const keys = entries.map(([k]) => k)
    expect(keys).toContain('/api/a')
    expect(keys).toContain('/api/b')
  })

  it('dehydratableKeys starts empty', () => {
    const store = createResourceStore()
    expect(store.dehydratableKeys.size).toBe(0)
  })

  it('markDehydratable adds key to dehydratableKeys', () => {
    const store = createResourceStore()
    store.markDehydratable('/api/a')
    expect(store.dehydratableKeys.has('/api/a')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// createResourceSerializer
// ---------------------------------------------------------------------------
describe('createResourceSerializer', () => {
  it('S1: returns empty resources for an empty store', () => {
    const store = createResourceStore()
    const serializer = createResourceSerializer(store)
    const result = serializer()
    expect(result).toEqual({ resources: {} })
  })

  it('S2: returns correct key→state for ready+dehydratable entries', () => {
    const store = createResourceStore()
    store.set('/api/a', { status: 'ready', data: { name: 'Alice' } })
    store.markDehydratable('/api/a')
    store.set('/api/b', { status: 'ready', data: { name: 'Bob' } })
    store.markDehydratable('/api/b')

    const serializer = createResourceSerializer(store)
    const result = serializer() as { resources: Record<string, unknown> }

    expect(result.resources).toEqual({
      '/api/a': { status: 'ready', data: { name: 'Alice' } },
      '/api/b': { status: 'ready', data: { name: 'Bob' } },
    })
  })

  it('S3: skips entries that are not marked dehydratable', () => {
    const store = createResourceStore()
    store.set('/api/a', { status: 'ready', data: 'alpha' })
    store.markDehydratable('/api/a')
    store.set('/api/b', { status: 'ready', data: 'beta' }) // NOT dehydratable

    const serializer = createResourceSerializer(store)
    const result = serializer() as { resources: Record<string, unknown> }

    expect(result.resources).toHaveProperty('/api/a')
    expect(result.resources).not.toHaveProperty('/api/b')
  })

  it('S4: skips entries that are dehydratable but not status ready', () => {
    const store = createResourceStore()
    store.set('/api/c', { status: 'error', error: new Error('boom') })
    store.markDehydratable('/api/c')
    store.set('/api/d', { status: 'loading' })
    store.markDehydratable('/api/d')

    const serializer = createResourceSerializer(store)
    const result = serializer() as { resources: Record<string, unknown> }

    expect(result.resources).not.toHaveProperty('/api/c')
    expect(result.resources).not.toHaveProperty('/api/d')
  })

  it('S5: serializer called twice returns consistent snapshot', () => {
    const store = createResourceStore()
    store.set('/api/a', { status: 'ready', data: 1 })
    store.markDehydratable('/api/a')

    const serializer = createResourceSerializer(store)
    const r1 = serializer()
    const r2 = serializer()
    expect(r1).toEqual(r2)
  })

  it('S6: works with plain ResourceStore that lacks markDehydratable (safe degradation)', () => {
    // A plain ResourceStore without the extended meta methods
    const plainStore = {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      entries: function* () {},
    }

    const serializer = createResourceSerializer(plainStore)
    const result = serializer()
    expect(result).toEqual({ resources: {} })
  })
})
