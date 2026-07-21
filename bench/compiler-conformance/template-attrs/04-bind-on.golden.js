// @aihu:extract read=agents call=anonymous
// $bind:title → title: pageTitle in attrs object
// $on:click → onClick: handleClick in attrs object
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return branch('div', { title: pageTitle, onClick: handleClick }, [leaf('click me')])
  }),
)
