/**
 * Unit tests for `defineElement` per
 * `.team/phase-4/spec-runtime.md` §4 Task 21.
 *
 * JSDOM has no `customElements.undefine`. Each test uses a unique tag
 * name (`x-tN`) to avoid SCR-R0001 false positives between tests.
 */

import { describe, expect, it, vi } from 'vitest'
import { defineElement } from '../src/define-element.ts'
import { RuntimeError } from '../src/types.ts'

describe('defineElement — Task 21 spec tests', () => {
  it('registers the name in customElements (#1)', () => {
    class T1 extends HTMLElement {}
    defineElement('x-t1', T1)
    expect(customElements.get('x-t1')).toBeDefined()
  })

  it('connectedCallback fires on DOM attach (#2)', () => {
    const spy = vi.fn()
    class T2 extends HTMLElement {
      connectedCallback() {
        spy()
      }
    }
    defineElement('x-t2', T2)
    const el = document.createElement('x-t2')
    document.body.appendChild(el)
    expect(spy).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('attaches an open shadow root by default (#3)', () => {
    class T3 extends HTMLElement {}
    defineElement('x-t3', T3)
    const el = document.createElement('x-t3')
    document.body.appendChild(el)
    expect(el.shadowRoot).toBeInstanceOf(ShadowRoot)
    expect(el.shadowRoot?.mode).toBe('open')
    el.remove()
  })

  it('preserves static observedAttributes on the wrapped class (#4)', () => {
    class T4 extends HTMLElement {
      static observedAttributes = ['color', 'size']
    }
    defineElement('x-t4', T4)
    const Wrapped = customElements.get('x-t4') as typeof HTMLElement & {
      observedAttributes?: readonly string[]
    }
    expect(Wrapped.observedAttributes).toEqual(['color', 'size'])
  })

  it('attributeChangedCallback fires on observed attribute set (#5)', () => {
    const spy = vi.fn()
    class T5 extends HTMLElement {
      static observedAttributes = ['color']
      attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        spy(name, oldValue, newValue)
      }
    }
    defineElement('x-t5', T5)
    const el = document.createElement('x-t5')
    document.body.appendChild(el)
    el.setAttribute('color', 'red')
    expect(spy).toHaveBeenCalledWith('color', null, 'red')
    el.remove()
  })

  it('disconnectedCallback fires on DOM removal (#6)', () => {
    const spy = vi.fn()
    class T6 extends HTMLElement {
      disconnectedCallback() {
        spy()
      }
    }
    defineElement('x-t6', T6)
    const el = document.createElement('x-t6')
    document.body.appendChild(el)
    el.remove()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('double-registration throws RuntimeError with code SCR-R0001 (#7)', () => {
    class T7a extends HTMLElement {}
    class T7b extends HTMLElement {}
    defineElement('x-t7', T7a)
    let caught: unknown = null
    try {
      defineElement('x-t7', T7b)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(RuntimeError)
    expect((caught as RuntimeError).code).toBe('SCR-R0001')
  })

  it("shadowMode: 'none' skips shadow root attachment (#8)", () => {
    class T8 extends HTMLElement {}
    defineElement('x-t8', T8, { shadowMode: 'none' })
    const el = document.createElement('x-t8')
    document.body.appendChild(el)
    expect(el.shadowRoot).toBeNull()
    el.remove()
  })

  it('two separately-defined elements have independent shadow roots (#9)', () => {
    class T9a extends HTMLElement {}
    class T9b extends HTMLElement {}
    defineElement('x-t9a', T9a)
    defineElement('x-t9b', T9b)
    const a = document.createElement('x-t9a')
    const b = document.createElement('x-t9b')
    document.body.appendChild(a)
    document.body.appendChild(b)
    expect(a.shadowRoot).not.toBe(b.shadowRoot)
    a.shadowRoot?.appendChild(document.createElement('span'))
    expect(b.shadowRoot?.childNodes.length).toBe(0)
    a.remove()
    b.remove()
  })

  it("shadowMode: 'closed' does not throw at registration time (#10 smoke)", () => {
    class T10 extends HTMLElement {}
    expect(() => defineElement('x-t10', T10, { shadowMode: 'closed' })).not.toThrow()
    const el = document.createElement('x-t10')
    document.body.appendChild(el)
    // Closed mode: this.shadowRoot is null externally (browser behavior).
    expect(el.shadowRoot).toBeNull()
    el.remove()
  })
})
