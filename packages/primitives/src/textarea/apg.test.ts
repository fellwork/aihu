/**
 * textarea native-handoff conformance test (jsdom). There is no APG
 * "textarea" pattern — the contract is the native `<textarea>` handoff
 * (mirrors the input conformance suite):
 *   - a native light-DOM child is adopted or created (source of truth)
 *   - forwarded host attributes (rows/cols/etc.) land on the native child
 *   - disabled/required are written as NATIVE PROPS (form-control owns aria-*)
 *   - data-state reflects disabled | readonly | idle
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuTextarea, defineTextarea } from './index.ts'

defineTextarea()

describe('native-handoff conformance — Textarea', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('auto-creates a native <textarea> child when absent', () => {
    document.body.innerHTML = '<aihu-textarea></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    const native = host.querySelector('textarea')
    expect(native).not.toBeNull()
    expect(host.nativeControl).toBe(native)
  })

  it('adopts a pre-supplied native child and respects its preset attrs', () => {
    document.body.innerHTML = '<aihu-textarea><textarea rows="9"></textarea></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    expect(host.querySelectorAll('textarea').length).toBe(1)
    expect((host.nativeControl as HTMLTextAreaElement).getAttribute('rows')).toBe('9')
  })

  it('forwards observed host attributes onto the native child', () => {
    document.body.innerHTML =
      '<aihu-textarea name="bio" placeholder="About you" rows="4" cols="40" maxlength="200"></aihu-textarea>'
    const native = (document.querySelector('aihu-textarea') as AihuTextarea)
      .nativeControl as HTMLTextAreaElement
    expect(native.getAttribute('name')).toBe('bio')
    expect(native.getAttribute('placeholder')).toBe('About you')
    expect(native.getAttribute('rows')).toBe('4')
    expect(native.getAttribute('cols')).toBe('40')
    expect(native.getAttribute('maxlength')).toBe('200')
  })

  it('keeps forwarding reactive after connect', () => {
    document.body.innerHTML = '<aihu-textarea></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    host.setAttribute('rows', '7')
    expect((host.nativeControl as HTMLTextAreaElement).getAttribute('rows')).toBe('7')
  })

  it('the host value attribute seeds and setValue reflects back', () => {
    document.body.innerHTML = '<aihu-textarea value="start"></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    expect(host.value()).toBe('start')
    host.setValue('next')
    expect((host.nativeControl as HTMLTextAreaElement).value).toBe('next')
    expect(host.getAttribute('value')).toBe('next')
  })

  it('owns native props, not aria-*: disabled/required land on the native element', () => {
    document.body.innerHTML = '<aihu-textarea disabled required></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    const native = host.nativeControl as HTMLTextAreaElement
    expect(native.disabled).toBe(true)
    expect(native.required).toBe(true)
    expect(host.hasAttribute('aria-disabled')).toBe(false)
  })

  it('readonly is forwarded and reflected in data-state', () => {
    document.body.innerHTML = '<aihu-textarea readonly></aihu-textarea>'
    const host = document.querySelector('aihu-textarea') as AihuTextarea
    expect((host.nativeControl as HTMLTextAreaElement).hasAttribute('readonly')).toBe(true)
    expect(host.getAttribute('data-state')).toBe('readonly')
  })
})
