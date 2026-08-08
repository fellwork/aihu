/**
 * `<aihu-roving-focus>` — WAI-ARIA roving-tabindex container. Exactly one item
 * carries `tabindex="0"` (the current); all others `tabindex="-1"`. Arrow keys
 * move the current index (respecting `orientation` + `loop` + RTL `dir`),
 * Home/End jump to the first/last item, and `element.focus()` follows. It
 * imposes NO role (the consumer sets `role="toolbar"`/`"menu"`/etc.) and ships
 * NO CSS.
 *
 * Items are enumerated via the `collection` substrate (Task 8): each focusable
 * descendant registers itself; the container reuses `createCollection()` so
 * item order tracks the DOM.
 *
 * Reflected attributes: `orientation` (`"horizontal" | "vertical" | "both"`),
 * `loop` (boolean), `dir` (`"ltr" | "rtl"` — inherited from a `config-provider`
 * ancestor if present).
 * Owned signals: `currentIndex`, `items` (from the collection), `activeId`
 * (computed).
 */

import { computed, effect, type Read, signal } from '@aihu/signals'
import { collectionContext, createCollection } from '../collection/index.ts'
import { configContext, type Direction } from '../config-provider/index.ts'
import { injectValue, provideContext } from '../dom-context.ts'
import { HTMLElementBase } from '../html-element-base.ts'

export type Orientation = 'horizontal' | 'vertical' | 'both'

export class AihuRovingFocus extends HTMLElementBase {
  static readonly observedAttributes = ['orientation', 'loop', 'dir']

  private readonly _collection = createCollection()
  private readonly _currentIndex = signal(0)
  private readonly _loop = signal(false)
  private readonly _orientation = signal<Orientation>('horizontal')
  private readonly _dirAttr = signal<Direction | null>(null)

  readonly activeId: Read<string | null>

  private _disposers: Array<() => void> = []

  get currentIndex(): Read<number> {
    return this._currentIndex[0]
  }
  get items(): Read<Element[]> {
    return this._collection.items
  }

  constructor() {
    super()
    // Reuse the collection substrate for descendant enumeration.
    provideContext(this, collectionContext, this._collection)
    this.activeId = computed(() => {
      const items = this._collection.items()
      const el = items[this._currentIndex[0]()]
      return el ? el.id || null : null
    })
  }

  connectedCallback(): void {
    this._syncFromAttrs()
    this.addEventListener('keydown', this._onKeydown)

    // Stamp roving tabindex whenever items or currentIndex change.
    this._disposers.push(
      effect(() => {
        const items = this._collection.items()
        const current = this._currentIndex[0]()
        items.forEach((el, i) => {
          el.setAttribute('tabindex', i === current ? '0' : '-1')
        })
      }),
    )
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeydown)
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'orientation':
        if (value === 'horizontal' || value === 'vertical' || value === 'both')
          this._orientation[1](value)
        break
      case 'loop':
        this._loop[1](value !== null)
        break
      case 'dir':
        this._dirAttr[1](value === 'rtl' ? 'rtl' : value === 'ltr' ? 'ltr' : null)
        break
    }
  }

  /** Register a focusable descendant; returns an unregister disposer. */
  register(el: Element): () => void {
    return this._collection.register(el)
  }

  /** Move the current index to `index` (clamped/looped) and focus the item.
   * Pass `focus = false` to move the tab stop (tabindex bookkeeping) without
   * focusing the element. */
  setCurrent(index: number, focus = true): void {
    const items = this._collection.items()
    if (items.length === 0) return
    let next = index
    if (this._loop[0]()) {
      next = ((index % items.length) + items.length) % items.length
    } else {
      next = Math.max(0, Math.min(items.length - 1, index))
    }
    this._currentIndex[1](next)
    if (focus) (items[next] as HTMLElement).focus?.()
  }

  /** Resolve the effective direction (own attr, else nearest config-provider). */
  private _direction(): Direction {
    const own = this._dirAttr[0]()
    if (own) return own
    try {
      return injectValue(this, configContext).dir()
    } catch {
      return 'ltr'
    }
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    const orientation = this._orientation[0]()
    const horizontal = orientation === 'horizontal' || orientation === 'both'
    const vertical = orientation === 'vertical' || orientation === 'both'
    const rtl = this._direction() === 'rtl'
    const current = this._currentIndex[0]()

    let handled = true
    switch (ev.key) {
      case 'ArrowRight':
        if (horizontal) this.setCurrent(current + (rtl ? -1 : 1))
        else handled = false
        break
      case 'ArrowLeft':
        if (horizontal) this.setCurrent(current + (rtl ? 1 : -1))
        else handled = false
        break
      case 'ArrowDown':
        if (vertical) this.setCurrent(current + 1)
        else handled = false
        break
      case 'ArrowUp':
        if (vertical) this.setCurrent(current - 1)
        else handled = false
        break
      case 'Home':
        this.setCurrent(0)
        break
      case 'End':
        this.setCurrent(this._collection.items().length - 1)
        break
      default:
        handled = false
    }
    if (handled) ev.preventDefault()
  }

  private _syncFromAttrs(): void {
    const o = this.getAttribute('orientation')
    if (o === 'horizontal' || o === 'vertical' || o === 'both') this._orientation[1](o)
    this._loop[1](this.hasAttribute('loop'))
    const dir = this.getAttribute('dir')
    this._dirAttr[1](dir === 'rtl' ? 'rtl' : dir === 'ltr' ? 'ltr' : null)
  }
}

let _defined = false
/** Register `<aihu-roving-focus>` (idempotent; a no-op without a DOM). */
export function defineRovingFocus(tag = 'aihu-roving-focus'): void {
  // No DOM, no registry to register INTO — a documented no-op. See
  // `html-element-base.ts` §"Registration without a DOM".
  if (typeof customElements === 'undefined') return
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuRovingFocus)
  _defined = true
}
