import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement(
  '02-route-with-layout',
  defineComponent((_ctx) => {
    return branch('div', { class: 'admin-users' }, [leaf('Admin Users')])
  }),
)
