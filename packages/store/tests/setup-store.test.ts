import { computed, signal } from '@aihu/signals'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetStoreRegistry } from '../src/registry.ts'
import { defineStore } from '../src/store.ts'

beforeEach(() => {
  _resetStoreRegistry()
})

function defineCounter(id: string) {
  return defineStore(id, () => {
    const [count, setCount] = signal(0)
    const [label, setLabel] = signal('zero')
    const double = computed(() => count() * 2)
    function increment(by = 1) {
      setCount((prev) => prev + by)
    }
    return { count, setCount, label, setLabel, double, increment }
  })
}

describe('defineStore (setup style)', () => {
  it('returns a useStore accessor exposing $id', () => {
    const useCounter = defineCounter('c1')
    expect(useCounter.$id).toBe('c1')
    expect(useCounter().$id).toBe('c1')
  })

  it('state, computed, and actions work through the instance', () => {
    const store = defineCounter('c2')()
    expect(store.count()).toBe(0)
    store.increment(3)
    expect(store.count()).toBe(3)
    expect(store.double()).toBe(6)
    store.setCount(10)
    expect(store.count()).toBe(10)
  })

  it('is a lazy module singleton per id on the client', () => {
    const useCounter = defineCounter('c3')
    const a = useCounter()
    a.increment()
    const b = useCounter()
    expect(b).toBe(a)
    expect(b.count()).toBe(1)
  })

  it('two ids are two instances', () => {
    const a = defineCounter('c4a')()
    const b = defineCounter('c4b')()
    a.increment()
    expect(a.count()).toBe(1)
    expect(b.count()).toBe(0)
  })

  it('$patch object form writes state pairs in one batch', () => {
    const store = defineCounter('c5')()
    const seen: number[] = []
    store.$subscribe((state) => seen.push(state.count as number))
    store.$patch({ count: 7, label: 'seven' })
    expect(store.count()).toBe(7)
    expect(store.label()).toBe('seven')
    expect(seen).toEqual([7]) // one notification for two writes
  })

  it('$patch function form receives the store and batches', () => {
    const store = defineCounter('c6')()
    const cb = vi.fn()
    store.$subscribe(cb)
    store.$patch((s) => {
      s.setCount(1)
      s.setLabel('one')
    })
    expect(store.count()).toBe(1)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('$patch ignores keys that are not state', () => {
    const store = defineCounter('c7')()
    store.$patch({ double: 99, increment: 1 } as never)
    expect(store.double()).toBe(0)
    expect(typeof store.increment).toBe('function')
  })

  it('$subscribe fires per change with a state snapshot, not on subscribe', () => {
    const store = defineCounter('c8')()
    const cb = vi.fn()
    const dispose = store.$subscribe(cb)
    expect(cb).not.toHaveBeenCalled()
    store.increment()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ count: 1, label: 'zero' })
    dispose()
    store.increment()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('$onAction fires before the action, after() after it', () => {
    const store = defineCounter('c9')()
    const order: string[] = []
    store.$onAction(({ name, args, after }) => {
      order.push(`before:${name}:${String(args[0])}`)
      after((result) => order.push(`after:${name}:${String(result)}`))
    })
    // Read count inside the hook via the store to prove before-ness.
    store.$onAction(({ store: s }) => {
      order.push(`count-at-call:${(s.count as () => number)()}`)
    })
    store.increment(2)
    expect(order[1]).toBe('count-at-call:0')
    expect(order[2]).toBe('after:increment:undefined')
    expect(store.count()).toBe(2)
  })

  it('$onAction onError fires on throw and the error propagates', () => {
    const useStore = defineStore('c10', () => {
      function explode() {
        throw new Error('boom')
      }
      return { explode }
    })
    const store = useStore()
    const onError = vi.fn()
    store.$onAction(({ onError: hook }) => hook(onError))
    expect(() => store.explode()).toThrow('boom')
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('boom')
  })

  it('$onAction after() awaits async actions; onError catches rejections', async () => {
    const useStore = defineStore('c11', () => {
      const [n, setN] = signal(0)
      async function load(next: number) {
        setN(next)
        return next * 10
      }
      async function fail() {
        throw new Error('nope')
      }
      return { n, setN, load, fail }
    })
    const store = useStore()
    const after = vi.fn()
    const onError = vi.fn()
    store.$onAction((ctx) => {
      ctx.after(after)
      ctx.onError(onError)
    })
    await expect(store.load(4)).resolves.toBe(40)
    expect(after).toHaveBeenCalledWith(40)
    await expect(store.fail()).rejects.toThrow('nope')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('$onAction dispose unsubscribes', () => {
    const store = defineCounter('c12')()
    const cb = vi.fn()
    const dispose = store.$onAction(cb)
    store.increment()
    dispose()
    store.increment()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('$reset throws for setup-style stores with a documented reason', () => {
    const store = defineCounter('c13')()
    expect(() => store.$reset()).toThrow(/options-style/)
  })

  it('$dispose tears down subscriptions and re-instantiates on next use', () => {
    const useCounter = defineCounter('c14')
    const store = useCounter()
    const cb = vi.fn()
    store.$subscribe(cb)
    store.increment()
    expect(cb).toHaveBeenCalledTimes(1)
    store.$dispose()
    store.increment() // stale instance: subscription is dead
    expect(cb).toHaveBeenCalledTimes(1)
    const fresh = useCounter()
    expect(fresh).not.toBe(store)
    expect(fresh.count()).toBe(0)
  })

  it('computed reads are not wrapped as actions ($onAction stays silent on reads)', () => {
    const store = defineCounter('c15')()
    const cb = vi.fn()
    store.$onAction(cb)
    store.double()
    store.count()
    expect(cb).not.toHaveBeenCalled()
  })

  it('non-function setup returns are kept verbatim and not serialized as state', () => {
    const useStore = defineStore('c16', () => {
      const [n, setN] = signal(1)
      return { n, setN, version: 42 }
    })
    const store = useStore()
    expect(store.version).toBe(42)
  })

  it('exposes the registry on globalThis.__AIHU_STORES__ in dev (client)', () => {
    defineCounter('c17')()
    const map = (globalThis as Record<string, unknown>).__AIHU_STORES__ as Map<string, unknown>
    expect(map).toBeInstanceOf(Map)
    expect(map.has('c17')).toBe(true)
  })
})
