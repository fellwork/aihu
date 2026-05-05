// $each="items" $key="getKey" → createEachBoundary(items, getKey, (item, i) => { return <subtree> })
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return createEachBoundary(items, getKey, (item, i) => {
      return branch('ul', undefined, [branch('li', undefined, [leaf('item')])])
    })
  }),
)
