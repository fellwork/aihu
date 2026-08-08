/**
 * Headless checkbox — `<aihu-checkbox-root>` (state owner) + presentational
 * `<aihu-checkbox-indicator>`. Implements the WAI-ARIA APG **Checkbox**
 * pattern (tri-state): `role="checkbox"`, `aria-checked="true" | "false" |
 * "mixed"`, Space toggles, Enter does NOT activate (APG/Radix). Emits NO CSS —
 * each piece reflects `data-state="checked" | "unchecked" | "indeterminate"`
 * (+ `data-disabled` presence) for the consumer to style.
 *
 * Form participation rides `attachHiddenInput` (a visually-hidden native
 * checkbox in the host's light DOM): the value submits only when fully
 * checked — indeterminate submits as UNCHECKED (native parity).
 *
 * `checked-change` (detail `{ checked: boolean | 'mixed' }`, bubbles,
 * composed) is dispatched on USER-driven toggles only (clicks/keys), matching
 * the dialog precedent — programmatic attribute writes do not emit.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, injectValue, provideContext } from '../dom-context.ts'
import {
  attachHiddenInput,
  type FormControlContextValue,
  formControlContext,
} from '../form-control/index.ts'
import { HTMLElementBase } from '../html-element-base.ts'

export type CheckboxState = 'checked' | 'unchecked' | 'indeterminate'

export interface CheckboxContextValue {
  readonly state: Read<CheckboxState>
  readonly disabled: Read<boolean>
}

export const checkboxContext = createDomContext<CheckboxContextValue>('checkbox')

/** `checked` attribute grammar: absent=unchecked, "mixed"=indeterminate,
 * any other value (including empty)=checked. */
function parseChecked(value: string | null): CheckboxState {
  if (value === null) return 'unchecked'
  if (value === 'mixed') return 'indeterminate'
  return 'checked'
}

export class AihuCheckboxRoot extends HTMLElementBase {
  static readonly observedAttributes = [
    'checked',
    'default-checked',
    'disabled',
    'required',
    'name',
    'value',
  ]

  private readonly _state = signal<CheckboxState>('unchecked')
  private readonly _disabled = signal(false)
  private readonly _required = signal(false)
  private readonly _name = signal<string | null>(null)
  private readonly _value = signal('on')
  private _fc: FormControlContextValue | null = null
  private _disposers: Array<() => void> = []
  private _defaultSeeded = false

  constructor() {
    super()
    provideContext(this, checkboxContext, {
      state: this._state[0],
      disabled: () => this._effectiveDisabled(),
    })
  }

  get state(): Read<CheckboxState> {
    return this._state[0]
  }

  /** Programmatic write: signal + reflected `checked` attribute (two-way,
   * dialog open-attr pattern). Does NOT emit `checked-change`. */
  setChecked(next: boolean | 'mixed'): void {
    const state: CheckboxState = next === 'mixed' ? 'indeterminate' : next ? 'checked' : 'unchecked'
    if (state === this._state[0]()) return
    this._state[1](state)
    if (state === 'unchecked') this.removeAttribute('checked')
    else this.setAttribute('checked', state === 'indeterminate' ? 'mixed' : '')
  }

  connectedCallback(): void {
    // Initial state: the `checked` attribute wins; otherwise `default-checked`
    // seeds ONCE (signal only — never reflected).
    if (this.hasAttribute('checked')) {
      this._state[1](parseChecked(this.getAttribute('checked')))
    } else if (!this._defaultSeeded && this.hasAttribute('default-checked')) {
      this._state[1](parseChecked(this.getAttribute('default-checked')))
    }
    this._defaultSeeded = true
    this._syncFromAttrs()

    if (!this.hasAttribute('role')) this.setAttribute('role', 'checkbox')
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0')
    // Discoverable by an ancestor <aihu-form-control> ([data-fc-control] is
    // first in its control selector, so the HOST wins over the hidden input).
    this.setAttribute('data-fc-control', '')

    this.addEventListener('keydown', this._onKeydown)
    // Capture so disabled suppression beats consumer handlers (button precedent).
    this.addEventListener('click', this._onClickCapture, true)

    try {
      this._fc = injectValue(this, formControlContext)
    } catch {
      this._fc = null
    }

    this._disposers.push(
      effect(() => {
        const state = this._state[0]()
        this.setAttribute(
          'aria-checked',
          state === 'checked' ? 'true' : state === 'indeterminate' ? 'mixed' : 'false',
        )
        if (this._effectiveRequired()) this.setAttribute('aria-required', 'true')
        else this.removeAttribute('aria-required')
        this.setAttribute('data-state', state)
        if (this._effectiveDisabled()) this.setAttribute('data-disabled', '')
        else this.removeAttribute('data-disabled')
      }),
      attachHiddenInput(this, {
        type: 'checkbox',
        name: this._name[0],
        value: this._value[0],
        // Indeterminate submits as unchecked (native parity).
        checked: () => this._state[0]() === 'checked',
        required: () => this._effectiveRequired(),
        disabled: () => this._effectiveDisabled(),
      }),
    )
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeydown)
    this.removeEventListener('click', this._onClickCapture, true)
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'checked':
        this._state[1](parseChecked(value))
        break
      case 'disabled':
        this._disabled[1](value !== null)
        break
      case 'required':
        this._required[1](value !== null)
        break
      case 'name':
        this._name[1](value)
        break
      case 'value':
        this._value[1](value ?? 'on')
        break
      // 'default-checked' is read once on connect — never reactive.
    }
  }

  private _effectiveDisabled(): boolean {
    if (this._disabled[0]()) return true
    return this._fc ? this._fc.disabled() : false
  }

  private _effectiveRequired(): boolean {
    if (this._required[0]()) return true
    return this._fc ? this._fc.required() : false
  }

  private _syncFromAttrs(): void {
    this._disabled[1](this.hasAttribute('disabled'))
    this._required[1](this.hasAttribute('required'))
    this._name[1](this.getAttribute('name'))
    this._value[1](this.getAttribute('value') ?? 'on')
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter') {
      // APG/Radix: Enter does NOT activate a checkbox.
      ev.preventDefault()
      return
    }
    if (ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault() // stop page scroll
      if (this._effectiveDisabled()) return
      this.click()
    }
  }

  private readonly _onClickCapture = (ev: Event): void => {
    if (this._effectiveDisabled()) {
      ev.preventDefault()
      ev.stopImmediatePropagation()
      return
    }
    // User-driven toggle: 'mixed' activates to CHECKED (Radix rule).
    const next = this._state[0]() !== 'checked'
    this.setChecked(next)
    this.dispatchEvent(
      new CustomEvent<{ checked: boolean | 'mixed' }>('checked-change', {
        detail: { checked: next },
        bubbles: true,
        composed: true,
      }),
    )
  }
}

/** Presentational styling hook: mirrors the root's state, hidden from AT. */
export class AihuCheckboxIndicator extends HTMLElementBase {
  private _disposers: Array<() => void> = []

  connectedCallback(): void {
    const ctx = injectValue(this, checkboxContext)
    this.setAttribute('aria-hidden', 'true')
    this._disposers.push(
      effect(() => {
        this.setAttribute('data-state', ctx.state())
        if (ctx.disabled()) this.setAttribute('data-disabled', '')
        else this.removeAttribute('data-disabled')
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this._disposers) d()
    this._disposers = []
  }
}

const REGISTRY: Array<[string, CustomElementConstructor]> = [
  ['aihu-checkbox-root', AihuCheckboxRoot],
  ['aihu-checkbox-indicator', AihuCheckboxIndicator],
]

let _defined = false
/** Register all checkbox custom elements (idempotent). */
export function defineCheckbox(): void {
  if (_defined) return
  for (const [tag, ctor] of REGISTRY) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
  _defined = true
}
