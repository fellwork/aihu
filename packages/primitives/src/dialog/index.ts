/**
 * Headless dialog — `<aihu-dialog-root>` (state owner) + pieces
 * `<aihu-dialog-trigger>`, `<aihu-dialog-content>`, `<aihu-dialog-backdrop>`,
 * `<aihu-dialog-close>`, `<aihu-dialog-title>`, `<aihu-dialog-description>`.
 * Implements the WAI-ARIA APG **Dialog (Modal)** pattern: focus-trap +
 * return-focus, Escape-to-close, `role=dialog` / `aria-modal` /
 * `aria-labelledby` / `aria-describedby`, trigger `aria-haspopup` /
 * `aria-expanded` / `aria-controls`. Emits NO CSS — every piece reflects
 * `data-state="open"|"closed"` for the consumer to style.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, injectValue, provideContext } from '../dom-context.ts'
import { createFocusTrap, type FocusTrap } from './focus-trap.ts'

export interface DialogContextValue {
  readonly open: Read<boolean>
  readonly modal: Read<boolean>
  readonly contentId: Read<string>
  readonly titleId: Read<string | null>
  readonly descriptionId: Read<string | null>
  setTitleId(id: string): void
  setDescriptionId(id: string): void
  setOpen(next: boolean): void
  close(): void
  toggle(): void
}

export const dialogContext = createDomContext<DialogContextValue>('dialog')

let _idSeq = 0
const uid = (p: string): string => `aihu-${p}-${(_idSeq += 1)}`

export class AihuDialogRoot extends HTMLElement {
  static readonly observedAttributes = ['open', 'modal']

  private readonly _open = signal(false)
  private readonly _modal = signal(true)
  private readonly _contentId = signal(uid('dialog'))
  private readonly _titleId = signal<string | null>(null)
  private readonly _descriptionId = signal<string | null>(null)
  private _disposers: Array<() => void> = []
  private _ctx: DialogContextValue

  constructor() {
    super()
    this._ctx = {
      open: this._open[0],
      modal: this._modal[0],
      contentId: this._contentId[0],
      titleId: this._titleId[0],
      descriptionId: this._descriptionId[0],
      setTitleId: (id) => this._titleId[1](id),
      setDescriptionId: (id) => this._descriptionId[1](id),
      setOpen: (next) => this.setOpen(next),
      close: () => this.setOpen(false),
      toggle: () => this.setOpen(!this._open[0]()),
    }
    provideContext(this, dialogContext, this._ctx)
  }

  get open(): Read<boolean> {
    return this._open[0]
  }

  setOpen(next: boolean): void {
    if (next === this._open[0]()) return
    this._open[1](next)
    if (next) this.setAttribute('open', '')
    else this.removeAttribute('open')
  }

  connectedCallback(): void {
    if (this.hasAttribute('modal')) this._modal[1](this.getAttribute('modal') !== 'false')
    this._open[1](this.hasAttribute('open'))
    this._disposers.push(
      effect(() => {
        this.setAttribute('data-state', this._open[0]() ? 'open' : 'closed')
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'open') this._open[1](value !== null)
    if (name === 'modal') this._modal[1](value !== 'false')
  }
}

/** Base for pieces that inject the dialog context lazily on connect. */
abstract class DialogPiece extends HTMLElement {
  protected ctx!: DialogContextValue
  protected disposers: Array<() => void> = []

  connectedCallback(): void {
    this.ctx = injectValue(this, dialogContext)
    this.onConnect()
  }

  disconnectedCallback(): void {
    for (const d of this.disposers) d()
    this.disposers = []
  }

  protected reflectState(): void {
    this.disposers.push(
      effect(() => {
        this.setAttribute('data-state', this.ctx.open() ? 'open' : 'closed')
      }),
    )
  }

  protected abstract onConnect(): void
}

export class AihuDialogTrigger extends DialogPiece {
  protected onConnect(): void {
    if (this.tagName !== 'BUTTON') {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'button')
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0')
    }
    this.setAttribute('aria-haspopup', 'dialog')
    this.addEventListener('click', this._onClick)
    this.disposers.push(
      effect(() => {
        const open = this.ctx.open()
        this.setAttribute('aria-expanded', String(open))
        this.setAttribute('aria-controls', this.ctx.contentId())
      }),
    )
    this.reflectState()
  }

  private readonly _onClick = (): void => {
    this.ctx.toggle()
  }
}

export class AihuDialogContent extends DialogPiece {
  private _trap: FocusTrap | null = null

  protected onConnect(): void {
    this.setAttribute('role', this.getAttribute('role') ?? 'dialog')
    this.addEventListener('keydown', this._onKeydown)
    this.disposers.push(
      effect(() => {
        const open = this.ctx.open()
        this.id = this.ctx.contentId()
        if (this.ctx.modal()) this.setAttribute('aria-modal', 'true')
        const titleId = this.ctx.titleId()
        if (titleId) this.setAttribute('aria-labelledby', titleId)
        const descId = this.ctx.descriptionId()
        if (descId) this.setAttribute('aria-describedby', descId)
        this.setAttribute('data-state', open ? 'open' : 'closed')
        if (open) this._activateTrap()
        else this._deactivateTrap()
      }),
    )
  }

  override disconnectedCallback(): void {
    this._deactivateTrap()
    this.removeEventListener('keydown', this._onKeydown)
    super.disconnectedCallback()
  }

  private _activateTrap(): void {
    if (this._trap) return
    this._trap = createFocusTrap(this)
    this._trap.activate()
  }

  private _deactivateTrap(): void {
    this._trap?.deactivate()
    this._trap = null
  }

  private readonly _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && this.getAttribute('data-dismissable-escape') !== 'false') {
      ev.stopPropagation()
      this.ctx.close()
    }
  }
}

export class AihuDialogBackdrop extends DialogPiece {
  protected onConnect(): void {
    this.addEventListener('click', this._onClick)
    this.reflectState()
  }

  private readonly _onClick = (): void => {
    if (this.ctx.modal() && this.getAttribute('data-dismissable-outside') !== 'false') {
      this.ctx.close()
    }
  }
}

export class AihuDialogClose extends DialogPiece {
  protected onConnect(): void {
    if (this.tagName !== 'BUTTON') {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'button')
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0')
    }
    this.addEventListener('click', this._onClick)
    this.reflectState()
  }

  private readonly _onClick = (): void => {
    this.ctx.close()
  }
}

export class AihuDialogTitle extends DialogPiece {
  protected onConnect(): void {
    if (!this.id) this.id = uid('dialog-title')
    this.ctx.setTitleId(this.id)
  }
}

export class AihuDialogDescription extends DialogPiece {
  protected onConnect(): void {
    if (!this.id) this.id = uid('dialog-desc')
    this.ctx.setDescriptionId(this.id)
  }
}

const REGISTRY: Array<[string, CustomElementConstructor]> = [
  ['aihu-dialog-root', AihuDialogRoot],
  ['aihu-dialog-trigger', AihuDialogTrigger],
  ['aihu-dialog-content', AihuDialogContent],
  ['aihu-dialog-backdrop', AihuDialogBackdrop],
  ['aihu-dialog-close', AihuDialogClose],
  ['aihu-dialog-title', AihuDialogTitle],
  ['aihu-dialog-description', AihuDialogDescription],
]

const _definedPrefixes = new Set<string>()
/**
 * Register all dialog custom elements under `<prefix>-dialog-*` (idempotent
 * per prefix). Non-default prefixes register a fresh trivial subclass per
 * piece — a constructor can only be `customElements.define`d once, so the
 * original classes stay reserved for the default tags. Demos/stories use a
 * non-`aihu` prefix so styled recipes own the `aihu-dialog-*` namespace
 * (spec §9.4).
 */
export function defineDialog(prefix = 'aihu'): void {
  if (_definedPrefixes.has(prefix)) return
  for (const [tag, ctor] of REGISTRY) {
    const name = prefix === 'aihu' ? tag : tag.replace(/^aihu-/, `${prefix}-`)
    if (!customElements.get(name)) {
      customElements.define(name, prefix === 'aihu' ? ctor : class extends ctor {})
    }
  }
  _definedPrefixes.add(prefix)
}

export { createFocusTrap, type FocusTrap, type FocusTrapOptions } from './focus-trap.ts'
