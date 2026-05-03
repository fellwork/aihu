// <$slot expose="user, index"> → createSlotBoundary({ expose: ['user', 'index'] }, childFn)
// Exposes named context identifiers to slot consumers.
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('01-slot', defineComponent((_ctx) => {
  return branch('div', undefined, [createSlotBoundary({ expose: ['user', 'index'] }, () => { return branch('span', undefined, [leaf('default')]) })])
}))
