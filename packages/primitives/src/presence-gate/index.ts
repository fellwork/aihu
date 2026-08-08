/**
 * `<aihu-presence-gate>` — headless mount/unmount gate with exit-animation hold
 * (the Radix `Presence` pattern). When `present` flips false the element keeps
 * its children mounted until any CSS transition/animation on the gate completes
 * (`transitionend`/`animationend`), then unmounts them. Emits NO CSS — the
 * consumer's exit animation drives the timing.
 *
 * Reflected attributes: `present` (boolean, controlled), `data-state`
 * (`"open" | "closed"`).
 * Owned signals: `present` (boolean), `mounted` (computed — true while open OR
 * while a closing transition runs).
 * Context: provides `presenceContext` carrying the `present` signal so
 * descendant pieces (e.g. `dialog-content`) can read presence reactively.
 * ARIA: none — structural gate only.
 */

import { computed, effect, type Read, signal } from '@aihu/signals'
import { createDomContext, provideContext } from '../dom-context.ts'
import { HTMLElementBase } from '../html-element-base.ts'

/** Context carrying the gate's `present` signal to descendants. */
export const presenceContext = createDomContext<Read<boolean>>('presence')

export class AihuPresenceGate extends HTMLElementBase {
  static readonly observedAttributes = ['present']

  private readonly _present = signal(false)
  private readonly _closing = signal(false)

  /** The `present` signal (read), exposed for the provided context + tests. */
  get present(): Read<boolean> {
    return this._present[0]
  }

  /** True while open OR while a closing animation is still running. */
  readonly mounted: Read<boolean>

  private _disposers: Array<() => void> = []
  private _stash: ChildNode[] = []
  /** Tears down the pending exit listeners; set while a close animation runs. */
  private _cancelExit: (() => void) | null = null

  constructor() {
    super()
    this.mounted = computed(() => this._present[0]() || this._closing[0]())
    provideContext(this, presenceContext, this._present[0])
  }

  connectedCallback(): void {
    this._setPresent(this.hasAttribute('present'))
    this._disposers.push(
      effect(() => {
        this.setAttribute('data-state', this._present[0]() ? 'open' : 'closed')
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'present') this._setPresent(value !== null)
  }

  private _setPresent(next: boolean): void {
    if (next === this._present[0]()) return
    this._present[1](next)
    if (next) {
      // Re-opening — cancel any in-flight exit so a stray transitionend can't
      // unmount the children we're keeping.
      this._cancelExit?.()
      this._closing[1](false)
      this._restoreChildren()
    } else {
      this._beginExit()
    }
  }

  /** Hold mounted children until the exit animation ends, then unmount. */
  private _beginExit(): void {
    this._closing[1](true)
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      teardown()
      this._closing[1](false)
      this._unmountChildren()
    }
    const teardown = (): void => {
      this.removeEventListener('transitionend', finish)
      this.removeEventListener('animationend', finish)
      this._cancelExit = null
    }
    this._cancelExit = (): void => {
      done = true
      teardown()
    }
    this.addEventListener('transitionend', finish)
    this.addEventListener('animationend', finish)
  }

  private _unmountChildren(): void {
    if (this._stash.length > 0) return
    this._stash = Array.from(this.childNodes)
    for (const n of this._stash) n.remove()
  }

  private _restoreChildren(): void {
    if (this._stash.length === 0) return
    for (const n of this._stash) this.appendChild(n)
    this._stash = []
  }
}

let _defined = false
/** Register `<aihu-presence-gate>` (idempotent — safe to call repeatedly). */
export function definePresenceGate(tag = 'aihu-presence-gate'): void {
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuPresenceGate)
  _defined = true
}
