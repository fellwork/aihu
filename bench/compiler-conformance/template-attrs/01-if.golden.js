// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot, when } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createIfBoundary = (cond, grow) => when(cond, grow);

defineElement('01-if', defineComponent((_ctx) => {
  return     createIfBoundary([() => (isVisible)], () => { return branch('div', undefined, [
    branch('p', undefined, [leaf('visible content')])
  ]) })
}))
