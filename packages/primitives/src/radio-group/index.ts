/**
 * Headless radio group — `<aihu-radio-group-root>` (state owner, EXTENDS
 * `AihuRovingFocus`) + `<aihu-radio-group-item>` (role="radio") +
 * presentational `<aihu-radio-group-indicator>`. Implements the WAI-ARIA APG
 * **Radio Group** pattern: `role="radiogroup"` on the root, roving tabindex
 * across the items (exactly one `tabindex="0"`), arrow keys move focus AND
 * select (orientation defaults to `"both"`, loop defaults ON for the APG
 * wrap), Space selects an unchecked item, Enter does NOT activate. Emits NO
 * CSS — each piece reflects `data-state="checked" | "unchecked"`
 * (+ `data-disabled` presence) for the consumer to style.
 *
 * Form participation rides `attachHiddenInput` (ONE root-owned
 * visually-hidden native radio in the root's light DOM): submits
 * `name → value` only when a selection exists — no selection submits nothing
 * (native parity).
 *
 * `value-change` (detail `{ value: string }`, bubbles, composed) is dispatched
 * on USER-driven selection only (clicks/keys via the roving `setCurrent`
 * path) — programmatic `setValue()` / attribute writes do not emit (checkbox
 * precedent).
 */

import { effect, type Read, signal, untrack } from '@aihu/signals'
import { type CollectionContextValue, collectionContext } from '../collection/index.ts'
import { createDomContext, injectValue, provideContext } from '../dom-context.ts'
import {
  attachHiddenInput,
  type FormControlContextValue,
  formControlContext,
} from '../form-control/index.ts'
import { HTMLElementBase } from '../html-element-base.ts'
import { AihuRovingFocus } from '../roving-focus/index.ts'

export interface RadioGroupContextValue {
  /** Currently selected item value; null when nothing is selected. */
  readonly value: Read<string | null>
  /** Group-effective disabled (own attribute ∥ inherited form-control). */
  readonly disabled: Read<boolean>
  readonly required: Read<boolean>
  /** Programmatic write: signal + reflected `value` attribute. NO event. */
  setValue(next: string | null): void
  /** USER-driven selection of `item` (click path): moves the tab stop to the
   * item WITHOUT stealing focus, selects its value, emits `value-change`. */
  selectItem(item: Element): void
}

export const radioGroupContext = createDomContext<RadioGroupContextValue>('radio-group')

/** Per-item context so `<aihu-radio-group-indicator>` mirrors its OWN item
 * (nearest-provider-wins walk lands on the enclosing item, not the root). */
export interface RadioGroupItemContextValue {
  readonly checked: Read<boolean>
  readonly disabled: Read<boolean>
}

export const radioGroupItemContext =
  createDomContext<RadioGroupItemContextValue>('radio-group-item')

export class AihuRadioGroupRoot extends AihuRovingFocus {
  static override readonly observedAttributes = [
    ...AihuRovingFocus.observedAttributes,
    'value',
    'default-value',
    'name',
    'disabled',
    'required',
  ]

  private readonly _value = signal<string | null>(null)
  private readonly _name = signal<string | null>(null)
  private readonly _groupDisabled = signal(false)
  private readonly _required = signal(false)
  private _fc: FormControlContextValue | null = null
  private _rgDisposers: Array<() => void> = []
  private _defaultSeeded = false

  constructor() {
    super()
    provideContext(this, radioGroupContext, {
      value: this._value[0],
      disabled: () => this._effectiveDisabled(),
      required: () => this._effectiveRequired(),
      setValue: (next) => this.setValue(next),
      selectItem: (item) => this._selectItem(item),
    })
  }

  get value(): Read<string | null> {
    return this._value[0]
  }

  /** Programmatic write: signal + reflected `value` attribute (two-way,
   * dialog open-attr pattern). Does NOT emit `value-change`. */
  setValue(next: string | null): void {
    if (next === this._value[0]()) return
    this._value[1](next)
    if (next === null) this.removeAttribute('value')
    else this.setAttribute('value', next)
  }

  /** Move the roving current index. With `focus = true` (the base keyboard
   * path — arrows/Home/End) this ALSO selects the landed item's value (APG:
   * moving focus in a radio group selects). `focus = false` moves the tab
   * stop silently and never selects. */
  override setCurrent(index: number, focus = true): void {
    super.setCurrent(index, focus)
    if (!focus) return
    const item = this.items()[this.currentIndex()]
    const v = item?.getAttribute('value') ?? null
    if (v === null) return // value-less items are focusable but unselectable
    this._userSelect(v)
  }

  override connectedCallback(): void {
    // APG defaults when the consumer set nothing: all four arrows work and
    // navigation wraps. Reflecting the attribute routes through the base's
    // attributeChangedCallback, so the base signals stay in sync.
    if (!this.hasAttribute('orientation')) this.setAttribute('orientation', 'both')
    if (!this.hasAttribute('loop')) this.setAttribute('loop', '')

    // Initial selection: the `value` attribute wins; otherwise `default-value`
    // seeds ONCE (signal only — never reflected). Checkbox precedent.
    if (this.hasAttribute('value')) {
      this._value[1](this.getAttribute('value'))
    } else if (!this._defaultSeeded && this.hasAttribute('default-value')) {
      this._value[1](this.getAttribute('default-value'))
    }
    this._defaultSeeded = true
    this._syncOwnAttrs()

    if (!this.hasAttribute('role')) this.setAttribute('role', 'radiogroup')
    // Discoverable by an ancestor <aihu-form-control> ([data-fc-control] is
    // first in its control selector, so the ROOT wins over the hidden input).
    this.setAttribute('data-fc-control', '')

    try {
      this._fc = injectValue(this, formControlContext)
    } catch {
      this._fc = null
    }

    super.connectedCallback()

    this._rgDisposers.push(
      // Group-level ARIA is root-owned. form-control also writes
      // aria-required/aria-disabled onto [data-fc-control], but this effect
      // tracks the SAME fc signals and re-asserts the effective (own ∥ fc)
      // superset — see accessibility.md.
      effect(() => {
        if (this._effectiveRequired()) this.setAttribute('aria-required', 'true')
        else this.removeAttribute('aria-required')
        if (this._effectiveDisabled()) {
          this.setAttribute('aria-disabled', 'true')
          this.setAttribute('data-disabled', '')
        } else {
          this.removeAttribute('aria-disabled')
          this.removeAttribute('data-disabled')
        }
      }),
      // Tab-stop-follows-checked: when a checked item exists and the current
      // tab stop is elsewhere, move the tab stop WITHOUT focusing (no focus
      // steal at mount). With nothing checked the base default (item 0) holds.
      effect(() => {
        const items = this.items()
        const v = this._value[0]()
        if (v === null) return
        const idx = items.findIndex((el) => el.getAttribute('value') === v)
        if (idx < 0) return
        // untrack: this effect WRITES currentIndex (via setCurrent), so its
        // read must not be a tracked dependency (circular-write guard).
        untrack(() => {
          if (idx !== this.currentIndex()) this.setCurrent(idx, false)
        })
      }),
      // ONE root-owned hidden radio: no selection ⇒ unchecked ⇒ submits
      // nothing (native parity).
      attachHiddenInput(this, {
        type: 'radio',
        name: this._name[0],
        value: () => this._value[0]() ?? '',
        checked: () => this._value[0]() !== null,
        required: () => this._effectiveRequired(),
        disabled: () => this._effectiveDisabled(),
      }),
    )
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    for (const d of this._rgDisposers) d()
    this._rgDisposers = []
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    switch (name) {
      case 'value':
        this._value[1](value)
        break
      case 'name':
        this._name[1](value)
        break
      case 'disabled':
        this._groupDisabled[1](value !== null)
        break
      case 'required':
        this._required[1](value !== null)
        break
      case 'default-value':
        // Read once on connect — never reactive.
        break
      default:
        // orientation / loop / dir belong to the roving base.
        super.attributeChangedCallback(name, old, value)
    }
  }

  private _effectiveDisabled(): boolean {
    if (this._groupDisabled[0]()) return true
    return this._fc ? this._fc.disabled() : false
  }

  private _effectiveRequired(): boolean {
    if (this._required[0]()) return true
    return this._fc ? this._fc.required() : false
  }

  private _syncOwnAttrs(): void {
    this._groupDisabled[1](this.hasAttribute('disabled'))
    this._required[1](this.hasAttribute('required'))
    this._name[1](this.getAttribute('name'))
  }

  private _selectItem(item: Element): void {
    if (this._effectiveDisabled()) return
    const idx = this.items().indexOf(item)
    // Click already focuses the item naturally — move the tab stop only.
    if (idx >= 0) this.setCurrent(idx, false)
    const v = item.getAttribute('value')
    if (v !== null) this._userSelect(v)
  }

  private _userSelect(v: string): void {
    if (this._effectiveDisabled()) return
    if (v === this._value[0]()) return
    this.setValue(v)
    this.dispatchEvent(
      new CustomEvent<{ value: string }>('value-change', {
        detail: { value: v },
        bubbles: true,
        composed: true,
      }),
    )
  }
}

export class AihuRadioGroupItem extends HTMLElementBase {
  static readonly observedAttributes = ['value', 'disabled']

  private readonly _itemValue = signal<string | null>(null)
  private readonly _disabled = signal(false)
  private _ctx: RadioGroupContextValue | null = null
  private _collection: CollectionContextValue | null = null
  private _unregister: (() => void) | null = null
  private _disposers: Array<() => void> = []

  constructor() {
    super()
    provideContext(this, radioGroupItemContext, {
      checked: () => this._checked(),
      disabled: () => this._effectiveDisabled(),
    })
  }

  connectedCallback(): void {
    this._itemValue[1](this.getAttribute('value'))
    this._disabled[1](this.hasAttribute('disabled'))
    if (!this.hasAttribute('role')) this.setAttribute('role', 'radio')

    try {
      this._ctx = injectValue(this, radioGroupContext)
    } catch {
      this._ctx = null
    }
    try {
      this._collection = injectValue(this, collectionContext)
    } catch {
      this._collection = null
    }

    this.addEventListener('keydown', this._onKeydown)
    // Capture so disabled suppression beats consumer handlers (checkbox/button
    // precedent).
    this.addEventListener('click', this._onClickCapture, true)

    this._disposers.push(
      effect(() => {
        const checked = this._checked()
        this.setAttribute('aria-checked', checked ? 'true' : 'false')
        this.setAttribute('data-state', checked ? 'checked' : 'unchecked')
        if (this._effectiveDisabled()) {
          // Item-level aria-disabled is item-owned: form-control targets the
          // ROOT ([data-fc-control]), never the items (see accessibility.md).
          this.setAttribute('aria-disabled', 'true')
          this.setAttribute('data-disabled', '')
        } else {
          this.removeAttribute('aria-disabled')
          this.removeAttribute('data-disabled')
        }
      }),
      // Roving registration tracks disabled: a disabled item leaves the
      // collection so arrows skip it entirely; re-enabling re-registers.
      effect(() => {
        if (this._effectiveDisabled()) {
          this._unregister?.()
          this._unregister = null
          this.setAttribute('tabindex', '-1')
        } else if (this._unregister === null && this._collection !== null) {
          this._unregister = this._collection.register(this)
        }
      }),
    )
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeydown)
    this.removeEventListener('click', this._onClickCapture, true)
    this._unregister?.()
    this._unregister = null
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'value') this._itemValue[1](value)
    if (name === 'disabled') this._disabled[1](value !== null)
  }

  private _checked(): boolean {
    const v = this._itemValue[0]()
    return v !== null && this._ctx !== null && this._ctx.value() === v
  }

  private _effectiveDisabled(): boolean {
    if (this._disabled[0]()) return true
    return this._ctx ? this._ctx.disabled() : false
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter') {
      // APG: Enter does NOT activate a radio (reserved for form submission).
      ev.preventDefault()
      return
    }
    if (ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault() // stop page scroll
      if (this._effectiveDisabled()) return
      // APG: Space selects the focused item when unchecked (no toggle-off).
      if (!this._checked()) this.click()
    }
  }

  private readonly _onClickCapture = (ev: Event): void => {
    if (this._effectiveDisabled()) {
      ev.preventDefault()
      ev.stopImmediatePropagation()
      return
    }
    this._ctx?.selectItem(this)
  }
}

/** Presentational styling hook: mirrors its enclosing ITEM's state (nearest
 * `radioGroupItemContext` provider), hidden from AT. */
export class AihuRadioGroupIndicator extends HTMLElementBase {
  private _disposers: Array<() => void> = []

  connectedCallback(): void {
    const ctx = injectValue(this, radioGroupItemContext)
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
  ['aihu-radio-group-root', AihuRadioGroupRoot],
  ['aihu-radio-group-item', AihuRadioGroupItem],
  ['aihu-radio-group-indicator', AihuRadioGroupIndicator],
]

let _defined = false
/** Register all radio-group custom elements (idempotent). */
export function defineRadioGroup(): void {
  if (_defined) return
  for (const [tag, ctor] of REGISTRY) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
  _defined = true
}
