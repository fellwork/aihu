import { type Dispose, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerStorePlugin } from '../src/plugins.ts'
import { _resetStoreRegistry } from '../src/registry.ts'
import { defineStore } from '../src/store.ts'

const disposers: Dispose[] = []

beforeEach(() => {
  _resetStoreRegistry()
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers.length = 0
})

function use(plugin: Parameters<typeof registerStorePlugin>[0]): void {
  disposers.push(registerStorePlugin(plugin))
}

function defineCounter(id: string, options?: Record<string, unknown>) {
  return defineStore(
    id,
    () => {
      const [count, setCount] = signal(0)
      function increment() {
        setCount((prev) => prev + 1)
      }
      return { count, setCount, increment }
    },
    options,
  )
}

describe('store plugins', () => {
  it('runs per instantiation with { store, id, options }', () => {
    const seen: unknown[] = []
    use((ctx) => {
      seen.push([ctx.id, ctx.options])
      return undefined
    })
    defineCounter('p1', { persist: true })()
    defineCounter('p2')()
    expect(seen).toEqual([
      ['p1', { persist: true }],
      ['p2', undefined],
    ])
  })

  it('a returned record extends the instance', () => {
    use(({ id }) => ({ $touched: `by-plugin:${id}` }))
    const store = defineCounter('p3')()
    expect((store as unknown as Record<string, unknown>).$touched).toBe('by-plugin:p3')
  })

  it('plugins can hook $subscribe and $onAction', () => {
    const stateChanges = vi.fn()
    const actions = vi.fn()
    use(({ store }) => {
      store.$subscribe(stateChanges)
      store.$onAction(({ name }) => actions(name))
      return undefined
    })
    const store = defineCounter('p4')()
    store.increment()
    expect(stateChanges).toHaveBeenCalledTimes(1)
    expect(actions).toHaveBeenCalledWith('increment')
  })

  it('unregistering stops the plugin for future instantiations only', () => {
    const calls = vi.fn()
    const dispose = registerStorePlugin(() => {
      calls()
      return undefined
    })
    defineCounter('p5')()
    dispose()
    defineCounter('p6')()
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('runs against an already-hydrated instance (adoption precedes plugins)', async () => {
    const { hydrateStores } = await import('../src/ssr.ts')
    hydrateStores({ p7: { count: 12 } })
    let observed: number | undefined
    use(({ store }) => {
      observed = (store.count as () => number)()
      return undefined
    })
    defineCounter('p7')()
    expect(observed).toBe(12)
  })
})
