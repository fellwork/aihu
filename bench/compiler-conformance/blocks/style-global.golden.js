// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __style__ = new CSSStyleSheet();
__style__.replaceSync(`body { margin: 0; font-family: sans-serif; }`);
defineElement('style-global', defineComponent((ctx) => {
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, __style__];
  return branch('div', undefined, [leaf('hello')])
}))
