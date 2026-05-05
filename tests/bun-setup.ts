import { JSDOM } from 'jsdom'

if (typeof window === 'undefined') {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://aihu.test/',
  })

  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    customElements: window.customElements,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    ShadowRoot: window.ShadowRoot,
    DocumentFragment: window.DocumentFragment,
    SVGElement: window.SVGElement,
    Text: window.Text,
    Comment: window.Comment,
  })
}
