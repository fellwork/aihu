/**
 * attachHiddenInput tests (jsdom): FormData participation, the
 * form-and-name-required gate, reactive removal, the disposer, and
 * disabled exclusion.
 */
import { signal } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import { attachHiddenInput, type HiddenInputOptions } from './hidden-input.ts'

interface Setup {
  host: HTMLElement
  form: HTMLFormElement
  name: ReturnType<typeof signal<string | null>>
  value: ReturnType<typeof signal<string>>
  checked: ReturnType<typeof signal<boolean>>
  required: ReturnType<typeof signal<boolean>>
  disabled: ReturnType<typeof signal<boolean>>
  dispose: () => void
}

function setup(opts: { inForm?: boolean; name?: string | null } = {}): Setup {
  const form = document.createElement('form')
  const host = document.createElement('div')
  if (opts.inForm !== false) {
    form.appendChild(host)
    document.body.appendChild(form)
  } else {
    document.body.appendChild(host)
  }

  const name = signal<string | null>(opts.name === undefined ? 'agree' : opts.name)
  const value = signal('on')
  const checked = signal(true)
  const required = signal(false)
  const disabled = signal(false)

  const options: HiddenInputOptions = {
    type: 'checkbox',
    name: name[0],
    value: value[0],
    checked: checked[0],
    required: required[0],
    disabled: disabled[0],
  }
  const dispose = attachHiddenInput(host, options)
  return { host, form, name, value, checked, required, disabled, dispose }
}

describe('attachHiddenInput', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // The hidden input is the host's NEXT SIBLING (avoids nested-interactive on
  // roled hosts), so it's queried via the form, not the host subtree.
  it('FormData carries name→value when checked', () => {
    const { form, host } = setup()
    const input = form.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input).toBe(host.nextElementSibling)
    expect(input.type).toBe('checkbox')
    expect(input.getAttribute('aria-hidden')).toBe('true')
    expect(input.getAttribute('tabindex')).toBe('-1')
    expect(new FormData(form).get('agree')).toBe('on')
  })

  it('an unchecked input contributes nothing to FormData', () => {
    const { form, checked } = setup()
    checked[1](false)
    expect(new FormData(form).get('agree')).toBeNull()
  })

  it('creates no input when the host is not inside a form', () => {
    setup({ inForm: false })
    expect(document.querySelector('input')).toBeNull()
  })

  it('creates no input when name is null, and reacts when it becomes non-null', () => {
    const { name, form } = setup({ name: null })
    expect(form.querySelector('input')).toBeNull()
    name[1]('agree')
    expect(form.querySelector('input')).not.toBeNull()
    expect(new FormData(form).get('agree')).toBe('on')
    name[1](null)
    expect(form.querySelector('input')).toBeNull()
  })

  it('keeps value/required/disabled synced reactively', () => {
    const { form, value, required } = setup()
    const input = form.querySelector('input') as HTMLInputElement
    value[1]('yes')
    expect(input.value).toBe('yes')
    required[1](true)
    expect(input.required).toBe(true)
  })

  it('a disabled input is excluded from FormData', () => {
    const { form, disabled } = setup()
    disabled[1](true)
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(new FormData(form).get('agree')).toBeNull()
  })

  it('the disposer removes the input and stops syncing', () => {
    const { form, dispose, value } = setup()
    dispose()
    expect(form.querySelector('input')).toBeNull()
    value[1]('later') // must not throw / resurrect the input
    expect(form.querySelector('input')).toBeNull()
  })
})
