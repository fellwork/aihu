import { branch, leaf, slot } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('state-basic', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)

  return branch('div', undefined, [leaf([count, setCount] as unknown as Signal<string>)])
}))
