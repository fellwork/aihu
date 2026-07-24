/**
 * dialog keyboard tests (jsdom): open via trigger focuses content, Tab cycles
 * and wraps, Shift+Tab reverse-wraps, Escape closes, close returns focus.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { composedActiveElement } from '../composed-tree.ts'
import { type AihuDialogRoot, defineDialog } from './index.ts'

defineDialog()

// A nested custom element with its OWN open shadow root, used to prove the
// focus trap's tabbable walk descends into shadow-DOM'd dialog content
// instead of stopping at `container.querySelectorAll` (which never sees past
// a shadow boundary).
class ShadowWidget extends HTMLElement {
  connectedCallback(): void {
    const root = this.attachShadow({ mode: 'open' })
    const btn = document.createElement('button')
    btn.id = 'inner-last'
    btn.textContent = 'inner'
    root.appendChild(btn)
  }
}
if (!customElements.get('shadow-widget')) customElements.define('shadow-widget', ShadowWidget)

function mountDialog(): {
  root: AihuDialogRoot
  trigger: HTMLElement
  content: HTMLElement
  first: HTMLButtonElement
  last: HTMLButtonElement
} {
  document.body.innerHTML = `
    <aihu-dialog-root modal>
      <aihu-dialog-trigger id="trg" tabindex="0">Open</aihu-dialog-trigger>
      <aihu-dialog-backdrop></aihu-dialog-backdrop>
      <aihu-dialog-content>
        <aihu-dialog-title>Title</aihu-dialog-title>
        <button id="b1">one</button>
        <button id="b2">two</button>
        <aihu-dialog-close id="cls">x</aihu-dialog-close>
      </aihu-dialog-content>
    </aihu-dialog-root>`
  const root = document.querySelector('aihu-dialog-root') as AihuDialogRoot
  return {
    root,
    trigger: document.getElementById('trg') as HTMLElement,
    content: document.querySelector('aihu-dialog-content') as HTMLElement,
    first: document.getElementById('b1') as HTMLButtonElement,
    last: document.getElementById('cls') as unknown as HTMLButtonElement,
  }
}

function tab(target: Element, shift = false): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }),
  )
  void target
}

describe('dialog — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('opening via the trigger moves focus into the content', () => {
    const { trigger, first } = mountDialog()
    trigger.focus()
    trigger.click()
    expect(document.activeElement).toBe(first)
  })

  it('Escape closes the dialog', () => {
    const { trigger, content, root } = mountDialog()
    trigger.click()
    expect(root.open()).toBe(true)
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(root.open()).toBe(false)
  })

  it('closing returns focus to the trigger that opened it', () => {
    const { trigger, content, root } = mountDialog()
    trigger.focus()
    trigger.click()
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(root.open()).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('Tab wraps from the last focusable to the first', () => {
    const { trigger, first, last } = mountDialog()
    trigger.click()
    last.focus()
    tab(last)
    expect(document.activeElement).toBe(first)
  })

  it('Shift+Tab reverse-wraps from the first to the last', () => {
    const { trigger, first, last } = mountDialog()
    trigger.click()
    first.focus()
    tab(first, true)
    expect(document.activeElement).toBe(last)
  })

  it('the close piece closes the dialog on click', () => {
    const { trigger, last, root } = mountDialog()
    trigger.click()
    expect(root.open()).toBe(true)
    ;(last as unknown as HTMLElement).click()
    expect(root.open()).toBe(false)
  })

  it('the backdrop closes a modal dialog on click', () => {
    const { trigger, root } = mountDialog()
    trigger.click()
    const backdrop = document.querySelector('aihu-dialog-backdrop') as HTMLElement
    backdrop.click()
    expect(root.open()).toBe(false)
  })

  // The known bug: `container.querySelectorAll` (native, pre-fix) never sees
  // past a shadow boundary, so a nested custom element's own focusable content
  // was invisible to the trap — the true first/last focusable was computed
  // wrong and Tab/Shift+Tab at the boundary either did nothing (escaping the
  // trap) or refocused the wrong element instead of cycling into the nested
  // shadow root. These fail against the pre-fix `querySelectorAll`-based walk.
  describe('nested shadow root inside dialog content', () => {
    function mountWithShadowWidget(): {
      trigger: HTMLElement
      content: HTMLElement
      b1: HTMLButtonElement
      innerLast: HTMLElement
    } {
      document.body.innerHTML = `
        <aihu-dialog-root modal>
          <aihu-dialog-trigger id="trg" tabindex="0">Open</aihu-dialog-trigger>
          <aihu-dialog-content>
            <aihu-dialog-title>Title</aihu-dialog-title>
            <button id="b1">one</button>
            <shadow-widget></shadow-widget>
          </aihu-dialog-content>
        </aihu-dialog-root>`
      const content = document.querySelector('aihu-dialog-content') as HTMLElement
      const widget = document.querySelector('shadow-widget') as ShadowWidget
      const innerLast = widget.shadowRoot?.getElementById('inner-last') as HTMLElement
      return {
        trigger: document.getElementById('trg') as HTMLElement,
        content,
        b1: document.getElementById('b1') as HTMLButtonElement,
        innerLast,
      }
    }

    it('Tab from the true last focusable (inside the nested shadow root) wraps to the true first, not past it', () => {
      const { trigger, b1, innerLast } = mountWithShadowWidget()
      trigger.click()
      innerLast.focus()
      expect(composedActiveElement(document)).toBe(innerLast)

      const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      document.dispatchEvent(ev)

      // Pre-fix: the trap never even saw `innerLast` as a tracked focusable
      // (querySelectorAll can't reach it), so `current` (single-hop
      // `document.activeElement`) resolved to the `<shadow-widget>` host,
      // which is neither `first` nor `last` in its (wrong) items list AND is
      // still `container.contains()`-reachable (contains() sees the host even
      // though not its shadow content) — so the handler did nothing and Tab
      // escaped the trap instead of wrapping.
      expect(ev.defaultPrevented).toBe(true)
      expect(composedActiveElement(document)).toBe(b1)
    })

    it('Shift+Tab from the true first focusable wraps INTO the nested shadow root, not back onto itself', () => {
      const { trigger, b1, innerLast } = mountWithShadowWidget()
      trigger.click()
      b1.focus()

      const ev = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(ev)

      // Pre-fix: `last` was wrongly computed as `b1` itself (the shadow
      // content was invisible to querySelectorAll), so Shift+Tab from `b1`
      // matched `current === first` and "wrapped" by refocusing `b1` again —
      // never reaching the nested shadow root at all.
      expect(ev.defaultPrevented).toBe(true)
      expect(composedActiveElement(document)).toBe(innerLast)
    })
  })
})
