/**
 * popover keyboard + pointer-dismissal tests (jsdom): trigger click toggles,
 * Enter/Space activate the trigger, Escape closes AND returns focus to
 * the trigger, an outside pointerdown closes WITHOUT stealing focus back, and
 * the document-level outside listener is bound/unbound with `open` (no leak).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AihuPopoverRoot, definePopover } from './index.ts'

definePopover()

interface Parts {
  root: AihuPopoverRoot
  trigger: HTMLElement
  content: HTMLElement
  inner: HTMLButtonElement
  outside: HTMLButtonElement
}

function build(): Parts {
  document.body.innerHTML = `
    <button id="outside">elsewhere</button>
    <aihu-popover-root>
      <aihu-popover-trigger id="trg">Open</aihu-popover-trigger>
      <aihu-popover-content><button id="inner">act</button></aihu-popover-content>
    </aihu-popover-root>`
  return {
    root: document.querySelector('aihu-popover-root') as AihuPopoverRoot,
    trigger: document.getElementById('trg') as HTMLElement,
    content: document.querySelector('aihu-popover-content') as HTMLElement,
    inner: document.getElementById('inner') as HTMLButtonElement,
    outside: document.getElementById('outside') as HTMLButtonElement,
  }
}

function press(el: Element, key: string): boolean {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

function pointerDown(el: Element): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
}

describe('popover — keyboard & dismissal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicking the trigger toggles open, then closed', () => {
    const { root, trigger } = build()
    expect(root.open()).toBe(false)
    trigger.click()
    expect(root.open()).toBe(true)
    trigger.click()
    expect(root.open()).toBe(false)
  })

  it('Enter activates the trigger and prevents default', () => {
    const { root, trigger } = build()
    expect(press(trigger, 'Enter')).toBe(true)
    expect(root.open()).toBe(true)
  })

  it('Space activates the trigger and prevents default (no page scroll)', () => {
    const { root, trigger } = build()
    expect(press(trigger, ' ')).toBe(true)
    expect(root.open()).toBe(true)
  })

  it('a native <button> NESTED in the trigger does not double-toggle on Enter', () => {
    document.body.innerHTML = `
      <aihu-popover-root>
        <aihu-popover-trigger id="trg"><button id="nested">Open</button></aihu-popover-trigger>
        <aihu-popover-content>panel</aihu-popover-content>
      </aihu-popover-root>`
    const root = document.querySelector('aihu-popover-root') as AihuPopoverRoot
    const nested = document.getElementById('nested') as HTMLButtonElement
    // The platform synthesizes a click from Enter on the nested button; that
    // click bubbles to the trigger and toggles ONCE. The bubbled keydown must
    // not toggle a second time (which would land back on closed).
    press(nested, 'Enter')
    nested.click() // stands in for the platform-synthesized click (jsdom omits it)
    expect(root.open()).toBe(true)
  })

  it('a disabled trigger does not open, click or key', () => {
    document.body.innerHTML = `
      <aihu-popover-root>
        <aihu-popover-trigger id="trg" disabled>Open</aihu-popover-trigger>
        <aihu-popover-content>panel</aihu-popover-content>
      </aihu-popover-root>`
    const root = document.querySelector('aihu-popover-root') as AihuPopoverRoot
    const trigger = document.getElementById('trg') as HTMLElement
    expect(trigger.getAttribute('aria-disabled')).toBe('true')
    let changes = 0
    root.addEventListener('open-change', () => changes++)
    trigger.click()
    expect(press(trigger, 'Enter')).toBe(false)
    expect(root.open()).toBe(false)
    expect(changes).toBe(0)
  })

  it('Escape on the content closes the popover AND returns focus to the trigger', () => {
    const { root, trigger, content, inner } = build()
    trigger.focus()
    trigger.click()
    inner.focus()
    expect(document.activeElement).toBe(inner)
    press(content, 'Escape')
    expect(root.open()).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape on the trigger closes the popover', () => {
    const { root, trigger } = build()
    trigger.click()
    press(trigger, 'Escape')
    expect(root.open()).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('data-dismissable-escape="false" opts the content out of Escape dismissal', () => {
    const { root, trigger, content } = build()
    content.setAttribute('data-dismissable-escape', 'false')
    trigger.click()
    press(content, 'Escape')
    expect(root.open()).toBe(true)
  })

  it('a pointerdown outside both trigger and content closes the popover', () => {
    const { root, trigger, outside } = build()
    trigger.click()
    expect(root.open()).toBe(true)
    pointerDown(outside)
    expect(root.open()).toBe(false)
  })

  it('outside dismissal does NOT steal focus back to the trigger', () => {
    const { root, trigger, outside } = build()
    trigger.click()
    outside.focus()
    pointerDown(outside)
    expect(root.open()).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('a pointerdown INSIDE the content leaves the popover open', () => {
    const { root, trigger, inner } = build()
    trigger.click()
    pointerDown(inner)
    expect(root.open()).toBe(true)
  })

  it('a pointerdown on the trigger does not double-close (the click toggles)', () => {
    const { root, trigger } = build()
    trigger.click()
    pointerDown(trigger)
    expect(root.open()).toBe(true)
    trigger.click()
    expect(root.open()).toBe(false)
  })

  it('outside dismissal emits open-change exactly once', () => {
    const { root, trigger, outside } = build()
    const seen: boolean[] = []
    root.addEventListener('open-change', (ev) => {
      seen.push((ev as CustomEvent<{ open: boolean }>).detail.open)
    })
    trigger.click()
    pointerDown(outside)
    expect(seen).toEqual([true, false])
  })

  it('the document-level outside listener is bound only while open, and removed on disconnect', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const { root, trigger } = build()
    const countAdds = (): number => add.mock.calls.filter(([type]) => type === 'pointerdown').length
    const countRemoves = (): number =>
      remove.mock.calls.filter(([type]) => type === 'pointerdown').length

    expect(countAdds()).toBe(0)
    trigger.click()
    expect(countAdds()).toBe(1)
    trigger.click()
    expect(countRemoves()).toBe(1)
    // Re-open, then tear the root out of the document: the listener must go.
    trigger.click()
    expect(countAdds()).toBe(2)
    root.remove()
    expect(countRemoves()).toBe(2)
    add.mockRestore()
    remove.mockRestore()
  })
})
