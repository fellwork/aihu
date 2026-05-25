/**
 * button keyboard tests (jsdom): Enter/Space activation on a non-native host,
 * disabled suppression, toggle aria-pressed, and FormControlContext disabled
 * inheritance.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineFormControl } from '../form-control/index.ts'
import { type AihuButton, defineButton } from './index.ts'

defineButton('test-button')
defineButton('test-toggle')
defineFormControl()

function press(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('AihuButton — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('non-native host gets role=button and tabindex=0', () => {
    document.body.innerHTML = '<test-button>Go</test-button>'
    const b = document.querySelector('test-button') as AihuButton
    expect(b.getAttribute('role')).toBe('button')
    expect(b.getAttribute('tabindex')).toBe('0')
  })

  it('Enter and Space fire a click on a non-native host', () => {
    document.body.innerHTML = '<test-button>Go</test-button>'
    const b = document.querySelector('test-button') as AihuButton
    let clicks = 0
    b.addEventListener('click', () => clicks++)
    press(b, 'Enter')
    press(b, ' ')
    expect(clicks).toBe(2)
  })

  it('disabled suppresses activation and sets aria-disabled', () => {
    document.body.innerHTML = '<test-button disabled>Go</test-button>'
    const b = document.querySelector('test-button') as AihuButton
    expect(b.getAttribute('aria-disabled')).toBe('true')
    let clicks = 0
    b.addEventListener('click', () => clicks++)
    press(b, 'Enter')
    b.click()
    expect(clicks).toBe(0)
  })

  it('toggle mode reflects aria-pressed and flips on activation', () => {
    document.body.innerHTML = '<test-toggle pressed="false">Mute</test-toggle>'
    const b = document.querySelector('test-toggle') as AihuButton
    expect(b.getAttribute('aria-pressed')).toBe('false')
    b.click()
    expect(b.getAttribute('aria-pressed')).toBe('true')
    b.click()
    expect(b.getAttribute('aria-pressed')).toBe('false')
  })

  it('inherits disabled from a disabled form-control ancestor', () => {
    document.body.innerHTML = `
      <aihu-form-control disabled>
        <test-button>Submit</test-button>
      </aihu-form-control>`
    const b = document.querySelector('test-button') as AihuButton
    expect(b.getAttribute('aria-disabled')).toBe('true')
    let clicks = 0
    b.addEventListener('click', () => clicks++)
    b.click()
    expect(clicks).toBe(0)
  })
})
