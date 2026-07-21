// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { batch } from '@aihu/signals'
import { defineComponent, defineElement, onMount, onCleanup } from '@aihu/runtime'

defineElement('03-state-lifecycle', defineComponent((_ctx) => {
  onMount(() => { initializeWidget() });
  onCleanup(() => { cleanup() });
  function submit(data) { return batch(() => { sendForm(data) }) }
  return branch('div', undefined, [leaf('widget')])
}))
