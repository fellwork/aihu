// <$shield> → createShieldBoundary(mainFn, (shield) => fallbackFn)
// shield.error = thrown value; shield.retry = remount function (available in fallback).
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('03-shield', defineComponent((_ctx) => {
  return createShieldBoundary(() => { return branch('p', undefined, [leaf('Protected content')]) }, (shield) => { return branch('span', undefined, [leaf('Error occurred')]) })
}))
