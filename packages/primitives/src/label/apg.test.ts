/**
 * label association conformance test (jsdom). There is no APG "label"
 * pattern — the contract is the HTML label↔control association re-created
 * with ARIA:
 *   - standalone label sets aria-labelledby = its own id on the `for` target
 *   - inside <aihu-form-control>, the control gains aria-labelledby = the
 *     label's id (and the context publishes labelId)
 *   - the label takes no role / tabindex of its own
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { injectValue } from '../dom-context.ts'
import { defineFormControl, formControlContext } from '../form-control/index.ts'
import { type AihuLabel, defineLabel } from './index.ts'

defineLabel()
defineFormControl()

describe('association conformance — Label', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('gets a generated id and stamps data-fc-label on connect', () => {
    document.body.innerHTML = '<aihu-label>Name</aihu-label>'
    const label = document.querySelector('aihu-label') as AihuLabel
    expect(label.id).toBeTruthy()
    expect(label.hasAttribute('data-fc-label')).toBe(true)
  })

  it('standalone: sets aria-labelledby = label id on the `for` target', () => {
    document.body.innerHTML = `
      <aihu-label for="custom-box">Agree</aihu-label>
      <div id="custom-box" role="checkbox" aria-checked="false"></div>`
    const label = document.querySelector('aihu-label') as AihuLabel
    const box = document.getElementById('custom-box') as HTMLElement
    expect(box.getAttribute('aria-labelledby')).toBe(label.id)
  })

  it('inside a form-control: the control gains aria-labelledby = label id', () => {
    document.body.innerHTML = `
      <aihu-form-control>
        <aihu-label>Email</aihu-label>
        <input data-fc-control type="text" />
      </aihu-form-control>`
    const label = document.querySelector('aihu-label') as AihuLabel
    const input = document.querySelector('input') as HTMLInputElement
    expect(label.id).toBeTruthy()
    expect(input.getAttribute('aria-labelledby')).toBe(label.id)
    // The context publishes the label id for sibling pieces.
    const ctx = injectValue(input, formControlContext)
    expect(ctx.labelId()).toBe(label.id)
  })

  it('a plain [data-fc-label] element also wires aria-labelledby (form-control Task 3)', () => {
    document.body.innerHTML = `
      <aihu-form-control>
        <span data-fc-label>Plain</span>
        <input data-fc-control type="text" />
      </aihu-form-control>`
    const span = document.querySelector('span') as HTMLElement
    const input = document.querySelector('input') as HTMLInputElement
    expect(span.id).toBeTruthy()
    expect(input.getAttribute('aria-labelledby')).toBe(span.id)
  })

  it('keeps an author-supplied id', () => {
    document.body.innerHTML = `
      <aihu-label id="my-label" for="f">Name</aihu-label>
      <div id="f" role="switch"></div>`
    const target = document.getElementById('f') as HTMLElement
    expect(target.getAttribute('aria-labelledby')).toBe('my-label')
  })

  it('takes no role and no tabindex of its own', () => {
    document.body.innerHTML = '<aihu-label>Name</aihu-label>'
    const label = document.querySelector('aihu-label') as AihuLabel
    expect(label.hasAttribute('role')).toBe(false)
    expect(label.hasAttribute('tabindex')).toBe(false)
  })
})
