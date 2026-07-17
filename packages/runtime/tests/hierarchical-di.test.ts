/**
 * Hierarchical DI: an ancestor component's provide is visible to descendants via
 * the prototype-chained `provides` object, scoped to the subtree (siblings do not
 * see it, a nearer provider overrides a farther one), and resolves across shadow
 * boundaries. This is the client path added on top of @aihu/context's flat SSR map.
 */
import { branch, leaf, mount } from '@aihu/arbor'
import { createContext, inject, provide } from '@aihu/context'
import { signal } from '@aihu/signals'
import { beforeAll, describe, expect, it } from 'vitest'
import { _setMount, _setSignal, defineComponent } from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'

const Theme = createContext<string>('DEFAULT')

beforeAll(() => {
  _setMount(mount)
  _setSignal(signal)
})

// A leaf component that injects Theme and records what it saw.
const seenBy: Record<string, string | undefined> = {}
function makeConsumer(tag: string, key: string) {
  const Cmp = defineComponent(() => {
    seenBy[key] = inject(Theme)
    return branch('span', undefined, [leaf('x')])
  })
  defineElement(tag, Cmp)
}

describe('hierarchical provide/inject', () => {
  it('an ancestor provide reaches a descendant; the default applies with no provider', () => {
    makeConsumer('di-consumer-a', 'a')
    const Provider = defineComponent(() => {
      provide(Theme, 'dark')
      return branch('di-consumer-a', undefined, [])
    })
    defineElement('di-provider-a', Provider)

    // No provider above: default.
    const bare = document.createElement('di-consumer-a')
    ;(seenBy.a as string | undefined) = undefined
    document.body.appendChild(bare)
    expect(seenBy.a).toBe('DEFAULT')
    bare.remove()

    // Under a provider: the provided value.
    const withProvider = document.createElement('di-provider-a')
    document.body.appendChild(withProvider)
    expect(seenBy.a).toBe('dark')
    withProvider.remove()
  })

  it('a nearer provider overrides a farther one (subtree scoping)', () => {
    makeConsumer('di-consumer-b', 'b')
    const Inner = defineComponent(() => {
      provide(Theme, 'light')
      return branch('di-consumer-b', undefined, [])
    })
    defineElement('di-inner-b', Inner)
    const Outer = defineComponent(() => {
      provide(Theme, 'dark')
      return branch('di-inner-b', undefined, [])
    })
    defineElement('di-outer-b', Outer)

    const el = document.createElement('di-outer-b')
    document.body.appendChild(el)
    expect(seenBy.b).toBe('light') // nearest wins
    el.remove()
  })

  it('injection is reactive when the provided value is a signal', () => {
    const Count = createContext<() => number>(() => 0)
    let read: (() => number) | undefined
    const Consumer = defineComponent(() => {
      read = inject(Count)
      return branch('span', undefined, [leaf('x')])
    })
    defineElement('di-consumer-c', Consumer)
    const [count, setCount] = signal(1)
    const Provider = defineComponent(() => {
      provide(Count, count)
      return branch('di-consumer-c', undefined, [])
    })
    defineElement('di-provider-c', Provider)

    const el = document.createElement('di-provider-c')
    document.body.appendChild(el)
    expect(read).toBeDefined()
    expect(read!()).toBe(1)
    setCount(42)
    expect(read!()).toBe(42) // same signal — reads track updates
    el.remove()
  })
})
