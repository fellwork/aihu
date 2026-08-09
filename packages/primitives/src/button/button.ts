/**
 * `AihuButton` — headless button base class (WAI-ARIA APG Button). Consumers
 * (or Plan 5 recipes) extend it; it is NOT a registered tag in this package.
 * Use `defineButton(tag)` to register a concrete element for tests/consumers.
 *
 * Behavior:
 * - If the host is NOT a native `<button>`, sets `role="button"` +
 *   `tabindex="0"` and handles Enter / Space to fire a synthetic `click`
 *   (the APG Button keyboard contract). A native `<button>` defers to native
 *   semantics.
 * - `aria-pressed` reflects the `pressed` toggle state.
 * - `aria-disabled` + suppressed activation when `disabled`.
 * - Inherits `disabled` from a `FormControlContext` ancestor (Task 5) so a
 *   button inside a disabled `form-control` is disabled too.
 * - `data-state` reflects `pressed` / `disabled`. Emits NO CSS.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { injectValue } from '../dom-context.ts'
import { formControlContext } from '../form-control/index.ts'
import { HTMLElementBase } from '../html-element-base.ts'

export type ButtonType = 'button' | 'submit' | 'reset'

export class AihuButton extends HTMLElementBase {
  static readonly observedAttributes = ['disabled', 'pressed', 'type']

  private readonly _disabled = signal(false)
  private readonly _pressed = signal<boolean | null>(null)
  private _inheritedDisabled: Read<boolean> | null = null
  private _disposers: Array<() => void> = []

  /** True when this is a toggle button (the `pressed` attribute is present). */
  private _isToggle = false

  get disabled(): Read<boolean> {
    return this._disabled[0]
  }
  get pressed(): Read<boolean | null> {
    return this._pressed[0]
  }

  private get _isNativeButton(): boolean {
    return this.tagName === 'BUTTON'
  }

  connectedCallback(): void {
    this._isToggle = this.hasAttribute('pressed')
    this._syncFromAttrs()

    if (!this._isNativeButton) {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'button')
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0')
      this.addEventListener('keydown', this._onKeydown)
    }
    // Suppress activation when disabled (capture so it beats consumer handlers).
    this.addEventListener('click', this._onClickCapture, true)

    // Inherit disabled from a FormControlContext ancestor, if any.
    try {
      this._inheritedDisabled = injectValue(this, formControlContext).disabled
    } catch {
      this._inheritedDisabled = null
    }

    this._disposers.push(
      effect(() => {
        const disabled = this._effectiveDisabled()
        if (disabled) this.setAttribute('aria-disabled', 'true')
        else this.removeAttribute('aria-disabled')

        if (this._isToggle) {
          this.setAttribute('aria-pressed', String(this._pressed[0]() === true))
        }
        this.setAttribute('data-state', this._stateString(disabled))
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
      case 'disabled':
        this._disabled[1](value !== null)
        break
      case 'pressed':
        this._isToggle = value !== null ? true : this._isToggle
        this._pressed[1](value !== null)
        break
    }
  }

  /** Toggle a toggle-button's pressed state. */
  toggle(): void {
    if (!this._isToggle) return
    this._pressed[1](!(this._pressed[0]() === true))
  }

  private _effectiveDisabled(): boolean {
    if (this._disabled[0]()) return true
    return this._inheritedDisabled ? this._inheritedDisabled() : false
  }

  private _stateString(disabled: boolean): string {
    if (disabled) return 'disabled'
    if (this._isToggle) return this._pressed[0]() === true ? 'on' : 'off'
    return 'idle'
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (this._effectiveDisabled()) return
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault()
      this.click()
    }
  }

  private readonly _onClickCapture = (ev: Event): void => {
    if (this._effectiveDisabled()) {
      ev.preventDefault()
      ev.stopImmediatePropagation()
      return
    }
    if (this._isToggle) this.toggle()
  }

  private _syncFromAttrs(): void {
    this._disabled[1](this.hasAttribute('disabled'))
    if (this._isToggle) this._pressed[1](this.getAttribute('pressed') !== 'false')
  }
}

/** Register a concrete button tag backed by `AihuButton` (idempotent). Without a
 * DOM it registers nothing and returns `AihuButton` unchanged. */
export function defineButton(tag: string): typeof AihuButton {
  // No DOM, no registry to register INTO — a documented no-op. See
  // `html-element-base.ts` §"Registration without a DOM".
  if (typeof customElements === 'undefined') return AihuButton
  if (!customElements.get(tag)) {
    // A fresh subclass per tag so multiple tags can be registered.
    class TaggedButton extends AihuButton {}
    customElements.define(tag, TaggedButton)
  }
  return AihuButton
}
