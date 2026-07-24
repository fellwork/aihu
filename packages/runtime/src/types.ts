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

import type { Branch, Leaf, MountOptions, MountScope } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'

/**
 * Rendering mode for the custom element — a BINARY choice (DA4 #437).
 *
 * - `'shadow'` → `attachShadow({ mode: 'open' })`. `this.shadowRoot` is the
 *                root (non-null). Open is the only browser mode aihu uses:
 *                composition and hydration read `this.shadowRoot`, which a
 *                closed root nulls out — that is why no `'closed'` value
 *                exists. **Default for leaf components.**
 * - `'light'`  → No shadow root; content renders into the element itself.
 *                `this.shadowRoot` is `null` — detection is unambiguous.
 *                No style scoping. **Default for pages and layouts.**
 */
export type ShadowMode = 'light' | 'shadow'

export interface DefineOptions {
  shadowMode?: ShadowMode
  /** When true, connectedCallback checks window.__aihu_state__[name] and calls the injected hydrate fn. Plan 3.2. */
  hydrate?: boolean
}

/**
 * Context passed to a `defineComponent` setup function.
 *
 * - `host` — the DOM target for `mount()`: a `ShadowRoot` for
 *   `shadowMode: 'shadow'`, or the `HTMLElement` itself for
 *   `shadowMode: 'light'`.
 * - `element` — the custom element instance (`this` inside the
 *   constructor).
 * - `connected` — ownership/lifecycle DX (§4,
 *   docs/plans/2026-07-24-lifecycle-ownership-dx.md): `true` for the
 *   lifetime of THIS connection; latches `false` at disconnect and never
 *   returns to `true`. A reconnect gets a fresh setup with a fresh signal,
 *   so a stale async continuation's `connected()` call answers "am *I*
 *   still the live instance?" — the liveness token an in-flight `await`
 *   needs. Created in `_build()`, shared by both the normal-connect and
 *   the hydration path (both call `_build()` directly).
 *
 *   REQUIRED, per the approved design (§4.1) — a prior revision of this
 *   file declared it OPTIONAL to avoid breaking the compiler's host-less
 *   SSR stub contexts (`emit.rs`'s `{ host: null, element: null, attrs: {},
 *   props: {} }`) under `tsc --strict`. That justification did not hold:
 *   those stubs are passed to `__aihu_setup__`, emitted as
 *   `const __aihu_setup__ = (ctx) => {...}` with `ctx` UNANNOTATED — its
 *   parameter type is inferred, `SetupContext` is never the contextual
 *   type at that call site, and the stub object literals are never checked
 *   against this interface at all (independent proof: those same stubs
 *   already pass `host: null`, which would already violate the existing
 *   REQUIRED `host: ShadowRoot | Element` field if they were being
 *   checked). Weakening this field instead cost every REAL consumer:
 *   `ctx.connected?.()` widened to `boolean | undefined`, and the design's
 *   own DX recipes (§7.4 `if (!connected()) return`) stopped typechecking
 *   as written. `_build()` and `_hmrReplace()` are the only two real call
 *   sites and both always supply a real `connected`, so restoring
 *   `required` costs nothing there.
 */
export interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
  readonly connected: () => boolean
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
export type MountFn = (
  node: Branch | Leaf,
  host: ShadowRoot | Element,
  options?: MountOptions,
) => MountScope

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
  /**
   * Recipe class-extension (master spec §9.4): the generated element class
   * extends this base custom-element class instead of `HTMLElement`, so the
   * base's `connectedCallback` (role/ARIA/keyboard, form-control inheritance,
   * cross-piece context provision) runs on the host. Emitted by the compiler's
   * `$extends:` macro. Options-form only — base-extending recipes always carry
   * `$prop` declarations, so they compile to the options-form. The base's
   * `connectedCallback` runs BEFORE the template mounts (so a context-providing
   * primitive registers before its slotted child pieces upgrade), and its
   * `disconnectedCallback` runs on teardown; `observedAttributes` are unioned
   * and `attributeChangedCallback` is forwarded to the base.
   */
  base?: typeof HTMLElement
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
