/**
 * Composable contract: a plain function called inside a component's setup (i.e.
 * inside an `@state` block, which lowers to the setup body) may use the full
 * reactive surface — signals, lifecycle hooks bound to THIS component, and
 * hierarchical inject/provide. This is aihu's answer to Vue composables; the
 * mechanism already exists (setup runs the @state body), and this locks it as a
 * supported, tested contract.
 */
import { branch, leaf, mount } from '@aihu/arbor'
import { createContext, inject, provide } from '@aihu/context'
import { signal } from '@aihu/signals'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  _setMount,
  _setSignal,
  defineComponent,
  _onCleanup as onCleanup,
  _onMount as onMount,
} from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'

beforeAll(() => {
  _setMount(mount)
  _setSignal(signal)
})

const Api = createContext<{ base: string }>({ base: '/default' })

// A composable: signals + lifecycle + inject, extracted for reuse. Exactly what
// an author would put in `src/composables/use-counter.ts` and call from @state.
function useCounter(start: number) {
  const [count, setCount] = signal(start)
  let mounted = false
  let cleaned = false
  onMount(() => {
    mounted = true
  })
  onCleanup(() => {
    cleaned = true
  })
  const api = inject(Api) // reads the ancestor-provided value, or the default
  return {
    count,
    inc: () => setCount(count() + 1),
    base: api?.base,
    _flags: () => ({ mounted, cleaned }),
  }
}

describe('composable contract (function called from setup)', () => {
  it('signals + lifecycle + inject all work inside a composable', () => {
    let seen: ReturnType<typeof useCounter> | undefined
    const Cmp = defineComponent(() => {
      seen = useCounter(10)
      return branch('span', undefined, [leaf(String(seen.count()))])
    })
    defineElement('x-use-counter', Cmp)

    // Wrap in a provider so inject resolves a non-default value.
    const Provider = defineComponent(() => {
      provide(Api, { base: '/v1' })
      return branch('x-use-counter', undefined, [])
    })
    defineElement('x-counter-host', Provider)

    const host = document.createElement('x-counter-host')
    document.body.appendChild(host)

    expect(seen).toBeDefined()
    // signal from the composable
    expect(seen!.count()).toBe(10)
    seen!.inc()
    expect(seen!.count()).toBe(11)
    // onMount fired (bound to THIS component)
    expect(seen!._flags().mounted).toBe(true)
    expect(seen!._flags().cleaned).toBe(false)
    // inject resolved the ancestor's provide (not the default)
    expect(seen!.base).toBe('/v1')

    // onCleanup fires on disconnect
    host.remove()
    expect(seen!._flags().cleaned).toBe(true)
  })

  it('falls back to the context default when no ancestor provides', () => {
    let seen: ReturnType<typeof useCounter> | undefined
    const Cmp = defineComponent(() => {
      seen = useCounter(0)
      return branch('span', undefined, [leaf('x')])
    })
    defineElement('x-use-counter-bare', Cmp)
    const el = document.createElement('x-use-counter-bare')
    document.body.appendChild(el)
    expect(seen!.base).toBe('/default')
    el.remove()
  })
})
