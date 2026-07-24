/**
 * `<aihu-label>` — headless label (the Radix Label parity primitive). Wires
 * the label↔control association and forwards interactions the way a native
 * `<label>` does, for targets that native labels cannot reference (custom
 * hosts, role=checkbox/switch/radio elements). Ships NO CSS.
 *
 * Behavior:
 * - On connect: ensures a stable `id`, stamps `data-fc-label` on itself so an
 *   ancestor `<aihu-form-control>` discovers it, and (when inside one) asks
 *   that ancestor to re-wire so the control gains
 *   `aria-labelledby="<labelId>"`.
 * - Target resolution (re-resolved per interaction, never cached): the `for`
 *   attribute is looked up via `getElementById` in the label's root; with no
 *   `for`, a `formControlContext` ancestor's `controlId` is used.
 * - Standalone (no form-control ancestor): sets `aria-labelledby` = own id on
 *   the resolved target reactively. Skipped when the target lives in a
 *   different root — ARIA IDREFs cannot cross shadow boundaries (see
 *   accessibility.md; use `aria-label` on the target for cross-root cases).
 * - Click forwarding (non-native hosts only): double-click `mousedown` is
 *   prevented (no accidental text selection); `click` focuses native text
 *   controls, forwards `click()` to native checkbox/radio or custom
 *   checkbox/switch/radio hosts, and does nothing for disabled targets or
 *   clicks originating on nested interactive children.
 * - If the host IS a native `<label>` (tagName `LABEL`), click forwarding is
 *   native — only the context wiring above applies.
 *
 * Reflected attributes: `for` (optional explicit target id).
 */

import { effect, type Read, signal } from '@aihu/signals'
import { composedClosest, composedContains, composedParent } from '../composed-tree.ts'
import { injectValue } from '../dom-context.ts'
import {
  AihuFormControl,
  type FormControlContextValue,
  formControlContext,
} from '../form-control/index.ts'

let _idCounter = 0
function nextId(): string {
  _idCounter += 1
  return `aihu-label-${_idCounter}`
}

export class AihuLabel extends HTMLElement {
  static readonly observedAttributes = ['for']

  private readonly _for = signal<string | null>(null)
  private _fc: FormControlContextValue | null = null
  private _disposers: Array<() => void> = []

  /** The explicit target id (`for` attribute) as a signal; null when unset. */
  get forId(): Read<string | null> {
    return this._for[0]
  }

  private get _isNativeLabel(): boolean {
    return this.tagName === 'LABEL'
  }

  connectedCallback(): void {
    this._for[1](this.getAttribute('for'))
    if (!this.id) this.id = nextId()
    // Make this label discoverable by an ancestor <aihu-form-control>.
    this.setAttribute('data-fc-label', '')

    try {
      this._fc = injectValue(this, formControlContext)
    } catch {
      this._fc = null
    }

    if (this._fc) {
      // The form-control connected (and wired) before this label existed in
      // its eyes — ask it to re-derive associations so the control gains
      // aria-labelledby pointing at this label. Composed-tree ancestor walk
      // (crosses shadow boundaries via `composedParent`'s ShadowRoot -> .host
      // hop) — a plain `.parentElement` loop stops dead at a shadow root.
      let node: Node | null = composedParent(this)
      while (node !== null) {
        if (node instanceof AihuFormControl) {
          node.recomputeDescribedBy()
          break
        }
        node = composedParent(node)
      }
    } else if (!this._isNativeLabel) {
      // Standalone: stamp aria-labelledby on the resolved target reactively.
      // Skip cross-root targets — IDREFs cannot cross shadow boundaries.
      this._disposers.push(
        effect(() => {
          this._for[0]() // track `for` changes
          const target = this._resolveTarget()
          if (target && target.getRootNode() === this.getRootNode()) {
            target.setAttribute('aria-labelledby', this.id)
          }
        }),
      )
    }

    if (!this._isNativeLabel) {
      this.addEventListener('mousedown', this._onMousedown)
      this.addEventListener('click', this._onClick)
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener('mousedown', this._onMousedown)
    this.removeEventListener('click', this._onClick)
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'for') this._for[1](value)
  }

  /** Resolve the labelled target NOW (per interaction — never cached). */
  private _resolveTarget(): HTMLElement | null {
    const root = this.getRootNode() as Document | ShadowRoot
    const forId = this._for[0]()
    if (forId) return (root.getElementById(forId) as HTMLElement | null) ?? null
    if (this._fc) {
      const id = this._fc.controlId()
      if (id) return (root.getElementById(id) as HTMLElement | null) ?? null
    }
    return null
  }

  private readonly _onMousedown = (ev: MouseEvent): void => {
    // Prevent text selection on double-click (native label parity).
    if (ev.detail > 1) ev.preventDefault()
  }

  private readonly _onClick = (ev: MouseEvent): void => {
    const target = this._resolveTarget()
    if (!target) return

    // `composedPath()[0]` is the true originating target, pre-retargeting —
    // native `ev.target` is already retargeted to the outermost host visible
    // from this label's own root, which would hide a nested interactive child
    // living inside a further-nested shadow root.
    const path = ev.composedPath()
    const origin =
      path[0] instanceof Element ? path[0] : ev.target instanceof Element ? ev.target : null
    // Clicks originating on a nested interactive child (that is not the
    // labelled target) are the child's business — don't forward. Composed-
    // tree `closest`/`contains` so this still holds across shadow boundaries.
    const interactive = origin ? composedClosest(origin, 'button,input,select,textarea,a') : null
    if (interactive !== null && interactive !== target) return
    // Clicks already on/inside the target need no forwarding (and forwarding
    // a click back to the target would recurse).
    if (origin !== null && (origin === target || composedContains(target, origin))) return

    // Disabled targets don't get forwarded interactions.
    if (
      target.getAttribute('aria-disabled') === 'true' ||
      (target as HTMLInputElement).disabled === true
    ) {
      return
    }

    const tag = target.tagName
    const inputType = tag === 'INPUT' ? (target as HTMLInputElement).type : null
    if (inputType === 'checkbox' || inputType === 'radio') {
      target.click()
      return
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      target.focus()
      return
    }
    const role = target.getAttribute('role')
    if (role === 'checkbox' || role === 'switch' || role === 'radio') {
      target.click()
    }
  }
}

let _defined = false
/** Register `<aihu-label>` (idempotent). */
export function defineLabel(tag = 'aihu-label'): void {
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuLabel)
  _defined = true
}
