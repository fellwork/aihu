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
 * Plan 3.2 — hydration: when `options.hydrate: true`, the wrapper
 * class adds a `connectedCallback` that calls the injected `_hydrateFn`
 * if `window.__scribe_state__?.[name]` is present. Requires the Ctor to
 * expose a `_build()` method returning the arbor Node.
 *
 * Runtime has zero source-level dependency on `@scribe/arbor` or
 * `@scribe/signals` (spec §2.4). `defineElement` does not call
 * `mount()` — the compiler-emitted `connectedCallback` does.
 */

import { type DefineOptions, RuntimeError, type ShadowMode } from './types.ts'
import type { MountScope } from '@scribe/arbor'

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
 * Injected `hydrate` function from `@scribe/arbor`. Must be called once
 * at app boot before any hydration-enabled element connects.
 *
 * Signature matches `hydrate()` from `@scribe/arbor`.
 *
 * @internal
 */
type HydrateFn = (
  component: () => unknown,
  host: Element | ShadowRoot,
  snapshot: Record<string, unknown>,
) => MountScope

let _hydrateFn: HydrateFn | null = null

/**
 * Inject the `hydrate` function from `@scribe/arbor`. Must be called
 * once at app boot before any `defineElement(..., { hydrate: true })`
 * element connects. Without this, hydration falls back to the default
 * `connectedCallback`.
 *
 * @internal
 */
export function _setHydrate(fn: HydrateFn): void {
  _hydrateFn = fn
}

/**
 * Wrap `Ctor` so its constructor calls `attachShadow` per `mode`.
 * When `hydrate: true`, the wrapper also adds a `connectedCallback`
 * that invokes hydration if `window.__scribe_state__?.[name]` is present.
 *
 * `static observedAttributes` and instance methods (`connectedCallback`,
 * `disconnectedCallback`, `attributeChangedCallback`) propagate through
 * `class extends` prototype inheritance — no explicit copy needed.
 *
 * @internal
 */
function wrapClass(
  Ctor: typeof HTMLElement,
  mode: ShadowMode,
  name: string,
  enableHydration: boolean,
): typeof HTMLElement {
  if (mode === 'none' && !enableHydration) {
    // No shadow root, no hydration wrapping needed — pass through original.
    return Ctor
  }
  const attachMode: ShadowRootMode = mode === 'closed' ? 'closed' : 'open'
  const attachShadow = mode !== 'none'

  class Wrapped extends Ctor {
    [SHADOW_ROOT_SYM]: ShadowRoot | null = null
    // Scope storage for the hydrated scope (needed for disconnectedCallback).
    _hydratedScope: MountScope | null = null

    constructor() {
      super()
      if (attachShadow) {
        const root = this.attachShadow({ mode: attachMode })
        if (mode === 'closed') {
          this[SHADOW_ROOT_SYM] = root
        }
      }
    }

    connectedCallback(): void {
      if (enableHydration && _hydrateFn !== null) {
        // Check for SSR state for this element's tag name.
        const win = typeof window !== 'undefined' ? window : undefined
        const state = (win as Record<string, unknown> | undefined)?.[
          '__scribe_state__'
        ] as Record<string, unknown> | undefined
        const snapshot = state?.[name] as Record<string, unknown> | undefined
        if (snapshot !== undefined) {
          const host: Element | ShadowRoot = this.shadowRoot ?? this
          // Cast: compiler-emitted class exposes _build() returning the arbor Node.
          const ctor = this as unknown as { _build?(): unknown }
          if (typeof ctor._build === 'function') {
            this._hydratedScope = _hydrateFn(() => ctor._build!(), host, snapshot)
            return
          }
        }
      }
      // Default path: delegate to compiler-emitted connectedCallback via prototype chain.
      // `super.connectedCallback()` is invalid TS (HTMLElement doesn't declare it),
      // so we walk the prototype chain explicitly.
      const parentCb = Object.getPrototypeOf(Wrapped.prototype).connectedCallback as
        | (() => void)
        | undefined
      parentCb?.call(this)
    }

    disconnectedCallback(): void {
      if (this._hydratedScope !== null) {
        this._hydratedScope.dispose()
        this._hydratedScope = null
        return
      }
      // Delegate to compiler-emitted disconnectedCallback via prototype chain.
      const parentCb = Object.getPrototypeOf(Wrapped.prototype).disconnectedCallback as
        | (() => void)
        | undefined
      parentCb?.call(this)
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
  const enableHydration = options?.hydrate === true
  const Wrapped = wrapClass(Ctor, mode, name, enableHydration)
  customElements.define(name, Wrapped)
}
