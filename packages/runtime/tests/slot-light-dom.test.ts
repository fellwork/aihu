/**
 * Bug D — light-DOM <$slot> projection under `shadowMode: 'none'`.
 *
 * Spec (investigation §8 + Architect brief): when a custom element is
 * registered with `shadowMode: 'none'` the browser does NOT run native
 * <slot> projection; the compiler still emits a real <slot> DOM element
 * from `<$slot>`. Pre-fix, the layout's template was appended AFTER the
 * page's light-DOM children, producing the wrong order; the <slot>
 * placeholder was inert.
 *
 * Post-fix, defineComponent.connectedCallback:
 *   1. Carves `this.childNodes` into a buffer.
 *   2. Lets _build/_mount run on an empty host.
 *   3. Finds the first default <slot> in the host and replaces it with
 *      the buffered children. If no slot is present, reattaches the
 *      children to the host as a graceful fallback.
 *
 * The Shadow-DOM path MUST remain untouched (regression guard below).
 *
 * Named slots (`<slot name="foo">`) + default fallback content
 * (`<slot>fallback</slot>`) are explicitly OUT OF SCOPE for this fix —
 * flagged as TODO(architect) in `define-component.ts`.
 */

import { branch, leaf, mount, slot } from '@aihu/arbor'
import { describe, expect, it } from 'vitest'
import { _setMount, defineComponent } from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'

_setMount(mount)

describe('Bug D — light-DOM <$slot> projection (shadowMode: "none")', () => {
  it('projects light-DOM children at the <slot> position', () => {
    const Cmp = defineComponent(() =>
      branch('div', { class: 'layout' }, [leaf.element('nav', undefined), slot()]),
    )
    defineElement('x-bugd-light-1', Cmp, { shadowMode: 'none' })

    const host = document.createElement('x-bugd-light-1')
    host.innerHTML = '<h1>Waves</h1><p>p</p>'
    document.body.appendChild(host)

    // Host has the layout div as its sole child; div has [nav, h1, p] in
    // that order (slot replaced by the page's children).
    expect(host.children.length).toBe(1)
    const div = host.firstElementChild as HTMLElement
    expect(div.tagName).toBe('DIV')
    expect(div.getAttribute('class')).toBe('layout')
    expect([...div.children].map((c) => c.tagName)).toEqual(['NAV', 'H1', 'P'])
    // The inert <slot> placeholder must be gone.
    expect(div.querySelector('slot')).toBeNull()

    host.remove()
  })

  it('preserves text nodes among the projected children', () => {
    const Cmp = defineComponent(() => branch('section', undefined, [slot()]))
    defineElement('x-bugd-light-2', Cmp, { shadowMode: 'none' })

    const host = document.createElement('x-bugd-light-2')
    // Mix element + text nodes — childNodes (not children) must be carved.
    host.append('hello ', document.createElement('em'), ' world')
    ;(host.querySelector('em') as HTMLElement).textContent = 'bold'
    document.body.appendChild(host)

    const section = host.firstElementChild as HTMLElement
    expect(section.tagName).toBe('SECTION')
    // Text node + element + text node landed where the <slot> was.
    expect(section.childNodes.length).toBe(3)
    expect(section.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE)
    expect(section.childNodes[0]?.nodeValue).toBe('hello ')
    expect((section.childNodes[1] as HTMLElement).tagName).toBe('EM')
    expect(section.childNodes[2]?.nodeValue).toBe(' world')

    host.remove()
  })

  it('regression: shadow-DOM path is unchanged (browser handles slot natively)', () => {
    const Cmp = defineComponent(() =>
      branch('div', { class: 'layout' }, [leaf.element('nav', undefined), slot()]),
    )
    defineElement('x-bugd-shadow-1', Cmp, { shadowMode: 'open' })

    const host = document.createElement('x-bugd-shadow-1')
    host.innerHTML = '<h1>Waves</h1><p>p</p>'
    document.body.appendChild(host)

    // Shadow-mode: light-DOM children remain on the host element itself;
    // the layout template lives in the shadow root with the native <slot>
    // placeholder still present (the browser composes the tree at render
    // time — there is no carve-and-reinsert).
    expect([...host.children].map((c) => c.tagName)).toEqual(['H1', 'P'])
    const shadowRoot = host.shadowRoot
    expect(shadowRoot).not.toBeNull()
    const shadowDiv = shadowRoot?.firstElementChild as HTMLElement
    expect(shadowDiv.tagName).toBe('DIV')
    // The platform <slot> is still present (jsdom does not compose, but
    // critically: the runtime fix did NOT carve under shadowMode).
    expect(shadowDiv.querySelector('slot')).not.toBeNull()
    expect([...shadowDiv.children].map((c) => c.tagName)).toEqual(['NAV', 'SLOT'])

    host.remove()
  })

  it('edge case: shadowMode "none" with no <slot> in the layout — children fall back onto the host', () => {
    // Layout has no slot — the carve-and-reinsert should append the
    // buffered children back to the host (no errors, no data loss).
    const Cmp = defineComponent(() => branch('div', { class: 'no-slot' }, []))
    defineElement('x-bugd-light-3', Cmp, { shadowMode: 'none' })

    const host = document.createElement('x-bugd-light-3')
    host.innerHTML = '<span>orphan</span>'
    document.body.appendChild(host)

    // Layout div is the first child; the orphan span trails after it on
    // the host (fallback path, preserves the child rather than dropping).
    expect(host.children.length).toBe(2)
    expect((host.children[0] as HTMLElement).tagName).toBe('DIV')
    expect((host.children[0] as HTMLElement).getAttribute('class')).toBe('no-slot')
    expect((host.children[1] as HTMLElement).tagName).toBe('SPAN')
    expect((host.children[1] as HTMLElement).textContent).toBe('orphan')

    host.remove()
  })
})
