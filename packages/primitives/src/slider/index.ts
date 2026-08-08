/**
 * Headless slider — `<aihu-slider-root>`. Implements the WAI-ARIA APG
 * **Slider** pattern (https://www.w3.org/WAI/ARIA/apg/patterns/slider/):
 * `role="slider"`, `aria-valuemin`/`aria-valuemax`/`aria-valuenow` reflected
 * on the host, `aria-orientation` (default `"horizontal"`), `tabindex="0"`.
 *
 * SINGLE-THUMB ONLY — deliberately minimal (performativeUI port, Track B
 * Slice 5): the registry's `before-after` comparison-slider recipe only needs
 * one divider position, so this primitive does not implement a dual-thumb
 * range. Not form-associated: a comparison-slider divider position isn't
 * form data in this primitive's scope (see accessibility.md).
 *
 * Attributes (all in `observedAttributes`): `min` (default `"0"`), `max`
 * (default `"100"`), `value` (default `"50"`), `step` (default `"1"`),
 * `disabled`.
 *
 * Keyboard: ArrowLeft/ArrowDown decrement by `step`; ArrowRight/ArrowUp
 * increment by `step`; Home -> min; End -> max; PageUp/PageDown -> step * 10
 * (clamped to [min, max]). Recognized keys `preventDefault()` — suppressed
 * entirely (no preventDefault, no value change) when disabled.
 *
 * Pointer: `pointerdown` on the host begins a drag tracked via
 * `pointermove`/`pointerup` listeners added to `document` (removed on
 * pointerup/disconnect), computing value from pointer X position relative to
 * `this.getBoundingClientRect()`, clamped to [min, max] and rounded to the
 * nearest `step`.
 *
 * Events: `value-change` (detail `{ value: number }`, bubbles, composed) is
 * dispatched on USER-driven changes only (drag + keyboard) — mirrors switch's
 * `checked-change` convention. `setValue()` does the signal + attribute write
 * and does NOT itself emit; only the internal pointer/keyboard handlers emit,
 * after calling `setValue()` and observing the value actually changed.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, provideContext } from '../dom-context.ts'
import { HTMLElementBase } from '../html-element-base.ts'

export interface SliderContextValue {
  readonly value: Read<number>
  readonly min: Read<number>
  readonly max: Read<number>
  readonly step: Read<number>
  readonly disabled: Read<boolean>
}

export const sliderContext = createDomContext<SliderContextValue>('slider')

export class AihuSliderRoot extends HTMLElementBase {
  static readonly observedAttributes = ['min', 'max', 'value', 'step', 'disabled']

  private readonly _min = signal(0)
  private readonly _max = signal(100)
  private readonly _step = signal(1)
  private readonly _value = signal(50)
  private readonly _disabled = signal(false)
  private _dragging = false
  private _disposers: Array<() => void> = []
  // Reentrancy guard for _reflectValueAttr — see that method's doc comment.
  private _reflectingValue = false
  // Set at the end of connectedCallback, after _syncFromAttrs() has done the
  // ONE clean settle pass using fully-populated min/max/step/value. See
  // _reclamp()'s doc comment for why min/max/step-triggered reflection is
  // suppressed before this is true.
  private _ready = false

  constructor() {
    super()
    provideContext(this, sliderContext, {
      value: this._value[0],
      min: this._min[0],
      max: this._max[0],
      step: this._step[0],
      disabled: this._disabled[0],
    })
  }

  get value(): Read<number> {
    return this._value[0]
  }

  /** Programmatic write: signal + reflected `value` attribute (two-way,
   * dialog open-attr pattern). Clamps to [min, max] and rounds to the
   * nearest `step`. Does NOT emit `value-change`. */
  setValue(next: number): void {
    const clamped = this._clampRound(next)
    if (clamped === this._value[0]()) return
    this._value[1](clamped)
    this.setAttribute('value', String(clamped))
  }

  connectedCallback(): void {
    this._syncFromAttrs()
    this._ready = true

    if (!this.hasAttribute('role')) this.setAttribute('role', 'slider')
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0')
    if (!this.hasAttribute('aria-orientation')) this.setAttribute('aria-orientation', 'horizontal')

    this.addEventListener('keydown', this._onKeydown)
    this.addEventListener('pointerdown', this._onPointerDown)

    this._disposers.push(
      effect(() => {
        this.setAttribute('aria-valuemin', String(this._min[0]()))
        this.setAttribute('aria-valuemax', String(this._max[0]()))
        this.setAttribute('aria-valuenow', String(this._value[0]()))
        if (this._disabled[0]()) this.setAttribute('data-disabled', '')
        else this.removeAttribute('data-disabled')
      }),
    )
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeydown)
    this.removeEventListener('pointerdown', this._onPointerDown)
    this._endDrag()
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'min':
        this._min[1](this._parseNum(value, 0))
        this._reclamp()
        break
      case 'max':
        this._max[1](this._parseNum(value, 100))
        this._reclamp()
        break
      case 'step': {
        const s = this._parseNum(value, 1)
        this._step[1](s > 0 ? s : 1)
        this._reclamp()
        break
      }
      case 'value': {
        const clamped = this._clampRound(this._parseNum(value, 50))
        this._value[1](clamped)
        // Same `_ready` gate as _reclamp() and for the same reason: during
        // initial multi-attribute markup this reaction can run against a
        // still-partial min/max/step, and _syncFromAttrs() (connectedCallback)
        // does the one correct reflect once every attribute has settled.
        // Post-connection (the actual Bug 2a scenario — a single
        // `setAttribute('value', …)` on an already-live slider) this always
        // reflects immediately, same as before.
        if (this._ready) this._reflectValueAttr(clamped)
        break
      }
      case 'disabled':
        this._disabled[1](value !== null)
        break
    }
  }

  // Reclamps the current value against the LATEST min/max/step (called from
  // attributeChangedCallback's 'min'/'max'/'step' branches). Attribute
  // reflection is deliberately suppressed until `_ready` (post-connection):
  // initial multi-attribute markup (e.g. `min="10" max="20" value="14"
  // step="2"`) enqueues one attributeChangedCallback reaction PER attribute,
  // and 'min'/'max' reactions run BEFORE the still-queued 'value'/'step'
  // reactions — reflecting mid-upgrade here would write intermediate,
  // wrong values (clamped against a PARTIALLY-populated min/max/step) into
  // the `value` attribute, based on empirically confirmed ordering, not
  // merely a theoretical concern. `_syncFromAttrs()` (called once at the end
  // of connectedCallback, by which point every initial attribute reaction
  // has already run) does the one correct settle pass using the FULLY
  // populated min/max/step/value and reflects it — see that method. Once
  // `_ready`, a min/max/step change is a single isolated attribute mutation
  // (no cascade), so reflecting immediately here is safe.
  private _reclamp(): void {
    const clamped = this._clampRound(this._value[0]())
    this._value[1](clamped)
    if (this._ready) this._reflectValueAttr(clamped)
  }

  /** Two-way `value` attribute reflection (accessibility.md contract), same
   * pattern as `AihuSwitchRoot.setChecked`'s `checked` reflection. Every path
   * that can CLAMP/STEP the value (a raw `setAttribute('value', …)`, or a
   * `min`/`max`/`step` change that reclamps the current value out from under
   * it) must write the STEPPED result back to the attribute, or the attribute
   * silently desyncs from `aria-valuenow` (Bug 2a).
   *
   * GUARDED, not merely "convergent": `setAttribute` here re-enters
   * `attributeChangedCallback` SYNCHRONOUSLY (jsdom, matching spec CEReactions
   * timing), and initial multi-attribute markup (e.g.
   * `min="10" max="20" value="14" step="2"`) enqueues one reaction per
   * attribute — 'min'/'max' reactions calling `_reclamp()` BEFORE the
   * queued-but-not-yet-run 'value'/'step' reactions can each independently
   * decide the value attribute is stale (each sees a different intermediate
   * min/max/step combination) and each write it again, and each write
   * re-enters this method. That cascade genuinely blew the call stack in
   * practice (RangeError, not a two-level bounce) — `_reflectingValue` caps
   * it to one active write: a reentrant call still updates the `_value`
   * signal (unconditional, above), it just never issues a second overlapping
   * `setAttribute`, which the OUTERMOST call is already in the middle of. */
  private _reflectValueAttr(clamped: number): void {
    if (this._reflectingValue) return
    const clampedStr = String(clamped)
    if (this.getAttribute('value') === clampedStr) return
    this._reflectingValue = true
    try {
      this.setAttribute('value', clampedStr)
    } finally {
      this._reflectingValue = false
    }
  }

  private _parseNum(raw: string | null, fallback: number): number {
    if (raw === null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  }

  private _clampRound(v: number): number {
    const min = this._min[0]()
    const max = this._max[0]()
    const step = this._step[0]() || 1
    const clamped = Math.min(max, Math.max(min, v))
    const steps = Math.round((clamped - min) / step)
    const rounded = min + steps * step
    return Math.min(max, Math.max(min, rounded))
  }

  private _syncFromAttrs(): void {
    this._min[1](this._parseNum(this.getAttribute('min'), 0))
    this._max[1](this._parseNum(this.getAttribute('max'), 100))
    const step = this._parseNum(this.getAttribute('step'), 1)
    this._step[1](step > 0 ? step : 1)
    this._disabled[1](this.hasAttribute('disabled'))
    const clamped = this._clampRound(this._parseNum(this.getAttribute('value'), 50))
    this._value[1](clamped)
    this._reflectValueAttr(clamped)
  }

  /** setValue() + emit `value-change` iff the clamped/rounded value actually
   * moved — the USER-driven path (keyboard + pointer). */
  private _userSetValue(next: number): void {
    const before = this._value[0]()
    this.setValue(next)
    const after = this._value[0]()
    if (after !== before) {
      this.dispatchEvent(
        new CustomEvent<{ value: number }>('value-change', {
          detail: { value: after },
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    // Disabled suppresses entirely — no preventDefault, no value change.
    if (this._disabled[0]()) return

    const step = this._step[0]()
    const bigStep = step * 10

    switch (ev.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        ev.preventDefault()
        this._userSetValue(this._value[0]() - step)
        return
      case 'ArrowRight':
      case 'ArrowUp':
        ev.preventDefault()
        this._userSetValue(this._value[0]() + step)
        return
      case 'PageDown':
        ev.preventDefault()
        this._userSetValue(this._value[0]() - bigStep)
        return
      case 'PageUp':
        ev.preventDefault()
        this._userSetValue(this._value[0]() + bigStep)
        return
      case 'Home':
        ev.preventDefault()
        this._userSetValue(this._min[0]())
        return
      case 'End':
        ev.preventDefault()
        this._userSetValue(this._max[0]())
        return
      default:
        return
    }
  }

  private readonly _onPointerDown = (ev: PointerEvent): void => {
    if (this._disabled[0]()) return
    ev.preventDefault()
    this._dragging = true
    this._updateFromPointerX(ev.clientX)
    document.addEventListener('pointermove', this._onPointerMove)
    document.addEventListener('pointerup', this._onPointerUp)
    document.addEventListener('pointercancel', this._onPointerCancel)
  }

  private readonly _onPointerMove = (ev: PointerEvent): void => {
    if (!this._dragging) return
    this._updateFromPointerX(ev.clientX)
  }

  private readonly _onPointerUp = (): void => {
    this._endDrag()
  }

  // Bug 2b: a touch-scroll steal, a right-click during drag, or the OS
  // cancelling the pointer (e.g. a system gesture) fires `pointercancel`
  // instead of `pointerup` — with only pointerup/pointermove bound, drag
  // tracking never ended: every subsequent page-wide pointermove kept
  // updating the value with the button up, and both document listeners
  // leaked until disconnect. Ends the drag exactly like pointerup.
  private readonly _onPointerCancel = (): void => {
    this._endDrag()
  }

  private _endDrag(): void {
    this._dragging = false
    document.removeEventListener('pointermove', this._onPointerMove)
    document.removeEventListener('pointerup', this._onPointerUp)
    document.removeEventListener('pointercancel', this._onPointerCancel)
  }

  private _updateFromPointerX(clientX: number): void {
    const rect = this.getBoundingClientRect()
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width
    const clampedRatio = Math.min(1, Math.max(0, ratio))
    const min = this._min[0]()
    const max = this._max[0]()
    this._userSetValue(min + clampedRatio * (max - min))
  }
}

const REGISTRY: Array<[string, CustomElementConstructor]> = [['aihu-slider-root', AihuSliderRoot]]

let _defined = false
/** Register all slider custom elements (idempotent). */
export function defineSlider(): void {
  if (_defined) return
  for (const [tag, ctor] of REGISTRY) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
  _defined = true
}
