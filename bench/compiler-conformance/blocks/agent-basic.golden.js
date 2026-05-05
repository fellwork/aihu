import { branch, leaf, slot } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('agent-basic', defineComponent({
  attrs: ['name'] as const,
  setup(ctx) {
    const [name] = ctx.attrs.name

    const [greeting, setGreeting] = signal('')
    return branch('div', undefined, [leaf([greeting, setGreeting] as unknown as Signal<string>)])
  }
}))
