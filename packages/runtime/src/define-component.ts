/**
 * `defineComponent` — functional helper for hand-authored custom
 * elements (Learning #12: humans use `defineComponent`, the compiler
 * uses `defineElement`).
 *
 * Returns a `class extends HTMLElement` consumable by `defineElement`.
 * In `connectedCallback`, runs `setup(ctx)` to obtain the arbor tree,
 * then mounts via the injected `mount` function. In
 * `disconnectedCallback`, calls `scope.dispose()`.
 *
 * Per spec §2.4 runtime has zero source-level *value* imports from
 * `@scribe/arbor`. The `mount` function is injected once via
 * `_setMount(mount)` at app boot. This keeps the dependency graph
 * structural-clean (independently shippable runtime, 1 KB budget
 * intact) while still letting hand-authored components use
 * `mount/branch/leaf` ergonomically.
 *
 * Wiring (any consumer that uses defineComponent):
 *
 *   import { mount } from '@scribe/arbor'
 *   import { _setMount, defineComponent } from '@scribe/runtime'
 *   _setMount(mount)
 *
 * v0+1 may replace this with a static import once the structural
 * rule is reviewed; the public `defineComponent` shape would not
 * change.
 */

import type { signal as SignalFactory } from '@scribe/signals'
import type { ComponentOptions, MountFn, Setup, SetupContext } from './types.ts'
import { RuntimeError } from './types.ts'

/**
 * Local alias for the scope type returned by `mount`. Derived from
 * the injected `MountFn` so we don't need a second cross-package
 * type import. (TS erases all of these at build.)
 */
type _ScopeRef = ReturnType<MountFn>

let _mount: MountFn | null = null

/**
 * Injected reference to the `signal` factory from `@scribe/signals`.
 * Must be called once at app boot before any element with `attrs`
 * connects. Function-form `defineComponent(setup)` never reaches this.
 *
 * @internal
 */
let _signal: typeof SignalFactory | null = null

/**
 * Inject the `signal` factory from `@scribe/signals`. Must be called
 * once before any options-form element (with `attrs`) is connected.
 *
 * @internal
 */
export function _setSignal(s: typeof SignalFactory): void {
  _signal = s
}

/**
 * Injected reference to `setSsrContextMap` from `@scribe/context`.
 * Optional — when not set, components run without a context map.
 */
let _setSsrContextMap: ((m: Map<symbol, unknown>) => void) | undefined

/**
 * Injected reference to `clearSsrContextMap` from `@scribe/context`.
 * Optional — when not set, components run without a context map.
 */
let _clearSsrContextMap: (() => void) | undefined

/**
 * Inject the `mount` function from `@scribe/arbor`. Must be called
 * once before any element produced by `defineComponent` is connected
 * to the DOM.
 *
 * Internal-but-exported: not in the public `index.ts` allowlist
 * (per spec §1: 3 public exports); consumers and tests import it
 * from the source module directly, which is the documented wiring
 * pattern.
 *
 * @internal
 */
export function _setMount(fn: MountFn): void {
  _mount = fn
}

/**
 * Inject the `setSsrContextMap` and `clearSsrContextMap` functions from
 * `@scribe/context`. Must be called once at app boot if context support is
 * desired. The injection is optional — components work without it.
 *
 * @internal
 */
export function _setContext(
  set: typeof _setSsrContextMap,
  clear: typeof _clearSsrContextMap,
): void {
  _setSsrContextMap = set
  _clearSsrContextMap = clear
}

/**
 * Symbol slot for per-attribute signal map on element instances.
 * Module-level; never exported.
 * @internal
 */
const ATTR_SIGNALS_SYM = Symbol('attr-signals')

/**
 * Build a custom element class around a setup function.
 *
 * Overload 1 — function form (existing):
 *   `defineComponent(setup)` — no `observedAttributes`, no signal injection
 *   required, zero change to existing call sites.
 *
 * Overload 2 — options form (Plan 1.2):
 *   `defineComponent({ attrs, setup })` — sets `static observedAttributes`,
 *   creates per-attribute `Signal<string>` at connect time via the injected
 *   `_signal` factory, routes `attributeChangedCallback` to signal setters.
 *
 * @throws RuntimeError SCR-R0002 if `_setMount` has not been called.
 * @throws RuntimeError SCR-R0003 if options-form component connects without
 *   `_setSignal` having been called.
 */
export function defineComponent(setup: Setup): typeof HTMLElement
export function defineComponent<A extends ReadonlyArray<string>>(
  options: ComponentOptions<A>,
): typeof HTMLElement
export function defineComponent(
  setupOrOptions: Setup | ComponentOptions,
): typeof HTMLElement {
  if (typeof setupOrOptions === 'function') {
    // ── Function-form path (existing, unchanged) ──────────────────────
    const setup = setupOrOptions
    const SCOPE = Symbol('scribe.componentScope')
    class Component extends HTMLElement {
      private [SCOPE]: _ScopeRef | null = null
      connectedCallback(): void {
        if (_mount === null) {
          throw new RuntimeError(
            'SCR-R0002',
            '_setMount(mount) must be called once at app boot before defineComponent elements connect',
          )
        }
        const host: ShadowRoot | Element = this.shadowRoot ?? this
        const ctx: SetupContext = { host, element: this }
        _setSsrContextMap?.(new Map())
        let tree: ReturnType<Setup>
        try {
          tree = setup(ctx)
        } finally {
          _clearSsrContextMap?.()
        }
        this[SCOPE] = _mount(tree!, host)
      }
      disconnectedCallback(): void {
        this[SCOPE]?.dispose()
        this[SCOPE] = null
      }
    }
    return Component
  }

  // ── Options-form path (Plan 1.2) ────────────────────────────────────
  const { attrs = [] as unknown as ReadonlyArray<string>, setup } = setupOrOptions
  const SCOPE = Symbol('scribe.componentScope')

  class Component extends HTMLElement {
    static readonly observedAttributes = attrs
    private [SCOPE]: _ScopeRef | null = null
    private [ATTR_SIGNALS_SYM]: Record<string, ReturnType<typeof SignalFactory>> | null = null

    connectedCallback(): void {
      if (_mount === null) {
        throw new RuntimeError(
          'SCR-R0002',
          '_setMount(mount) must be called once at app boot before defineComponent elements connect',
        )
      }
      if (_signal === null && attrs.length > 0) {
        throw new RuntimeError(
          'SCR-R0003',
          '_setSignal must be called before connecting a component with attrs',
        )
      }
      // Create one Signal<string> per declared attribute, seeded from
      // the current attribute value (or '' if not present).
      const attrSignals: Record<string, ReturnType<typeof SignalFactory>> = {}
      for (const name of attrs) {
        attrSignals[name] = _signal(this.getAttribute(name) ?? '')
      }
      this[ATTR_SIGNALS_SYM] = attrSignals

      const host: ShadowRoot | Element = this.shadowRoot ?? this
      const ctx = { host, element: this, attrs: attrSignals } as Parameters<typeof setup>[0]
      _setSsrContextMap?.(new Map())
      let tree: ReturnType<typeof setup>
      try {
        tree = setup(ctx)
      } finally {
        _clearSsrContextMap?.()
      }
      this[SCOPE] = _mount!(tree!, host)
    }

    attributeChangedCallback(name: string, _old: string | null, newValue: string | null): void {
      const signals = this[ATTR_SIGNALS_SYM]
      const pair = signals?.[name]
      if (pair !== undefined) pair[1](newValue ?? '')
    }

    disconnectedCallback(): void {
      this[SCOPE]?.dispose()
      this[SCOPE] = null
    }
  }
  return Component
}
