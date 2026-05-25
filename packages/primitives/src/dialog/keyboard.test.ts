/**
 * dialog keyboard tests (jsdom): open via trigger focuses content, Tab cycles
 * and wraps, Shift+Tab reverse-wraps, Escape closes, close returns focus.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuDialogRoot, defineDialog } from './index.ts'

defineDialog()

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
})
