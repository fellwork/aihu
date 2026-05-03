// <$suspense source="dataPromise"> → createSuspenseBoundary(promiseSource, fallbackFn, loadedFn)
// Fallback subtree from <$slot name="fallback">; loaded subtree = remaining children.
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('02-suspense', defineComponent((_ctx) => {
  return createSuspenseBoundary('dataPromise', () => { return branch('span', undefined, [leaf('Loading...')]) }, () => { return branch('p', undefined, [leaf('Loaded content')]) })
}))
