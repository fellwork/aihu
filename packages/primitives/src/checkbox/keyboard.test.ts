/**
 * checkbox keyboard tests (jsdom): Space toggles, Enter explicitly does NOT
 * (APG/Radix), disabled suppression (own + inherited via form-control), and
 * the checked-change event contract.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineFormControl } from '../form-control/index.ts'
import { type AihuCheckboxRoot, defineCheckbox } from './index.ts'

defineCheckbox()
defineFormControl()

function press(el: Element, key: string): boolean {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('AihuCheckboxRoot — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Space toggles and prevents default (no page scroll)', () => {
    document.body.innerHTML = '<aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.getAttribute('aria-checked')).toBe('false')
    const prevented = press(box, ' ')
    expect(prevented).toBe(true)
    expect(box.getAttribute('aria-checked')).toBe('true')
    press(box, ' ')
    expect(box.getAttribute('aria-checked')).toBe('false')
  })

  it('Enter is preventDefaulted and does NOT activate (APG/Radix)', () => {
    document.body.innerHTML = '<aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    const prevented = press(box, 'Enter')
    expect(prevented).toBe(true)
    expect(box.getAttribute('aria-checked')).toBe('false')
    expect(box.state()).toBe('unchecked')
  })

  it('click toggles and emits checked-change with detail', () => {
    document.body.innerHTML = '<aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    const seen: Array<boolean | 'mixed'> = []
    box.addEventListener('checked-change', (ev) => {
      seen.push((ev as CustomEvent<{ checked: boolean | 'mixed' }>).detail.checked)
    })
    box.click()
    box.click()
    expect(seen).toEqual([true, false])
  })

  it('own disabled suppresses activation and stamps data-disabled', () => {
    document.body.innerHTML =
      '<aihu-checkbox-root disabled aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.hasAttribute('data-disabled')).toBe(true)
    let changes = 0
    box.addEventListener('checked-change', () => changes++)
    box.click()
    press(box, ' ')
    expect(changes).toBe(0)
    expect(box.getAttribute('aria-checked')).toBe('false')
  })

  it('inherits disabled from a disabled form-control ancestor', () => {
    document.body.innerHTML = `
      <aihu-form-control disabled>
        <aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>
      </aihu-form-control>`
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.hasAttribute('data-disabled')).toBe(true)
    let changes = 0
    box.addEventListener('checked-change', () => changes++)
    box.click()
    expect(changes).toBe(0)
    expect(box.getAttribute('aria-checked')).toBe('false')
  })

  it('programmatic setChecked does NOT emit checked-change (user-driven only)', () => {
    document.body.innerHTML = '<aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    let changes = 0
    box.addEventListener('checked-change', () => changes++)
    box.setChecked(true)
    box.setAttribute('checked', 'mixed')
    expect(changes).toBe(0)
  })
})
