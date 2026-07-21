// @aihu:extract read=agents call=anonymous
// <$shield> → createShieldBoundary(mainFn, (shield) => fallbackFn)
// shield.error = thrown value; shield.retry = remount function (available in fallback).
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  '03-shield',
  defineComponent((_ctx) => {
    return createShieldBoundary(
      () => {
        return branch('p', undefined, [leaf('Protected content')])
      },
      (shield) => {
        return branch('span', undefined, [leaf('Error occurred')])
      },
    )
  }),
)
