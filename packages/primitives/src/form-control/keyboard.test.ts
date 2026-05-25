/**
 * form-control behavior tests (jsdom): ARIA reflection + label/control/error
 * association + reactive FormControlContext consumption.
 */
import { effect } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import { injectContext } from '../dom-context.ts'
import { type AihuFormControl, defineFormControl, formControlContext } from './index.ts'

defineFormControl()

function mount(html: string): AihuFormControl {
  const fc = document.createElement('aihu-form-control') as AihuFormControl
  fc.innerHTML = html
  document.body.appendChild(fc)
  return fc
}

describe('<aihu-form-control>', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('setting invalid reflects aria-invalid=true on the slotted control', () => {
    const fc = mount('<input data-fc-control />')
    const input = fc.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBeNull()
    fc.setAttribute('invalid', '')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    fc.removeAttribute('invalid')
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('disabled propagates aria-disabled; required propagates aria-required', () => {
    const fc = mount('<input data-fc-control />')
    const input = fc.querySelector('input') as HTMLInputElement
    fc.setAttribute('disabled', '')
    fc.setAttribute('required', '')
    expect(input.getAttribute('aria-disabled')).toBe('true')
    expect(input.getAttribute('aria-required')).toBe('true')
  })

  it('wires a slotted error element id into aria-describedby', () => {
    const fc = mount('<input data-fc-control /><span data-fc-error>oops</span>')
    const input = fc.querySelector('input') as HTMLInputElement
    const err = fc.querySelector('[data-fc-error]') as HTMLElement
    expect(err.id).toBeTruthy()
    expect(input.getAttribute('aria-describedby')).toBe(err.id)
  })

  it('associates a slotted label with the control via for/id', () => {
    const fc = mount('<label data-fc-label>Name</label><input data-fc-control />')
    const label = fc.querySelector('label') as HTMLLabelElement
    const input = fc.querySelector('input') as HTMLInputElement
    expect(input.id).toBeTruthy()
    expect(label.htmlFor).toBe(input.id)
  })

  it('uses a supplied control-id', () => {
    const fc = document.createElement('aihu-form-control') as AihuFormControl
    fc.setAttribute('control-id', 'email-field')
    fc.innerHTML = '<input data-fc-control />'
    document.body.appendChild(fc)
    const input = fc.querySelector('input') as HTMLInputElement
    expect(input.id).toBe('email-field')
  })

  it('descendant pieces injecting FormControlContext see the same signal values reactively', () => {
    const fc = mount('<input data-fc-control />')
    const input = fc.querySelector('input') as HTMLInputElement
    const ctx = injectContext(input, formControlContext)

    const seen: boolean[] = []
    const dispose = effect(() => {
      seen.push(ctx.disabled())
    })
    expect(seen).toEqual([false])
    fc.setAttribute('disabled', '')
    expect(seen).toEqual([false, true])
    dispose()
  })

  it('recomputeDescribedBy picks up a late-mounted error message', () => {
    const fc = mount('<input data-fc-control />')
    const input = fc.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-describedby')).toBeNull()

    const err = document.createElement('span')
    err.setAttribute('data-fc-error', '')
    fc.appendChild(err)
    fc.recomputeDescribedBy()
    expect(input.getAttribute('aria-describedby')).toBe(err.id)
  })
})
