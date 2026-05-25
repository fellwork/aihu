/**
 * `<aihu-form-control>` — headless form-field coordinator. Owns the
 * disabled/required/invalid state for a field and wires the ARIA association
 * between a slotted control, its label, and its error/description text. Emits
 * NO CSS.
 *
 * Reflected attributes: `disabled`, `required`, `invalid` (boolean); `name`,
 * `control-id` (string).
 * Owned signals: `disabled`, `required`, `invalid`.
 * ARIA emitted onto the slotted control: `aria-required`, `aria-invalid`,
 * `aria-disabled`, `aria-describedby` (wired to a slotted `[data-fc-description]`
 * / `[data-fc-error]` element's id); a slotted `<label>` is associated via
 * `for`/`id`.
 * Context: provides `formControlContext` carrying
 * `{ disabled, required, invalid, controlId, describedById }` signals so
 * descendant pieces consume the shared state without prop-drilling.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, provideContext } from '../dom-context.ts'

export interface FormControlContextValue {
  readonly disabled: Read<boolean>
  readonly required: Read<boolean>
  readonly invalid: Read<boolean>
  readonly controlId: Read<string>
  readonly describedById: Read<string | null>
}

export const formControlContext = createDomContext<FormControlContextValue>('form-control')

let _idCounter = 0
function nextId(): string {
  _idCounter += 1
  return `aihu-fc-${_idCounter}`
}

export class AihuFormControl extends HTMLElement {
  static readonly observedAttributes = ['disabled', 'required', 'invalid', 'name', 'control-id']

  private readonly _disabled = signal(false)
  private readonly _required = signal(false)
  private readonly _invalid = signal(false)
  private readonly _controlId = signal('')
  private readonly _describedById = signal<string | null>(null)

  private _disposers: Array<() => void> = []

  get disabled(): Read<boolean> {
    return this._disabled[0]
  }
  get required(): Read<boolean> {
    return this._required[0]
  }
  get invalid(): Read<boolean> {
    return this._invalid[0]
  }
  get controlId(): Read<string> {
    return this._controlId[0]
  }

  constructor() {
    super()
    provideContext(this, formControlContext, {
      disabled: this._disabled[0],
      required: this._required[0],
      invalid: this._invalid[0],
      controlId: this._controlId[0],
      describedById: this._describedById[0],
    })
  }

  connectedCallback(): void {
    // Stable control id (generated if not supplied).
    const supplied = this.getAttribute('control-id')
    this._controlId[1](supplied ?? nextId())

    this._syncBooleans()
    this._wireAssociations()

    // Reflect ARIA onto the slotted control reactively.
    this._disposers.push(
      effect(() => {
        const control = this._control()
        if (!control) return
        reflectAria(control, 'aria-disabled', this._disabled[0]())
        reflectAria(control, 'aria-required', this._required[0]())
        reflectAria(control, 'aria-invalid', this._invalid[0]())
        const describedBy = this._describedById[0]()
        if (describedBy) control.setAttribute('aria-describedby', describedBy)
        else control.removeAttribute('aria-describedby')
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'disabled':
        this._disabled[1](value !== null)
        break
      case 'required':
        this._required[1](value !== null)
        break
      case 'invalid':
        this._invalid[1](value !== null)
        break
      case 'control-id':
        if (value) this._controlId[1](value)
        break
    }
  }

  /** Re-derive `aria-describedby` from the slotted description/error pieces.
   * Call after a piece mounts/unmounts. */
  recomputeDescribedBy(): void {
    this._wireAssociations()
  }

  private _syncBooleans(): void {
    this._disabled[1](this.hasAttribute('disabled'))
    this._required[1](this.hasAttribute('required'))
    this._invalid[1](this.hasAttribute('invalid'))
  }

  /** The slotted control element (input/select/textarea/[data-fc-control]). */
  private _control(): HTMLElement | null {
    return this.querySelector<HTMLElement>(
      '[data-fc-control], input, select, textarea, [role="textbox"]',
    )
  }

  private _wireAssociations(): void {
    const control = this._control()
    if (control) {
      if (!control.id) control.id = this._controlId[0]()
      else this._controlId[1](control.id)
    }

    // Associate a slotted label.
    const label = this.querySelector<HTMLElement>('label, [data-fc-label]')
    if (label && control) {
      if (label instanceof HTMLLabelElement) label.htmlFor = control.id
      else label.setAttribute('for', control.id)
    }

    // Collect description + error ids into aria-describedby.
    const described: string[] = []
    for (const el of this.querySelectorAll<HTMLElement>('[data-fc-description], [data-fc-error]')) {
      if (!el.id) el.id = nextId()
      described.push(el.id)
    }
    this._describedById[1](described.length ? described.join(' ') : null)
  }
}

function reflectAria(el: HTMLElement, attr: string, on: boolean): void {
  if (on) el.setAttribute(attr, 'true')
  else el.removeAttribute(attr)
}

let _defined = false
/** Register `<aihu-form-control>` (idempotent). */
export function defineFormControl(tag = 'aihu-form-control'): void {
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuFormControl)
  _defined = true
}
