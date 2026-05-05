import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  '01-basic-route',
  defineComponent((_ctx) => {
    return branch('div', { class: 'users' }, [leaf('Users')])
  }),
)
