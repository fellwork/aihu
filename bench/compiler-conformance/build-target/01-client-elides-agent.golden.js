// [client build] @agent block elided
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement(
  '01-client-elides-agent',
  defineComponent((_ctx) => {
    return branch('div', undefined, [leaf('Hello ')])
  }),
)
