/**
 * collection behavior tests (jsdom): DOM-ordered registration regardless of
 * insertion order, disconnection removal, and reactive consumption.
 */
import { effect } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import { injectContext } from '../dom-context.ts'
import { type AihuCollection, collectionContext, defineCollection } from './index.ts'

defineCollection()

describe('<aihu-collection>', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function mountWithItems(n: number): { col: AihuCollection; items: HTMLElement[] } {
    const col = document.createElement('aihu-collection') as AihuCollection
    const items: HTMLElement[] = []
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div')
      el.dataset.idx = String(i)
      col.appendChild(el)
      items.push(el)
    }
    document.body.appendChild(col)
    return { col, items }
  }

  it('registers descendants in DOM order regardless of insertion order', () => {
    const { col, items } = mountWithItems(3)
    // Register out of order: 2, 0, 1.
    col.register(items[2])
    col.register(items[0])
    col.register(items[1])
    expect(col.items().map((e) => (e as HTMLElement).dataset.idx)).toEqual(['0', '1', '2'])
  })

  it('disconnecting a descendant removes it from items', () => {
    const { col, items } = mountWithItems(3)
    const disposers = items.map((el) => col.register(el))
    expect(col.items()).toHaveLength(3)
    disposers[1]() // unregister middle
    expect(col.items().map((e) => (e as HTMLElement).dataset.idx)).toEqual(['0', '2'])
  })

  it('an injecting consumer reads items reactively', () => {
    const { items } = mountWithItems(2)
    const ctx = injectContext(items[0], collectionContext)

    const counts: number[] = []
    const dispose = effect(() => {
      counts.push(ctx.items().length)
    })
    expect(counts).toEqual([0])

    ctx.register(items[0])
    ctx.register(items[1])
    expect(counts).toEqual([0, 1, 2])
    dispose()
  })
})
