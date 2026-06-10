/**
 * switch keyboard tests (jsdom): Space AND Enter both toggle (APG Switch —
 * unlike checkbox), disabled suppression (own + inherited), and the
 * checked-change event contract.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineFormControl } from '../form-control/index.ts'
import { type AihuSwitchRoot, defineSwitch } from './index.ts'

defineSwitch()
defineFormControl()

function press(el: Element, key: string): boolean {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('AihuSwitchRoot — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Space toggles and prevents default', () => {
    document.body.innerHTML = '<aihu-switch-root aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    const prevented = press(sw, ' ')
    expect(prevented).toBe(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('Enter ALSO toggles (APG Switch — unlike checkbox)', () => {
    document.body.innerHTML = '<aihu-switch-root aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    const prevented = press(sw, 'Enter')
    expect(prevented).toBe(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    press(sw, 'Enter')
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('click toggles and emits checked-change with a boolean detail', () => {
    document.body.innerHTML = '<aihu-switch-root aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    const seen: boolean[] = []
    sw.addEventListener('checked-change', (ev) => {
      seen.push((ev as CustomEvent<{ checked: boolean }>).detail.checked)
    })
    sw.click()
    sw.click()
    expect(seen).toEqual([true, false])
  })

  it('own disabled suppresses activation and stamps data-disabled', () => {
    document.body.innerHTML = '<aihu-switch-root disabled aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    expect(sw.hasAttribute('data-disabled')).toBe(true)
    let changes = 0
    sw.addEventListener('checked-change', () => changes++)
    sw.click()
    press(sw, ' ')
    press(sw, 'Enter')
    expect(changes).toBe(0)
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('inherits disabled from a disabled form-control ancestor', () => {
    document.body.innerHTML = `
      <aihu-form-control disabled>
        <aihu-switch-root aria-label="Notify"></aihu-switch-root>
      </aihu-form-control>`
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    expect(sw.hasAttribute('data-disabled')).toBe(true)
    sw.click()
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('programmatic setChecked does NOT emit checked-change (user-driven only)', () => {
    document.body.innerHTML = '<aihu-switch-root aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    let changes = 0
    sw.addEventListener('checked-change', () => changes++)
    sw.setChecked(true)
    sw.removeAttribute('checked')
    expect(changes).toBe(0)
  })
})
