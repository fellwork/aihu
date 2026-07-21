// @aihu:extract read=agents call=anonymous
// $if="isVisible" → createIfBoundary(isVisible, () => { return <subtree> })
// The compiler wraps the element subtree in a conditional boundary.
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return createIfBoundary(isVisible, () => {
      return branch('div', undefined, [branch('p', undefined, [leaf('visible content')])])
    })
  }),
)
