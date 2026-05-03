// <$guard check="isAuthed"> → createGuardBoundary(checkExpr, mainFn, (guard) => fallbackFn)
// guard.user, guard.reason, guard.path available in fallback subtree.
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('04-guard', defineComponent((_ctx) => {
  return createGuardBoundary('isAuthed', () => { return branch('p', undefined, [leaf('Secure content')]) }, (guard) => { return branch('span', undefined, [leaf('Access denied')]) })
}))
