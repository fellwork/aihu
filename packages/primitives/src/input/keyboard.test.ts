/**
 * input keyboard/interaction tests (jsdom): typing syncs the value signal +
 * fires `value-change`, default-value seeding, native-child handoff, merged
 * disabled, focus delegation, and FormData participation.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineFormControl } from '../form-control/index.ts'
import { type AihuInput, defineInput } from './index.ts'

defineInput()
defineFormControl()

function type(host: AihuInput, text: string): void {
  const native = host.nativeControl as HTMLInputElement
  native.value = text
  native.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AihuInput — interaction', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('typing syncs value() and fires value-change with detail from the host', () => {
    document.body.innerHTML = '<aihu-input></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    const seen: string[] = []
    host.addEventListener('value-change', (ev) => {
      seen.push((ev as CustomEvent<{ value: string }>).detail.value)
    })
    type(host, 'hello')
    expect(host.value()).toBe('hello')
    expect(seen).toEqual(['hello'])
  })

  it('value-change bubbles and is composed', () => {
    document.body.innerHTML = '<div id="outer"><aihu-input></aihu-input></div>'
    const host = document.querySelector('aihu-input') as AihuInput
    let composed = false
    document.getElementById('outer')?.addEventListener('value-change', (ev) => {
      composed = ev.composed
    })
    type(host, 'x')
    expect(composed).toBe(true)
  })

  it('default-value seeds once, only when the native value is empty', () => {
    document.body.innerHTML = '<aihu-input default-value="seed"></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    expect(host.value()).toBe('seed')
    expect((host.nativeControl as HTMLInputElement).value).toBe('seed')
    // No reflection of default-value into `value`.
    expect(host.hasAttribute('value')).toBe(false)

    // Reconnect must NOT re-seed (seeds ONCE).
    type(host, '')
    const parent = host.parentElement as HTMLElement
    host.remove()
    parent.appendChild(host)
    expect((host.nativeControl as HTMLInputElement).value).toBe('')
  })

  it('default-value does not overwrite a pre-filled native child', () => {
    const host = document.createElement('aihu-input') as AihuInput
    host.setAttribute('default-value', 'seed')
    const native = document.createElement('input')
    native.value = 'kept'
    host.appendChild(native)
    document.body.appendChild(host)
    expect(host.value()).toBe('kept')
  })

  it('focus() delegates to the native child', () => {
    document.body.innerHTML = '<aihu-input></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    host.focus()
    expect(document.activeElement).toBe(host.nativeControl)
  })

  it('merged disabled sets native .disabled (own attribute)', () => {
    document.body.innerHTML = '<aihu-input disabled></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    expect((host.nativeControl as HTMLInputElement).disabled).toBe(true)
    expect(host.getAttribute('data-state')).toBe('disabled')
  })

  it('inherits disabled from a disabled form-control ancestor', () => {
    document.body.innerHTML = `
      <aihu-form-control disabled>
        <aihu-input></aihu-input>
      </aihu-form-control>`
    const host = document.querySelector('aihu-input') as AihuInput
    expect((host.nativeControl as HTMLInputElement).disabled).toBe(true)
    expect(host.getAttribute('data-state')).toBe('disabled')
  })

  it('merged required sets native .required', () => {
    document.body.innerHTML = `
      <aihu-form-control required>
        <aihu-input></aihu-input>
      </aihu-form-control>`
    const host = document.querySelector('aihu-input') as AihuInput
    expect((host.nativeControl as HTMLInputElement).required).toBe(true)
  })

  it('FormData of a wrapping form contains name → typed value', () => {
    document.body.innerHTML = `
      <form>
        <aihu-input name="email"></aihu-input>
      </form>`
    const host = document.querySelector('aihu-input') as AihuInput
    type(host, 'a@b.co')
    const form = document.querySelector('form') as HTMLFormElement
    expect(new FormData(form).get('email')).toBe('a@b.co')
  })
})
