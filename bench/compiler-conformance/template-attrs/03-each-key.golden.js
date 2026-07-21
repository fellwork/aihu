// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot, each } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createEachBoundary = (items, key, itemFn) => each(items, key, itemFn);

defineElement('03-each-key', defineComponent((_ctx) => {
  return     createEachBoundary([() => (items)], (item) => getKey, (item, i) => { return branch('ul', undefined, [
    branch('li', undefined, [leaf('item')])
  ]) })
}))
