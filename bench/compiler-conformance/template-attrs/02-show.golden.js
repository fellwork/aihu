// $show={count > 0} → effect(() => { el.style.setProperty('--show', (count > 0) ? '1' : '0') })
import { branch, leaf, slot } from '@scribe/arbor'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return effect(() => {
      el.style.setProperty('--show', count > 0 ? '1' : '0')
    })
  }),
)
