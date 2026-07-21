// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createSlotBoundary = (o, b) => slot(o?.name ?? undefined);
const createShieldBoundary = (b, fb) => { try { return b() } catch(e) { return fb({error: e, retry: () => {}}) } };

defineElement('03-shield', defineComponent((_ctx) => {
  return createShieldBoundary(() => { return branch('p', undefined, [leaf('Protected content')]) }, (shield) => { return branch('span', undefined, [leaf('Error occurred')]) })
}))
