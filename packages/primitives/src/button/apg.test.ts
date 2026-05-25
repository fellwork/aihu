/**
 * WAI-ARIA APG **Button** conformance test (jsdom). Asserts the contract from
 * https://www.w3.org/WAI/ARIA/apg/patterns/button/ :
 *   - role=button + Enter/Space activation on a non-native host
 *   - toggle buttons expose aria-pressed and flip it on activation
 *   - disabled handling (aria-disabled + suppressed activation)
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuButton, defineButton } from './index.ts'

defineButton('apg-button')
defineButton('apg-toggle')

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('APG conformance — Button', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('a non-native button host has role=button and is keyboard-operable', () => {
    document.body.innerHTML = '<apg-button>Action</apg-button>'
    const b = document.querySelector('apg-button') as AihuButton
    expect(b.getAttribute('role')).toBe('button')
    expect(b.getAttribute('tabindex')).toBe('0')

    let activations = 0
    b.addEventListener('click', () => activations++)
    press(b, 'Enter') // APG: Enter activates
    press(b, ' ') // APG: Space activates
    expect(activations).toBe(2)
  })

  it('a toggle button exposes aria-pressed and toggles it on activation', () => {
    document.body.innerHTML = '<apg-toggle pressed="false">Toggle</apg-toggle>'
    const b = document.querySelector('apg-toggle') as AihuButton
    expect(b.getAttribute('aria-pressed')).toBe('false')
    press(b, 'Enter')
    expect(b.getAttribute('aria-pressed')).toBe('true')
  })

  it('a disabled button advertises aria-disabled and does not activate', () => {
    document.body.innerHTML = '<apg-button disabled>Action</apg-button>'
    const b = document.querySelector('apg-button') as AihuButton
    expect(b.getAttribute('aria-disabled')).toBe('true')
    let activations = 0
    b.addEventListener('click', () => activations++)
    press(b, 'Enter')
    press(b, ' ')
    b.click()
    expect(activations).toBe(0)
  })
})
