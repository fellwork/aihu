/**
 * `defineElement` — registration shim for compiler-emitted custom
 * element classes.
 *
 * Per `.team/phase-4/spec-runtime.md` §1.2 + §2.2 + §2.3.
 *
 * The compiler emits, at module level:
 *
 *   defineElement('hello-scribe', HelloScribe)
 *
 * where `HelloScribe extends HTMLElement` is fully authored by the
 * compiler with `connectedCallback`/`disconnectedCallback`/
 * `static observedAttributes`/`attributeChangedCallback` and a
 * `_build()` method producing the arbor tree.
 *
 * `defineElement`'s job is to wrap the constructor so that a shadow
 * root is attached during `super()` (so the compiler-emitted
 * `connectedCallback` can read `this.shadowRoot` synchronously) and
 * then call `customElements.define`.
 *
 * Runtime has zero source-level dependency on `@scribe/arbor` or
 * `@scribe/signals` (spec §2.4). `defineElement` does not call
 * `mount()` — the compiler-emitted `connectedCallback` does.
 */

import { type DefineOptions, RuntimeError, type ShadowMode } from './types.ts'

/**
 * Symbol slot for closed shadow roots — `attachShadow({ mode: 'closed' })`
 * makes `this.shadowRoot` return `null` externally, so runtime stashes
 * the root here for v1 compiler awareness.
 *
 * v0 limitation: compiler-emitted code reads `this.shadowRoot` (which
 * is null for closed mode), so closed mode is registration-only in v0.
 *
 * @internal
 */
export const SHADOW_ROOT_SYM: unique symbol = Symbol('scribe.shadowRoot')

/**
 * Wrap `Ctor` so its constructor calls `attachShadow` per `mode`.
 *
 * `static observedAttributes` and instance methods (`connectedCallback`,
 * `disconnectedCallback`, `attributeChangedCallback`) propagate through
 * `class extends` prototype inheritance — no explicit copy needed.
 *
 * @internal
 */
function wrapClass(Ctor: typeof HTMLElement, mode: ShadowMode): typeof HTMLElement {
  if (mode === 'none') {
    // No shadow root needed; pass the original through. Saves bytes
    // and avoids an unnecessary subclass on the prototype chain.
    return Ctor
  }
  const attachMode: ShadowRootMode = mode === 'closed' ? 'closed' : 'open'
  class Wrapped extends Ctor {
    [SHADOW_ROOT_SYM]: ShadowRoot | null = null
    constructor() {
      super()
      const root = this.attachShadow({ mode: attachMode })
      if (mode === 'closed') {
        this[SHADOW_ROOT_SYM] = root
      }
    }
  }
  return Wrapped
}

/**
 * Register a custom element constructor.
 *
 * @throws {RuntimeError} `SCR-R0001` if `name` is already defined in
 *   `customElements`.
 */
export function defineElement(
  name: string,
  Ctor: typeof HTMLElement,
  options?: DefineOptions,
): void {
  if (customElements.get(name) !== undefined) {
    throw new RuntimeError('SCR-R0001', `Custom element '${name}' is already defined`)
  }
  const mode: ShadowMode = options?.shadowMode ?? 'open'
  const Wrapped = wrapClass(Ctor, mode)
  customElements.define(name, Wrapped)
}
