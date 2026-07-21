// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal, computed } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('01-state-prop-computed', defineComponent({
  props: {
    label: { value: '' }
  },
  setup: (ctx) => {
  const label = ctx.props.label

  const upper = computed(() => label.toUpperCase());
  return branch('div', undefined, [leaf('label')])
  },
}))
