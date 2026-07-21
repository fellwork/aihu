// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createSlotBoundary = (o, b) => slot(o?.name ?? undefined);

defineElement('01-slot', defineComponent((_ctx) => {
  return branch('div', undefined, [createSlotBoundary({ expose: ['user', 'index'] }, () => { return branch('span', undefined, [leaf('default')]) })])
}))
