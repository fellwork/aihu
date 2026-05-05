// $show={count > 0} → effect(() => { el.style.setProperty('--show', (count > 0) ? '1' : '0') })
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return effect(() => {
      el.style.setProperty('--show', count > 0 ? '1' : '0')
    })
  }),
)
