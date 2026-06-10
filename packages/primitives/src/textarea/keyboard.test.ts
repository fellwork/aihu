/**
 * textarea keyboard/interaction tests (jsdom): typing syncs the value signal +
 * fires `value-change`, default-value seeding, merged disabled, focus
 * delegation, and FormData participation.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineFormControl } from '../form-control/index.ts'
import { type AihuTextarea, defineTextarea } from './index.ts'

defineTextarea()
defineFormControl()

function type(host: AihuTextarea, text: string): void {
  const native = host.nativeControl as HTMLTextAreaElement
  native.value = text
  native.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AihuTextarea — interaction', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('typing syncs value() and fires value-change with detail from the host', () => {
    document.body.innerHTML = '<aihu-textarea></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    const seen: string[] = []
    host.addEventListener('value-change', (ev) => {
      seen.push((ev as CustomEvent<{ value: string }>).detail.value)
    })
    type(host, 'multi\nline')
    expect(host.value()).toBe('multi\nline')
    expect(seen).toEqual(['multi\nline'])
  })

  it('default-value seeds once, only when the native value is empty', () => {
    document.body.innerHTML = '<aihu-textarea default-value="seed"></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    expect(host.value()).toBe('seed')
    expect(host.hasAttribute('value')).toBe(false)

    // Reconnect must NOT re-seed (seeds ONCE).
    type(host, '')
    const parent = host.parentElement as HTMLElement
    host.remove()
    parent.appendChild(host)
    expect((host.nativeControl as HTMLTextAreaElement).value).toBe('')
  })

  it('focus() delegates to the native child', () => {
    document.body.innerHTML = '<aihu-textarea></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    host.focus()
    expect(document.activeElement).toBe(host.nativeControl)
  })

  it('merged disabled sets native .disabled (own + inherited)', () => {
    document.body.innerHTML = `
      <aihu-form-control disabled>
        <aihu-textarea></aihu-textarea>
      </aihu-form-control>`
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    expect((host.nativeControl as HTMLTextAreaElement).disabled).toBe(true)
    expect(host.getAttribute('data-state')).toBe('disabled')
  })

  it('FormData of a wrapping form contains name → typed value', () => {
    document.body.innerHTML = `
      <form>
        <aihu-textarea name="bio"></aihu-textarea>
      </form>`
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    type(host, 'about me')
    const form = document.querySelector('form') as HTMLFormElement
    expect(new FormData(form).get('bio')).toBe('about me')
  })
})
