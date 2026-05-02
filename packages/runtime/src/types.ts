/**
 * Public + internal types for `@scribe/runtime`.
 *
 * Per `.team/phase-4/spec-runtime.md` §1.2 / §1.3 / §1.5 / §2.1.
 *
 * Cross-package types are imported with `import type` only (zero
 * runtime cost; fully type-erased per TS `verbatimModuleSyntax`).
 * Spec §2.4 forbids source-level *value* imports across packages —
 * type-only imports do not count.
 */

import type { Branch, Leaf, MountScope } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'

/**
 * Shadow DOM mode for the custom element.
 *
 * - `'open'`   → `attachShadow({ mode: 'open' })`. `this.shadowRoot`
 *                accessible externally. **Default.**
 * - `'closed'` → `attachShadow({ mode: 'closed' })`. `this.shadowRoot`
 *                returns `null` externally. Runtime stores root on
 *                `SHADOW_ROOT_SYM`. **v0 LIMITATION:** compiler-emitted
 *                code reads `this.shadowRoot`, which returns `null` for
 *                closed roots. Fully functional in v1 when compiler
 *                gains `SHADOW_ROOT_SYM` awareness.
 * - `'none'`   → No shadow root. `mount()` is called with `this` (the
 *                element itself) as host. No style scoping.
 */
export type ShadowMode = 'open' | 'closed' | 'none'

export interface DefineOptions {
  shadowMode?: ShadowMode
  /** When true, connectedCallback checks window.__scribe_state__[name] and calls the injected hydrate fn. Plan 3.2. */
  hydrate?: boolean
}

/**
 * Context passed to a `defineComponent` setup function.
 *
 * - `host` — the DOM target for `mount()`: a `ShadowRoot` for the
 *   default `'open'`/`'closed'` modes, or the `HTMLElement` itself
 *   for `shadowMode: 'none'`.
 * - `element` — the custom element instance (`this` inside the
 *   constructor).
 */
export interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
}

/**
 * A `defineComponent` setup function: receives a `SetupContext`,
 * returns the arbor tree to mount.
 */
export type Setup = (ctx: SetupContext) => Branch | Leaf

/**
 * Internal — signature of `mount` injected via `_setMount`.
 *
 * Spec §2.4 forbids source-level *value* imports from `@scribe/arbor`,
 * so `defineComponent` cannot statically `import { mount }`. The
 * consumer wires it once via `_setMount(mount)` at app boot. Tests
 * and integration tests do the same.
 *
 * @internal
 */
export type MountFn = (node: Branch | Leaf, host: ShadowRoot | Element) => MountScope

/**
 * Internal — NOT re-exported from `index.ts` (spec §1.3, Decision 2B).
 *
 * The only throw site is a startup invariant violation (developer
 * error), not a production-time catchable condition. Exporting the class
 * would lock a public API contract for error codes before they
 * stabilize. Saves ~50 B gz.
 *
 * @internal
 */
/**
 * Context intersection added by options-form `defineComponent({ attrs, setup })`.
 * Maps each attribute name to a `Signal<string>` created at connect time.
 *
 * NOT exported from `index.ts` — internal intersection type only.
 * @internal
 */
export type AttrContext<A extends ReadonlyArray<string>> = {
  readonly attrs: { readonly [K in A[number]]: Signal<string> }
}

/**
 * Options passed to the overloaded `defineComponent` when typed
 * `observedAttributes` + per-attribute signals are desired.
 *
 * Exported from `index.ts` as part of the public surface.
 */
export interface ComponentOptions<A extends ReadonlyArray<string> = ReadonlyArray<string>> {
  attrs?: A
  setup: (ctx: SetupContext & AttrContext<A>) => Branch | Leaf
}

export class RuntimeError extends Error {
  override name = 'RuntimeError'
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
