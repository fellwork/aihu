// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createSlotBoundary = (o, b) => slot(o?.name ?? undefined);
const createSuspenseBoundary = (src, b, fb) => b();

defineElement('02-suspense', defineComponent((_ctx) => {
  return createSuspenseBoundary('dataPromise', () => { return branch('span', undefined, [leaf('Loading...')]) }, () => { return branch('p', undefined, [leaf('Loaded content')]) })
}))
