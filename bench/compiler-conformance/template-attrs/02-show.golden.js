// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { effect } from '@aihu/signals'
import { defineComponent, defineElement, onMount } from '@aihu/runtime'

defineElement('02-show', defineComponent((_ctx) => {
  return     (() => { const _n = branch('span', undefined, [leaf('items')]); onMount(() => { const _el = _n && _n.el; if (!_el) return () => {}; const _s = effect(() => { _el.toggleAttribute('hidden', !(count > 0)) }); return () => { _s && _s(); }; }); return _n; })()
}))
