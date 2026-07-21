// @aihu:extract read=agents call=anonymous
// <$suspense source="dataPromise"> → createSuspenseBoundary(promiseSource, fallbackFn, loadedFn)
// Fallback subtree from <$slot name="fallback">; loaded subtree = remaining children.
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  '02-suspense',
  defineComponent((_ctx) => {
    return createSuspenseBoundary(
      'dataPromise',
      () => {
        return branch('span', undefined, [leaf('Loading...')])
      },
      () => {
        return branch('p', undefined, [leaf('Loaded content')])
      },
    )
  }),
)
