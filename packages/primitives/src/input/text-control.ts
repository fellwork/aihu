/**
 * `AihuTextControlBase` — shared base for `<aihu-input>` / `<aihu-textarea>`
 * (the native-handoff text controls). The host wraps a REAL light-DOM native
 * element (`<input>` / `<textarea>`) and delegates editing, focus, and form
 * participation to it — the Dialog-wraps-native principle. Because the native
 * element lives in the light DOM, `closest('form')` association is free and
 * NO hidden input is needed. Ships zero CSS.
 *
 * Behavior:
 * - On connect, the first light-DOM child matching the native tag is adopted;
 *   one is created and appended when absent. The native element is the source
 *   of truth for the text value.
 * - `value` is exposed as a read signal; `setValue()` writes the native value
 *   + signal and reflects the host `value` attribute (the dialog open-attr
 *   reflection pattern). Native `input` events sync the signal and dispatch a
 *   `value-change` CustomEvent (detail `{ value }`, bubbles, composed) from
 *   the HOST. Typing does NOT rewrite the host attribute (native parity — the
 *   attribute mirrors programmatic state, not keystrokes).
 * - `default-value` seeds the native value ONCE on first connect, only when
 *   the native value is empty. Never reflected.
 * - Per-subclass `FORWARDED` host attributes are copied onto the native child
 *   when present on the host (and kept in sync on change). Attributes the
 *   consumer pre-set on a pre-supplied native child are NOT clobbered unless
 *   the host attribute is present.
 * - Ownership rule: `<aihu-form-control>` owns `aria-*` on the control (its
 *   selector finds the inner native element); Input/Textarea own the NATIVE
 *   PROPS — merged disabled/required (own attribute ∥ inherited
 *   formControlContext) are written as `native.disabled` / `native.required`,
 *   never as `aria-*`.
 * - `data-state` on the host reflects `'disabled' | 'readonly' | 'idle'`.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { injectValue } from '../dom-context.ts'
import { type FormControlContextValue, formControlContext } from '../form-control/index.ts'

/** Labelling ARIA forwarded host → native control (and stripped from host). */
const ARIA_LABELLING = ['aria-label', 'aria-labelledby', 'aria-describedby'] as const

/** Host attributes every text control observes (subclasses append FORWARDED). */
export const TEXT_CONTROL_OBSERVED: readonly string[] = [
  'value',
  'default-value',
  'disabled',
  'required',
]

export abstract class AihuTextControlBase extends HTMLElement {
  /** Host attributes forwarded to the native child — supplied per subclass. */
  protected static readonly FORWARDED: readonly string[] = []

  /** The native tag this control wraps. */
  protected abstract readonly nativeTag: 'input' | 'textarea'

  private readonly _value = signal('')
  private readonly _disabled = signal(false)
  private readonly _required = signal(false)
  private readonly _readonly = signal(false)
  private _fc: FormControlContextValue | null = null
  private _disposers: Array<() => void> = []
  private _native: HTMLInputElement | HTMLTextAreaElement | null = null
  private _connected = false
  private _defaultSeeded = false

  /** The current text value as a read signal. */
  get value(): Read<string> {
    return this._value[0]
  }

  /** The wrapped native element (null before first connect). */
  get nativeControl(): HTMLInputElement | HTMLTextAreaElement | null {
    return this._native
  }

  /** Programmatic write: native value + signal + reflected `value` attribute. */
  setValue(next: string): void {
    if (this._native) this._native.value = next
    this._value[1](next)
    // Reflect (dialog open-attr pattern). attributeChangedCallback sees an
    // already-equal signal and no-ops, so this cannot loop.
    this.setAttribute('value', next)
  }

  /** Focus delegates to the native child (the real interactive element). */
  override focus(options?: FocusOptions): void {
    this._native?.focus(options)
  }

  connectedCallback(): void {
    this._connected = true
    const native = this._findOrCreateNative()
    this._native = native

    // Forward host attributes that are PRESENT. A pre-supplied native child's
    // own attributes are respected when the host attribute is absent.
    for (const attr of this._forwarded()) {
      const v = this.getAttribute(attr)
      if (v !== null) native.setAttribute(attr, v)
    }

    // Labelling ARIA belongs on the NATIVE control: a roleless host carrying
    // `aria-label` is itself prohibited (axe `aria-prohibited-attr`), and the
    // name would never reach the real form element (axe `label`). Move
    // aria-label / aria-labelledby / aria-describedby host → native and strip
    // from the host so the accessible name lands where the control lives.
    for (const attr of ARIA_LABELLING) {
      const v = this.getAttribute(attr)
      if (v !== null) {
        native.setAttribute(attr, v)
        this.removeAttribute(attr)
      }
    }

    // Value precedence: host `value` attribute wins; otherwise `default-value`
    // seeds ONCE, and only when the native value is empty.
    const valueAttr = this.getAttribute('value')
    if (valueAttr !== null) {
      native.value = valueAttr
    } else if (!this._defaultSeeded) {
      const dv = this.getAttribute('default-value')
      if (dv !== null && native.value === '') native.value = dv
    }
    this._defaultSeeded = true
    this._value[1](native.value)

    this._syncFromAttrs()

    // Inherit disabled/required from a FormControlContext ancestor, if any.
    try {
      this._fc = injectValue(this, formControlContext)
    } catch {
      this._fc = null
    }

    native.addEventListener('input', this._onNativeInput)

    this._disposers.push(
      effect(() => {
        const disabled = this._effectiveDisabled()
        // Ownership: form-control owns aria-* on the control; Input/Textarea
        // own the native props (real semantics + native form behavior).
        native.disabled = disabled
        native.required = this._effectiveRequired()
        this.setAttribute(
          'data-state',
          disabled ? 'disabled' : this._readonly[0]() ? 'readonly' : 'idle',
        )
      }),
    )
  }

  disconnectedCallback(): void {
    this._connected = false
    this._native?.removeEventListener('input', this._onNativeInput)
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'disabled':
        this._disabled[1](value !== null)
        return
      case 'required':
        this._required[1](value !== null)
        return
      case 'default-value':
        // Read once on connect — never reactive, never reflected.
        return
      case 'value':
        // Before connect, connectedCallback derives the value from attributes.
        if (!this._connected) return
        if (value !== null && value !== this._value[0]()) {
          if (this._native) this._native.value = value
          this._value[1](value)
        }
        return
    }
    // Forwarded attributes (includes `readonly`, which also drives data-state).
    if (name === 'readonly') this._readonly[1](value !== null)
    if (!this._connected || !this._native) return
    if (this._forwarded().includes(name)) {
      if (value !== null) this._native.setAttribute(name, value)
      else this._native.removeAttribute(name)
    }
  }

  private _forwarded(): readonly string[] {
    return (this.constructor as typeof AihuTextControlBase).FORWARDED
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
    this._readonly[1](this.hasAttribute('readonly'))
  }

  private _findOrCreateNative(): HTMLInputElement | HTMLTextAreaElement {
    const tag = this.nativeTag.toUpperCase()
    for (const child of Array.from(this.children)) {
      if (child.tagName === tag) return child as HTMLInputElement | HTMLTextAreaElement
    }
    const created = document.createElement(this.nativeTag)
    this.appendChild(created)
    return created
  }

  private readonly _onNativeInput = (): void => {
    const native = this._native
    if (!native) return
    this._value[1](native.value)
    this.dispatchEvent(
      new CustomEvent<{ value: string }>('value-change', {
        detail: { value: native.value },
        bubbles: true,
        composed: true,
      }),
    )
  }
}
