// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { effect } from '@aihu/signals'
import { defineComponent, defineElement, createResource } from '@aihu/runtime'

defineElement('02-state-resource-effect', defineComponent((_ctx) => {
  const data = createResource(() => fetchUsers());
  effect(() => { console.log(data()) });
  effect(() => { data; updateList(data()) });
  return branch('div', undefined, [leaf('content')])
}))
