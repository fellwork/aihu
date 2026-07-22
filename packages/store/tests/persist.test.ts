import { type Dispose, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPersistPlugin, type StorageLike } from '../src/persist.ts'
import { registerStorePlugin } from '../src/plugins.ts'
import { _resetStoreRegistry } from '../src/registry.ts'
import { defineStore } from '../src/store.ts'

function mockStorage(seed: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>
  writes: number
} {
  const data = new Map(Object.entries(seed))
  return {
    data,
    writes: 0,
    getItem(key) {
      return data.get(key) ?? null
    },
    setItem(key, value) {
      this.writes += 1
      data.set(key, value)
    },
  }
}

const disposers: Dispose[] = []

beforeEach(() => {
  _resetStoreRegistry()
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers.length = 0
})

function defineCounter(id: string, options?: Record<string, unknown>) {
  return defineStore(
    id,
    () => {
      const [count, setCount] = signal(0)
      return { count, setCount }
    },
    options,
  )
}

async function microtasks(): Promise<void> {
  await Promise.resolve()
}

describe('persistPlugin', () => {
  it('is opt-in: stores without { persist } are untouched', async () => {
    const storage = mockStorage()
    disposers.push(registerStorePlugin(createPersistPlugin({ storage })))
    const store = defineCounter('q1')()
    store.setCount(5)
    await microtasks()
    expect(storage.data.size).toBe(0)
  })

  it('hydrates from storage on init', () => {
    const storage = mockStorage({ 'aihu:q2': JSON.stringify({ count: 33 }) })
    disposers.push(registerStorePlugin(createPersistPlugin({ storage })))
    const store = defineCounter('q2', { persist: true })()
    expect(store.count()).toBe(33)
  })

  it('writes through on change, coalesced per microtask', async () => {
    const storage = mockStorage()
    disposers.push(registerStorePlugin(createPersistPlugin({ storage })))
    const store = defineCounter('q3', { persist: true })()
    store.setCount(1)
    store.setCount(2)
    store.setCount(3)
    await microtasks()
    expect(storage.writes).toBe(1) // three sync writes → one setItem
    expect(JSON.parse(storage.data.get('aihu:q3') ?? '')).toEqual({ count: 3 })
    store.setCount(4)
    await microtasks()
    expect(storage.writes).toBe(2)
    expect(JSON.parse(storage.data.get('aihu:q3') ?? '')).toEqual({ count: 4 })
  })

  it('honors { persist: { key } } and a custom prefix', async () => {
    const storage = mockStorage()
    disposers.push(registerStorePlugin(createPersistPlugin({ storage, prefix: 'app:' })))
    const store = defineCounter('q4', { persist: { key: 'counter' } })()
    store.setCount(9)
    await microtasks()
    expect(storage.data.has('app:counter')).toBe(true)
  })

  it('survives a corrupt storage entry (starts from current state)', async () => {
    const storage = mockStorage({ 'aihu:q5': '{not json' })
    disposers.push(registerStorePlugin(createPersistPlugin({ storage })))
    const store = defineCounter('q5', { persist: true })()
    expect(store.count()).toBe(0)
    store.setCount(2)
    await microtasks()
    expect(JSON.parse(storage.data.get('aihu:q5') ?? '')).toEqual({ count: 2 })
  })

  it('round-trips across a "reload" (fresh registry, same storage)', async () => {
    const storage = mockStorage()
    const dispose = registerStorePlugin(createPersistPlugin({ storage }))
    const store = defineCounter('q6', { persist: true })()
    store.setCount(21)
    await microtasks()
    dispose()
    _resetStoreRegistry()
    disposers.push(registerStorePlugin(createPersistPlugin({ storage })))
    const fresh = defineCounter('q6', { persist: true })()
    expect(fresh.count()).toBe(21)
  })

  it('storage precedence: local edits win over an SSR snapshot', async () => {
    const { hydrateStores } = await import('../src/ssr.ts')
    const storage = mockStorage({ 'aihu:q7': JSON.stringify({ count: 100 }) })
    disposers.push(registerStorePlugin(createPersistPlugin({ storage })))
    hydrateStores({ q7: { count: 1 } })
    const store = defineCounter('q7', { persist: true })()
    expect(store.count()).toBe(100)
  })
})

describe('persistPlugin SSR guard', () => {
  it('defaults to window.localStorage and no-ops when absent', () => {
    // In jsdom window exists; simulate the server by removing localStorage.
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true })
    try {
      disposers.push(registerStorePlugin(createPersistPlugin()))
      const store = defineCounter('q8', { persist: true })()
      expect(() => store.setCount(1)).not.toThrow()
      expect(store.count()).toBe(1)
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
    }
  })
})
