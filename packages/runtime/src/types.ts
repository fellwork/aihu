/**
 * Public + internal types for `@aihu/runtime`.
 *
 * Per `.team/phase-4/spec-runtime.md` §1.2 / §1.3 / §1.5 / §2.1.
 *
 * Cross-package types are imported with `import type` only (zero
 * runtime cost; fully type-erased per TS `verbatimModuleSyntax`).
 * Spec §2.4 forbids source-level *value* imports across packages —
 * type-only imports do not count.
 */

import type { Branch, Leaf, MountScope } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'

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
  /** When true, connectedCallback checks window.__aihu_state__[name] and calls the injected hydrate fn. Plan 3.2. */
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
 * Spec §2.4 forbids source-level *value* imports from `@aihu/arbor`,
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
  /**
   * R1 ($prop reactivity, template-syntax-v2 round 5): rich per-prop
   * metadata bag describing the Lit-style `attribute` / `reflect` /
   * `converter` lowering. When non-empty, the runtime synthesizes
   * `observedAttributes` from prop entries with `attribute !== false`,
   * wires `attributeChangedCallback`, allocates one `Signal` per prop
   * initialized to `value`, defines a JS property accessor on the class
   * prototype, and (when `reflect: true`) reflects signal writes back to
   * the attribute with a re-entrancy guard.
   *
   * Value flows through to the setup function via `ctx.props.<name>`,
   * a per-name `Signal<unknown>`. Setup callers are expected to read via
   * the signal-getter call (e.g. `props.title()`); writes via
   * `props.title.set(...)` or via the JS property accessor on the host
   * element (`el.title = newValue`) flow back through the same signal.
   */
  props?: PropsConfig
  setup: (ctx: SetupContext & AttrContext<A> & PropsContext) => Branch | Leaf
}

/**
 * R1 — single `$prop` definition. Matches the spec sketch in
 * `2026-05-06-spec-template-syntax-v2-platform-audit.md` §3.6.
 *
 * - `value`        — initial value if attribute is absent at connect time.
 * - `attribute`    — `false` to skip observedAttributes registration
 *                    (property-only), `true` (default) for kebab-cased
 *                    name, or a string to override the attribute name.
 * - `reflect`      — write signal value back to attribute on set.
 *                    Forbidden together with `attribute: false`.
 * - `converter`    — `(s: string | null) => unknown` called with the raw
 *                    attribute string when it changes. Defaults derived
 *                    from `type:` (string identity, number coercion,
 *                    boolean presence, JSON.parse for objects).
 */
export interface PropDef {
  value?: unknown
  attribute?: boolean | string
  reflect?: boolean
  converter?: (raw: string | null) => unknown
}

export type PropsConfig = Record<string, PropDef>

/**
 * R1 — runtime intersection added to setup ctx when `props` is non-empty.
 * Each prop name is a `Signal<unknown>` getter+setter tuple; setup code
 * reads via `props.name()` and writes via `props.name.set(...)`.
 *
 * @internal — exported for type-only use; not re-exported from index.ts.
 */
export interface PropsContext {
  readonly props: Record<string, PropSignal>
}

/**
 * R1 — per-prop signal handle exposed to setup. `()` reads (subscribes
 * in tracking scope); `.set(v)` writes (flows through reflect when
 * configured). Implemented as a callable function with attached `set`
 * method to keep call-site ergonomics stable across the codebase.
 */
export interface PropSignal {
  (): unknown
  set(v: unknown): void
}

export class RuntimeError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
