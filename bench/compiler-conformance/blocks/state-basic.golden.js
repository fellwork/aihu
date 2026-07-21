// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('state-basic', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)

  return branch('div', undefined, [leaf([count, setCount] as unknown as Signal<string>)])
}))
