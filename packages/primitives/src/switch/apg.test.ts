/**
 * WAI-ARIA APG **Switch** conformance test (jsdom). Asserts the contract from
 * https://www.w3.org/WAI/ARIA/apg/patterns/switch/ :
 *   - role=switch + tabindex=0 on the host
 *   - BINARY aria-checked ("true" | "false" — never "mixed")
 *   - two-way `checked` attribute reflection
 *   - hidden-input form participation (on/off)
 *   - the thumb mirrors data-state and is aria-hidden
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuSwitchRoot, defineSwitch } from './index.ts'

defineSwitch()

describe('APG conformance — Switch', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('the host has role=switch and tabindex=0', () => {
    document.body.innerHTML = '<aihu-switch-root aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    expect(sw.getAttribute('role')).toBe('switch')
    expect(sw.getAttribute('tabindex')).toBe('0')
    expect(sw.hasAttribute('data-fc-control')).toBe(true)
  })

  it('binary aria-checked — a "mixed" checked attr still reads as checked', () => {
    document.body.innerHTML = `
      <aihu-switch-root aria-label="a"></aihu-switch-root>
      <aihu-switch-root checked aria-label="b"></aihu-switch-root>
      <aihu-switch-root checked="mixed" aria-label="c"></aihu-switch-root>`
    const [off, on, mixedAttr] = Array.from(
      document.querySelectorAll('aihu-switch-root'),
    ) as AihuSwitchRoot[]
    expect(off?.getAttribute('aria-checked')).toBe('false')
    expect(off?.getAttribute('data-state')).toBe('unchecked')
    expect(on?.getAttribute('aria-checked')).toBe('true')
    expect(on?.getAttribute('data-state')).toBe('checked')
    // Boolean presence semantics: never "mixed" on a switch.
    expect(mixedAttr?.getAttribute('aria-checked')).toBe('true')
  })

  it('reflects two-way: setAttribute → state, toggle → attribute', () => {
    document.body.innerHTML = '<aihu-switch-root aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    sw.setAttribute('checked', '')
    expect(sw.checked()).toBe(true)
    sw.click() // → off
    expect(sw.hasAttribute('checked')).toBe(false)
    sw.click() // → on
    expect(sw.getAttribute('checked')).toBe('')
  })

  it('default-checked seeds once without reflecting', () => {
    document.body.innerHTML =
      '<aihu-switch-root default-checked aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    expect(sw.checked()).toBe(true)
    expect(sw.hasAttribute('checked')).toBe(false)
  })

  it('aria-required=true when required', () => {
    document.body.innerHTML = '<aihu-switch-root required aria-label="Notify"></aihu-switch-root>'
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    expect(sw.getAttribute('aria-required')).toBe('true')
  })

  it('FormData carries name → value when on, nothing when off', () => {
    document.body.innerHTML = `
      <form>
        <aihu-switch-root name="notify" aria-label="Notify"></aihu-switch-root>
      </form>`
    const form = document.querySelector('form') as HTMLFormElement
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    expect(new FormData(form).get('notify')).toBeNull()
    sw.click()
    // `value` defaults to "on".
    expect(new FormData(form).get('notify')).toBe('on')
    sw.click()
    expect(new FormData(form).get('notify')).toBeNull()
  })

  it('the thumb mirrors data-state and is aria-hidden', () => {
    document.body.innerHTML = `
      <aihu-switch-root aria-label="Notify">
        <aihu-switch-thumb></aihu-switch-thumb>
      </aihu-switch-root>`
    const sw = document.querySelector('aihu-switch-root') as AihuSwitchRoot
    const thumb = document.querySelector('aihu-switch-thumb') as HTMLElement
    expect(thumb.getAttribute('aria-hidden')).toBe('true')
    expect(thumb.getAttribute('data-state')).toBe('unchecked')
    sw.click()
    expect(thumb.getAttribute('data-state')).toBe('checked')
  })
})
