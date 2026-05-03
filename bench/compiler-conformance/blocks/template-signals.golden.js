import { branch, leaf, slot } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('template-signals', defineComponent((_ctx) => {
  const [msg, setMsg] = signal('hello')
  const [count, setCount] = signal(0)

  return branch('div', undefined, [
    branch('span', undefined, [leaf([msg, setMsg] as unknown as Signal<string>)]),
    branch('button', { onclick: 'handleClick' }, [leaf('Count:'), leaf([count, setCount] as unknown as Signal<string>)])
  ])
}))
