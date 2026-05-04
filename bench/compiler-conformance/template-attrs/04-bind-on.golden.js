// $bind:title → title: pageTitle in attrs object
// $on:click → onClick: handleClick in attrs object
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return branch('div', { title: pageTitle, onClick: handleClick }, [leaf('click me')])
  }),
)
