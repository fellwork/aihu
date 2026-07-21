// @aihu:shadow-default none
// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  '02-route-with-layout',
  defineComponent((_ctx) => {
    return branch('div', { class: 'admin-users' }, [leaf('Admin Users')])
  }),
)
