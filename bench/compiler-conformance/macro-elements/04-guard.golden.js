// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createSlotBoundary = (o, b) => slot(o?.name ?? undefined);
const createGuardBoundary = (chk, b, fb) => b();

defineElement('04-guard', defineComponent((_ctx) => {
  return createGuardBoundary('isAuthed', () => { return branch('p', undefined, [leaf('Secure content')]) }, (guard) => { return branch('span', undefined, [leaf('Access denied')]) })
}))
