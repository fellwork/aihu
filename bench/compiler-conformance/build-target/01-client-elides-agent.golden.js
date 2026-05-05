// [client build] @agent block elided
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  '01-client-elides-agent',
  defineComponent((_ctx) => {
    return branch('div', undefined, [leaf('Hello ')])
  }),
)
