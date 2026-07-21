// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __style__ = new CSSStyleSheet();
__style__.replaceSync(`.card { padding: 1rem; border: 1px solid #ccc; }`);
defineElement('style-scoped', defineComponent((ctx) => {
  (ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
  return branch('div', { class: 'card' }, [leaf('hello')])
}))
