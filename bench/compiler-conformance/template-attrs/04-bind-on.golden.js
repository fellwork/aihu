// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __aihu_conv = (cur, raw) => { if (typeof cur === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : cur; } if (typeof cur === 'boolean') return raw === 'true'; return raw; };

defineElement('04-bind-on', defineComponent((_ctx) => {
  return branch('div', { title: pageTitle, onClick: handleClick }, [leaf('click me')])
}))
