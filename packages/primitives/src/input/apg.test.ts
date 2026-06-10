/**
 * input native-handoff conformance test (jsdom). There is no APG "input"
 * pattern — the contract is the native `<input>` handoff:
 *   - a native light-DOM child is adopted or created (source of truth)
 *   - forwarded host attributes land on the native child (without clobbering
 *     consumer-preset attributes on a pre-supplied child)
 *   - the host `value` attribute reflects two-way (dialog open-attr pattern)
 *   - disabled/required are written as NATIVE PROPS (form-control owns aria-*)
 *   - data-state reflects disabled | readonly | idle
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuInput, defineInput } from './index.ts'

defineInput()

describe('native-handoff conformance — Input', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('auto-creates a native <input> child when absent', () => {
    document.body.innerHTML = '<aihu-input></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    const native = host.querySelector('input')
    expect(native).not.toBeNull()
    expect(host.nativeControl).toBe(native)
  })

  it('adopts a pre-supplied native child instead of creating one', () => {
    document.body.innerHTML = '<aihu-input><input placeholder="kept" /></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    expect(host.querySelectorAll('input').length).toBe(1)
    expect(host.nativeControl).toBe(host.querySelector('input'))
  })

  it('forwards observed host attributes onto the native child', () => {
    document.body.innerHTML =
      '<aihu-input type="email" name="email" placeholder="you@example.com" maxlength="64" inputmode="email"></aihu-input>'
    const native = (document.querySelector('aihu-input') as AihuInput)
      .nativeControl as HTMLInputElement
    expect(native.getAttribute('type')).toBe('email')
    expect(native.getAttribute('name')).toBe('email')
    expect(native.getAttribute('placeholder')).toBe('you@example.com')
    expect(native.getAttribute('maxlength')).toBe('64')
    expect(native.getAttribute('inputmode')).toBe('email')
  })

  it('keeps forwarding reactive after connect', () => {
    document.body.innerHTML = '<aihu-input></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    host.setAttribute('placeholder', 'later')
    expect((host.nativeControl as HTMLInputElement).getAttribute('placeholder')).toBe('later')
    host.removeAttribute('placeholder')
    expect((host.nativeControl as HTMLInputElement).hasAttribute('placeholder')).toBe(false)
  })

  it('does NOT clobber consumer-preset attrs on a pre-supplied child when the host attr is absent', () => {
    document.body.innerHTML = '<aihu-input><input placeholder="mine" type="search" /></aihu-input>'
    const native = (document.querySelector('aihu-input') as AihuInput)
      .nativeControl as HTMLInputElement
    expect(native.getAttribute('placeholder')).toBe('mine')
    expect(native.getAttribute('type')).toBe('search')
  })

  it('a present host attr wins over a pre-supplied child attr', () => {
    document.body.innerHTML =
      '<aihu-input placeholder="host"><input placeholder="child" /></aihu-input>'
    const native = (document.querySelector('aihu-input') as AihuInput)
      .nativeControl as HTMLInputElement
    expect(native.getAttribute('placeholder')).toBe('host')
  })

  it('the host value attribute seeds and stays reactive (two-way reflection)', () => {
    document.body.innerHTML = '<aihu-input value="start"></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    expect(host.value()).toBe('start')
    expect((host.nativeControl as HTMLInputElement).value).toBe('start')

    host.setAttribute('value', 'changed')
    expect(host.value()).toBe('changed')
    expect((host.nativeControl as HTMLInputElement).value).toBe('changed')

    host.setValue('programmatic')
    expect(host.getAttribute('value')).toBe('programmatic')
    expect((host.nativeControl as HTMLInputElement).value).toBe('programmatic')
  })

  it('owns native props, not aria-*: disabled/required land on the native element', () => {
    document.body.innerHTML = '<aihu-input disabled required></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    const native = host.nativeControl as HTMLInputElement
    expect(native.disabled).toBe(true)
    expect(native.required).toBe(true)
    // aria-* on the control is form-control's job — the input must not stamp it.
    expect(host.hasAttribute('aria-disabled')).toBe(false)
  })

  it('readonly is forwarded and reflected in data-state', () => {
    document.body.innerHTML = '<aihu-input readonly></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    expect((host.nativeControl as HTMLInputElement).hasAttribute('readonly')).toBe(true)
    expect(host.getAttribute('data-state')).toBe('readonly')
    host.removeAttribute('readonly')
    expect(host.getAttribute('data-state')).toBe('idle')
  })

  it('disabled wins over readonly in data-state', () => {
    document.body.innerHTML = '<aihu-input readonly disabled></aihu-input>'
    const host = document.querySelector('aihu-input') as AihuInput
    expect(host.getAttribute('data-state')).toBe('disabled')
  })

  it('attributeChangedCallback before connect does not throw (guarded)', () => {
    const host = document.createElement('aihu-input') as AihuInput
    host.setAttribute('value', 'early')
    host.setAttribute('placeholder', 'early')
    document.body.appendChild(host)
    expect(host.value()).toBe('early')
    expect((host.nativeControl as HTMLInputElement).getAttribute('placeholder')).toBe('early')
  })
})
