/**
 * Headless switch — `<aihu-switch-root>` (state owner) + presentational
 * `<aihu-switch-thumb>`. Implements the WAI-ARIA APG **Switch** pattern:
 * `role="switch"`, binary `aria-checked="true" | "false"` (never "mixed"),
 * Space AND Enter toggle. Deliberately a SIBLING of checkbox, not shared
 * code — the ARIA contracts diverge (tri-state vs binary, Enter behavior).
 * Emits NO CSS — each piece reflects `data-state="checked" | "unchecked"`
 * (+ `data-disabled` presence) for the consumer to style.
 *
 * Form participation rides `attachHiddenInput` (a visually-hidden native
 * checkbox in the host's light DOM). `checked-change` (detail
 * `{ checked: boolean }`, bubbles, composed) is dispatched on USER-driven
 * toggles only (clicks/keys) — programmatic attribute writes do not emit.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, injectValue, provideContext } from '../dom-context.ts'
import {
  attachHiddenInput,
  type FormControlContextValue,
  formControlContext,
} from '../form-control/index.ts'

export interface SwitchContextValue {
  readonly checked: Read<boolean>
  readonly disabled: Read<boolean>
}

export const switchContext = createDomContext<SwitchContextValue>('switch')

export class AihuSwitchRoot extends HTMLElement {
  static readonly observedAttributes = [
    'checked',
    'default-checked',
    'disabled',
    'required',
    'name',
    'value',
  ]

  private readonly _checked = signal(false)
  private readonly _disabled = signal(false)
  private readonly _required = signal(false)
  private readonly _name = signal<string | null>(null)
  private readonly _value = signal('on')
  private _fc: FormControlContextValue | null = null
  private _disposers: Array<() => void> = []
  private _defaultSeeded = false

  constructor() {
    super()
    provideContext(this, switchContext, {
      checked: this._checked[0],
      disabled: () => this._effectiveDisabled(),
    })
  }

  get checked(): Read<boolean> {
    return this._checked[0]
  }

  /** Programmatic write: signal + reflected `checked` attribute (two-way,
   * dialog open-attr pattern). Does NOT emit `checked-change`. */
  setChecked(next: boolean): void {
    if (next === this._checked[0]()) return
    this._checked[1](next)
    if (next) this.setAttribute('checked', '')
    else this.removeAttribute('checked')
  }

  connectedCallback(): void {
    // Initial state: the `checked` attribute wins; otherwise `default-checked`
    // seeds ONCE (signal only — never reflected).
    if (this.hasAttribute('checked')) {
      this._checked[1](true)
    } else if (!this._defaultSeeded && this.hasAttribute('default-checked')) {
      this._checked[1](true)
    }
    this._defaultSeeded = true
    this._syncFromAttrs()

    if (!this.hasAttribute('role')) this.setAttribute('role', 'switch')
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
        const checked = this._checked[0]()
        this.setAttribute('aria-checked', checked ? 'true' : 'false')
        if (this._effectiveRequired()) this.setAttribute('aria-required', 'true')
        else this.removeAttribute('aria-required')
        this.setAttribute('data-state', checked ? 'checked' : 'unchecked')
        if (this._effectiveDisabled()) this.setAttribute('data-disabled', '')
        else this.removeAttribute('data-disabled')
      }),
      attachHiddenInput(this, {
        type: 'checkbox',
        name: this._name[0],
        value: this._value[0],
        checked: this._checked[0],
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
        this._checked[1](value !== null)
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
    // APG Switch: BOTH Space and Enter toggle (unlike checkbox, where Enter
    // is explicitly inert).
    if (ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter') {
      ev.preventDefault()
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
    const next = !this._checked[0]()
    this.setChecked(next)
    this.dispatchEvent(
      new CustomEvent<{ checked: boolean }>('checked-change', {
        detail: { checked: next },
        bubbles: true,
        composed: true,
      }),
    )
  }
}

/** Presentational styling hook: mirrors the root's state, hidden from AT. */
export class AihuSwitchThumb extends HTMLElement {
  private _disposers: Array<() => void> = []

  connectedCallback(): void {
    const ctx = injectValue(this, switchContext)
    this.setAttribute('aria-hidden', 'true')
    this._disposers.push(
      effect(() => {
        this.setAttribute('data-state', ctx.checked() ? 'checked' : 'unchecked')
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
  ['aihu-switch-root', AihuSwitchRoot],
  ['aihu-switch-thumb', AihuSwitchThumb],
]

let _defined = false
/** Register all switch custom elements (idempotent). */
export function defineSwitch(): void {
  if (_defined) return
  for (const [tag, ctor] of REGISTRY) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
  _defined = true
}
