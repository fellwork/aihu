// $once → createOnceBoundary(() => { return <subtree> })
// $memo={[count, name]} → createMemoBoundary([count, name], () => { return <subtree> })
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return branch('div', undefined, [
      createOnceBoundary(() => {
        return branch('header', undefined, [branch('h1', undefined, [leaf('Static Header')])])
      }),
      createMemoBoundary([count, name], () => {
        return branch('section', undefined, [branch('p', undefined, [leaf('memoized')])])
      }),
    ])
  }),
)
