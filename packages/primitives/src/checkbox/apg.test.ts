/**
 * WAI-ARIA APG **Checkbox** conformance test (jsdom). Asserts the contract
 * from https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/ :
 *   - role=checkbox + tabindex=0 on the host
 *   - tri-state aria-checked ("true" | "false" | "mixed")
 *   - activation from mixed lands on CHECKED (Radix rule)
 *   - two-way `checked` attribute reflection
 *   - hidden-input form participation (indeterminate submits as unchecked)
 *   - the indicator mirrors data-state and is aria-hidden
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuCheckboxRoot, defineCheckbox } from './index.ts'

defineCheckbox()

describe('APG conformance — Checkbox', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('the host has role=checkbox and tabindex=0', () => {
    document.body.innerHTML = '<aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.getAttribute('role')).toBe('checkbox')
    expect(box.getAttribute('tabindex')).toBe('0')
    expect(box.hasAttribute('data-fc-control')).toBe(true)
  })

  it('respects a consumer-supplied role', () => {
    document.body.innerHTML =
      '<aihu-checkbox-root role="menuitemcheckbox" aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.getAttribute('role')).toBe('menuitemcheckbox')
  })

  it('tri-state aria-checked including "mixed"', () => {
    document.body.innerHTML = `
      <aihu-checkbox-root aria-label="a"></aihu-checkbox-root>
      <aihu-checkbox-root checked aria-label="b"></aihu-checkbox-root>
      <aihu-checkbox-root checked="mixed" aria-label="c"></aihu-checkbox-root>`
    const [unchecked, checked, mixed] = Array.from(
      document.querySelectorAll('aihu-checkbox-root'),
    ) as AihuCheckboxRoot[]
    expect(unchecked?.getAttribute('aria-checked')).toBe('false')
    expect(unchecked?.getAttribute('data-state')).toBe('unchecked')
    expect(checked?.getAttribute('aria-checked')).toBe('true')
    expect(checked?.getAttribute('data-state')).toBe('checked')
    expect(mixed?.getAttribute('aria-checked')).toBe('mixed')
    expect(mixed?.getAttribute('data-state')).toBe('indeterminate')
  })

  it('activation from mixed goes to CHECKED (Radix rule)', () => {
    document.body.innerHTML =
      '<aihu-checkbox-root checked="mixed" aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    box.click()
    expect(box.getAttribute('aria-checked')).toBe('true')
    expect(box.state()).toBe('checked')
  })

  it('reflects two-way: setAttribute → state, toggle → attribute', () => {
    document.body.innerHTML = '<aihu-checkbox-root aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    box.setAttribute('checked', '')
    expect(box.state()).toBe('checked')
    box.setAttribute('checked', 'mixed')
    expect(box.state()).toBe('indeterminate')
    box.click() // mixed → checked
    expect(box.getAttribute('checked')).toBe('')
    box.click() // checked → unchecked
    expect(box.hasAttribute('checked')).toBe(false)
  })

  it('default-checked seeds once without reflecting', () => {
    document.body.innerHTML =
      '<aihu-checkbox-root default-checked aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.state()).toBe('checked')
    expect(box.hasAttribute('checked')).toBe(false)
  })

  it('aria-required=true when required', () => {
    document.body.innerHTML =
      '<aihu-checkbox-root required aria-label="Agree"></aihu-checkbox-root>'
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(box.getAttribute('aria-required')).toBe('true')
  })

  it('FormData contains value when checked, nothing when unchecked OR indeterminate', () => {
    document.body.innerHTML = `
      <form>
        <aihu-checkbox-root name="agree" value="yes" aria-label="Agree"></aihu-checkbox-root>
      </form>`
    const form = document.querySelector('form') as HTMLFormElement
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    expect(new FormData(form).get('agree')).toBeNull()
    box.click()
    expect(new FormData(form).get('agree')).toBe('yes')
    box.setChecked('mixed')
    // Indeterminate submits as UNCHECKED (native parity).
    expect(new FormData(form).get('agree')).toBeNull()
  })

  it('the indicator mirrors data-state and is aria-hidden', () => {
    document.body.innerHTML = `
      <aihu-checkbox-root aria-label="Agree">
        <aihu-checkbox-indicator></aihu-checkbox-indicator>
      </aihu-checkbox-root>`
    const box = document.querySelector('aihu-checkbox-root') as AihuCheckboxRoot
    const indicator = document.querySelector('aihu-checkbox-indicator') as HTMLElement
    expect(indicator.getAttribute('aria-hidden')).toBe('true')
    expect(indicator.getAttribute('data-state')).toBe('unchecked')
    box.click()
    expect(indicator.getAttribute('data-state')).toBe('checked')
    box.setChecked('mixed')
    expect(indicator.getAttribute('data-state')).toBe('indeterminate')
  })
})
