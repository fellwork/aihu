/**
 * Headless tooltip — `<aihu-tooltip-root>` + `<aihu-tooltip-trigger>` +
 * `<aihu-tooltip-content>`. Implements the WAI-ARIA APG
 * [Tooltip](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) pattern: the
 * trigger is `aria-describedby` the tooltip (NOT labelled-by), the content has
 * `role="tooltip"` and is not focusable, and Escape dismisses.
 *
 * Placement REUSES the Plan 3 `position()` shim from
 * `@aihu/css-engine/runtime/progressive` — tooltip contains NO positioning math
 * of its own and adds NO floating-ui dependency.
 *
 * Root attributes (reflected): `open` (boolean), `open-delay`/`close-delay`
 * (ms, default 700/300), `placement` (`"top"|"bottom"|"left"|"right"`).
 * Root signals: `open`, `coords` (computed position written by the shim).
 */

import { type Placement, position } from '@aihu/css-engine/runtime/progressive'
import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, injectContext, provideContext } from '../dom-context.ts'

export interface TooltipCoords {
  x: number
  y: number
  placement: Placement
}

export interface TooltipContextValue {
  readonly open: Read<boolean>
  readonly contentId: Read<string>
  readonly placement: Read<Placement>
  readonly openDelay: Read<number>
  readonly closeDelay: Read<number>
  setOpen(next: boolean): void
  /** Schedule open/close honoring the configured delays. */
  scheduleOpen(): void
  scheduleClose(): void
  /** Immediate dismiss (Escape). */
  dismiss(): void
  registerTrigger(el: Element): void
  triggerEl(): Element | null
}

export const tooltipContext = createDomContext<TooltipContextValue>('tooltip')

let _idSeq = 0
const uid = (): string => `aihu-tooltip-${(_idSeq += 1)}`

export class AihuTooltipRoot extends HTMLElement {
  static readonly observedAttributes = ['open', 'open-delay', 'close-delay', 'placement']

  private readonly _open = signal(false)
  private readonly _contentId = signal(uid())
  private readonly _placement = signal<Placement>('bottom')
  private readonly _openDelay = signal(700)
  private readonly _closeDelay = signal(300)
  private _trigger: Element | null = null
  private _openTimer: ReturnType<typeof setTimeout> | null = null
  private _closeTimer: ReturnType<typeof setTimeout> | null = null
  private _disposers: Array<() => void> = []
  private _ctx: TooltipContextValue

  constructor() {
    super()
    this._ctx = {
      open: this._open[0],
      contentId: this._contentId[0],
      placement: this._placement[0],
      openDelay: this._openDelay[0],
      closeDelay: this._closeDelay[0],
      setOpen: (n) => this._setOpen(n),
      scheduleOpen: () => this._scheduleOpen(),
      scheduleClose: () => this._scheduleClose(),
      dismiss: () => this._setOpen(false),
      registerTrigger: (el) => {
        this._trigger = el
      },
      triggerEl: () => this._trigger,
    }
    provideContext(this, tooltipContext, this._ctx)
  }

  get open(): Read<boolean> {
    return this._open[0]
  }

  connectedCallback(): void {
    this._syncFromAttrs()
    this._disposers.push(
      effect(() => {
        this.setAttribute('data-state', this._open[0]() ? 'open' : 'closed')
      }),
    )
  }

  disconnectedCallback(): void {
    this._clearTimers()
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'open':
        this._setOpen(value !== null)
        break
      case 'open-delay':
        if (value !== null) this._openDelay[1](Number(value))
        break
      case 'close-delay':
        if (value !== null) this._closeDelay[1](Number(value))
        break
      case 'placement':
        if (isPlacement(value)) this._placement[1](value)
        break
    }
  }

  private _setOpen(next: boolean): void {
    this._clearTimers()
    if (next === this._open[0]()) return
    this._open[1](next)
    if (next) this.setAttribute('open', '')
    else this.removeAttribute('open')
  }

  private _scheduleOpen(): void {
    this._clearTimers()
    this._openTimer = setTimeout(() => this._setOpen(true), this._openDelay[0]())
  }

  private _scheduleClose(): void {
    this._clearTimers()
    this._closeTimer = setTimeout(() => this._setOpen(false), this._closeDelay[0]())
  }

  private _clearTimers(): void {
    if (this._openTimer) clearTimeout(this._openTimer)
    if (this._closeTimer) clearTimeout(this._closeTimer)
    this._openTimer = null
    this._closeTimer = null
  }

  private _syncFromAttrs(): void {
    if (this.hasAttribute('open-delay')) this._openDelay[1](Number(this.getAttribute('open-delay')))
    if (this.hasAttribute('close-delay'))
      this._closeDelay[1](Number(this.getAttribute('close-delay')))
    const p = this.getAttribute('placement')
    if (isPlacement(p)) this._placement[1](p)
    this._open[1](this.hasAttribute('open'))
  }
}

function isPlacement(v: string | null): v is Placement {
  return v === 'top' || v === 'bottom' || v === 'left' || v === 'right'
}

export class AihuTooltipTrigger extends HTMLElement {
  private ctx!: TooltipContextValue
  private disposers: Array<() => void> = []

  connectedCallback(): void {
    this.ctx = injectContext(this, tooltipContext)
    this.ctx.registerTrigger(this)
    this.addEventListener('mouseenter', this._onEnter)
    this.addEventListener('mouseleave', this._onLeave)
    this.addEventListener('focus', this._onEnter)
    this.addEventListener('blur', this._onLeave)
    this.addEventListener('keydown', this._onKeydown)
    // APG: the trigger is described-by the tooltip.
    this.disposers.push(
      effect(() => {
        this.setAttribute('aria-describedby', this.ctx.contentId())
        this.setAttribute('data-state', this.ctx.open() ? 'open' : 'closed')
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this.disposers) d()
    this.disposers = []
  }

  private readonly _onEnter = (): void => {
    this.ctx.scheduleOpen()
  }
  private readonly _onLeave = (): void => {
    this.ctx.scheduleClose()
  }
  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') this.ctx.dismiss()
  }
}

export class AihuTooltipContent extends HTMLElement {
  private ctx!: TooltipContextValue
  private disposers: Array<() => void> = []

  connectedCallback(): void {
    this.ctx = injectContext(this, tooltipContext)
    // APG: tooltip content is not focusable.
    this.setAttribute('role', 'tooltip')
    this.id = this.ctx.contentId()
    this.addEventListener('keydown', this._onKeydown)
    this.disposers.push(
      effect(() => {
        const open = this.ctx.open()
        this.setAttribute('data-state', open ? 'open' : 'closed')
        if (open) this._position()
      }),
    )
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeydown)
    for (const d of this.disposers) d()
    this.disposers = []
  }

  /** Position against the trigger using the REUSED css-engine shim. */
  private _position(): void {
    const anchor = this.ctx.triggerEl()
    if (!anchor) return
    position(anchor, this, { placement: this.ctx.placement() })
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') this.ctx.dismiss()
  }
}

const REGISTRY: Array<[string, CustomElementConstructor]> = [
  ['aihu-tooltip-root', AihuTooltipRoot],
  ['aihu-tooltip-trigger', AihuTooltipTrigger],
  ['aihu-tooltip-content', AihuTooltipContent],
]

let _defined = false
/** Register all tooltip custom elements (idempotent). */
export function defineTooltip(): void {
  if (_defined) return
  for (const [tag, ctor] of REGISTRY) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
  _defined = true
}
