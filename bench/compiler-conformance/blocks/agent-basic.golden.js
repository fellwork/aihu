import { branch, leaf, slot } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('agent-basic', defineComponent({
  attrs: ['name'] as const,
  setup(ctx) {
    const [name] = ctx.attrs.name

    const [greeting, setGreeting] = signal('')
    return branch('div', undefined, [leaf([greeting, setGreeting] as unknown as Signal<string>)])
  }
}))
