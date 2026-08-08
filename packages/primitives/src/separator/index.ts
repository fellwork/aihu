/**
 * `<aihu-separator>` — headless separator (WAI-ARIA APG Separator, static
 * variant). Renders nothing and ships NO CSS: it emits role + ARIA +
 * `data-orientation` for the consumer to style.
 *
 * Behavior:
 * - `role="separator"` unless `decorative` is present, in which case
 *   `role="none"` (the element is purely visual and removed from the
 *   accessibility tree). A consumer-supplied `role` attribute is respected
 *   for the non-decorative case.
 * - `aria-orientation="vertical"` ONLY when `orientation="vertical"` —
 *   horizontal is the ARIA default for separators, so the attribute is
 *   removed for horizontal (Radix parity).
 * - `data-orientation` always reflects the effective orientation.
 * - Static (non-focusable, no keyboard handlers): the APG focusable-separator
 *   variant (window splitter) is out of scope.
 *
 * Reflected attributes: `orientation` (`"horizontal"` default | `"vertical"`),
 * `decorative` (boolean presence). Both are reactive at runtime.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { HTMLElementBase } from '../html-element-base.ts'

export type SeparatorOrientation = 'horizontal' | 'vertical'

export class AihuSeparator extends HTMLElementBase {
  static readonly observedAttributes = ['orientation', 'decorative']

  private readonly _orientation = signal<SeparatorOrientation>('horizontal')
  private readonly _decorative = signal(false)
  private _disposers: Array<() => void> = []

  /** Consumer-supplied `role` captured on first connect (never overridden
   * while non-decorative). */
  private _consumerRole: string | null = null
  private _roleCaptured = false

  get orientation(): Read<SeparatorOrientation> {
    return this._orientation[0]
  }
  get decorative(): Read<boolean> {
    return this._decorative[0]
  }

  connectedCallback(): void {
    this._syncFromAttrs()

    if (!this._roleCaptured) {
      this._consumerRole = this.getAttribute('role')
      this._roleCaptured = true
    }

    this._disposers.push(
      effect(() => {
        const decorative = this._decorative[0]()
        const orientation = this._orientation[0]()

        this.setAttribute('role', decorative ? 'none' : (this._consumerRole ?? 'separator'))

        // Horizontal is the ARIA default for separators — only stamp the
        // attribute when vertical (and never on a decorative separator).
        if (!decorative && orientation === 'vertical') {
          this.setAttribute('aria-orientation', 'vertical')
        } else {
          this.removeAttribute('aria-orientation')
        }

        this.setAttribute('data-orientation', orientation)
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'orientation':
        this._orientation[1](value === 'vertical' ? 'vertical' : 'horizontal')
        break
      case 'decorative':
        this._decorative[1](value !== null)
        break
    }
  }

  private _syncFromAttrs(): void {
    this._orientation[1](
      this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal',
    )
    this._decorative[1](this.hasAttribute('decorative'))
  }
}

let _defined = false
/** Register `<aihu-separator>` (idempotent; a no-op without a DOM). */
export function defineSeparator(tag = 'aihu-separator'): void {
  // No DOM, no registry to register INTO — a documented no-op. See
  // `html-element-base.ts` §"Registration without a DOM".
  if (typeof customElements === 'undefined') return
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuSeparator)
  _defined = true
}
