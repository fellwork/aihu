import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { _resetStoreRegistry } from '../src/registry.ts'
import { defineStore } from '../src/store.ts'

beforeEach(() => {
  _resetStoreRegistry()
})

function defineCart(id: string) {
  return defineStore(id, {
    state: () => ({ items: [] as string[], discount: 0 }),
    getters: {
      size: (s) => s.items().length,
      summary: (s) => `${s.items().length} items, ${s.discount()}% off`,
    },
    actions: {
      add(item: string) {
        this.setItems((prev) => [...prev, item])
      },
      addTwice(item: string) {
        this.add(item)
        this.add(item)
      },
    },
  })
}

describe('defineStore (options style)', () => {
  it('lowers state keys onto read/write signal pairs', () => {
    const cart = defineCart('o1')()
    expect(cart.items()).toEqual([])
    cart.setItems(['a'])
    expect(cart.items()).toEqual(['a'])
    cart.setDiscount(10)
    expect(cart.discount()).toBe(10)
  })

  it('getters are reactive computed reads over state', () => {
    const cart = defineCart('o2')()
    expect(cart.size()).toBe(0)
    cart.setItems(['a', 'b'])
    expect(cart.size()).toBe(2)
    expect(cart.summary()).toBe('2 items, 0% off')
  })

  it('actions run with this bound to the store, and may call other actions', () => {
    const cart = defineCart('o3')()
    cart.add('x')
    expect(cart.items()).toEqual(['x'])
    cart.addTwice('y')
    expect(cart.items()).toEqual(['x', 'y', 'y'])
  })

  it('nested action calls each fire $onAction', () => {
    const cart = defineCart('o4')()
    const names: string[] = []
    cart.$onAction(({ name }) => names.push(name))
    cart.addTwice('z')
    expect(names).toEqual(['addTwice', 'add', 'add'])
  })

  it('$reset restores the state() factory values', () => {
    const cart = defineCart('o5')()
    cart.add('a')
    cart.setDiscount(50)
    cart.$reset()
    expect(cart.items()).toEqual([])
    expect(cart.discount()).toBe(0)
  })

  it('$patch object form + $subscribe snapshot carry the state tree shape', () => {
    const cart = defineCart('o6')()
    const cb = vi.fn()
    cart.$subscribe(cb)
    cart.$patch({ items: ['p'], discount: 5 })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ items: ['p'], discount: 5 })
  })

  it('$dispose disposes store-owned getter computeds and unregisters', () => {
    const useCart = defineCart('o7')
    const cart = useCart()
    cart.setItems(['a'])
    expect(cart.size()).toBe(1)
    cart.$dispose()
    expect(useCart()).not.toBe(cart)
  })

  it('infers state, getter, and action types (no any in the public surface)', () => {
    const cart = defineCart('o8')()
    expectTypeOf(cart.items).toEqualTypeOf<() => string[]>()
    expectTypeOf(cart.size).toEqualTypeOf<() => number>()
    expectTypeOf(cart.summary()).toBeString()
    expectTypeOf(cart.add).parameter(0).toBeString()
    expectTypeOf(cart.$id).toBeString()
    // @ts-expect-error — discount is a number; a string write must not typecheck
    cart.setDiscount('nope')
    // @ts-expect-error — unknown state key in $patch object form
    cart.$patch({ missing: 1 })
  })
})
