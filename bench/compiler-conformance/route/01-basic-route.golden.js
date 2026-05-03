import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'


defineElement('01-basic-route', defineComponent((_ctx) => {
  return branch('div', { class: 'users' }, [leaf('Users')])
}))
