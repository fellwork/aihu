/**
 * label interaction tests (jsdom): double-click mousedown prevention, click
 * forwarding (focus for text controls, click() for checkables), disabled
 * suppression, and nested-interactive-child exclusion.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuLabel, defineLabel } from './index.ts'

defineLabel()

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('<aihu-label> — interaction forwarding', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('prevents mousedown default on double-click (no text selection)', () => {
    document.body.innerHTML = '<aihu-label>Name</aihu-label>'
    const label = document.querySelector('aihu-label') as AihuLabel
    const dbl = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 })
    label.dispatchEvent(dbl)
    expect(dbl.defaultPrevented).toBe(true)

    const single = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
    label.dispatchEvent(single)
    expect(single.defaultPrevented).toBe(false)
  })

  it('click focuses a native text input resolved via `for`', () => {
    document.body.innerHTML = `
      <aihu-label for="name-input">Name</aihu-label>
      <input id="name-input" type="text" />`
    const label = document.querySelector('aihu-label') as AihuLabel
    const input = document.getElementById('name-input') as HTMLInputElement
    click(label)
    expect(document.activeElement).toBe(input)
  })

  it('click is forwarded as click() to a role=checkbox host', () => {
    document.body.innerHTML = `
      <aihu-label for="agree">Agree</aihu-label>
      <div id="agree" role="checkbox" aria-checked="false"></div>`
    const label = document.querySelector('aihu-label') as AihuLabel
    const box = document.getElementById('agree') as HTMLElement
    let clicks = 0
    box.addEventListener('click', () => clicks++)
    click(label)
    expect(clicks).toBe(1)
  })

  it('click is forwarded as click() to a native checkbox', () => {
    document.body.innerHTML = `
      <aihu-label for="opt">Opt in</aihu-label>
      <input id="opt" type="checkbox" />`
    const label = document.querySelector('aihu-label') as AihuLabel
    const box = document.getElementById('opt') as HTMLInputElement
    click(label)
    expect(box.checked).toBe(true)
  })

  it('does not forward to a disabled target', () => {
    document.body.innerHTML = `
      <aihu-label for="off">Disabled</aihu-label>
      <input id="off" type="text" disabled />
      <aihu-label for="aria-off">Aria disabled</aihu-label>
      <div id="aria-off" role="checkbox" aria-disabled="true"></div>`
    const [textLabel, ariaLabel] = Array.from(document.querySelectorAll('aihu-label'))
    const input = document.getElementById('off') as HTMLInputElement
    const box = document.getElementById('aria-off') as HTMLElement
    let clicks = 0
    box.addEventListener('click', () => clicks++)

    click(textLabel)
    expect(document.activeElement).not.toBe(input)
    click(ariaLabel)
    expect(clicks).toBe(0)
  })

  it('does not forward clicks originating on a nested interactive child', () => {
    document.body.innerHTML = `
      <aihu-label for="field">
        Name
        <button type="button">info</button>
      </aihu-label>
      <input id="field" type="text" />`
    const button = document.querySelector('button') as HTMLButtonElement
    const input = document.getElementById('field') as HTMLInputElement
    click(button) // bubbles through the label
    expect(document.activeElement).not.toBe(input)
  })

  it('re-resolves the `for` target per interaction (no stale caching)', () => {
    document.body.innerHTML = `
      <aihu-label for="a">Label</aihu-label>
      <input id="a" type="text" />
      <input id="b" type="text" />`
    const label = document.querySelector('aihu-label') as AihuLabel
    const a = document.getElementById('a') as HTMLInputElement
    const b = document.getElementById('b') as HTMLInputElement

    click(label)
    expect(document.activeElement).toBe(a)

    label.setAttribute('for', 'b')
    click(label)
    expect(document.activeElement).toBe(b)
  })
})
