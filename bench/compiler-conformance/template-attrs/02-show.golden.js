// @aihu:extract read=agents call=anonymous
// R3 (Director r6 §3.R3): $show={count > 0} → effect(() => { el.toggleAttribute('hidden', !(count > 0)) })
// `hidden` is the platform attribute (WHATWG); userland CSS [hidden] { display: none !important }
// applies. Shadow DOM consumers can override via :host([hidden]) { display: ... }.
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  'test-comp',
  defineComponent((_ctx) => {
    return effect(() => {
      el.toggleAttribute('hidden', !(count > 0))
    })
  }),
)
