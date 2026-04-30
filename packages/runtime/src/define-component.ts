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

import type { MountFn, Setup, SetupContext } from './types.ts'
import { RuntimeError } from './types.ts'

/**
 * Local alias for the scope type returned by `mount`. Derived from
 * the injected `MountFn` so we don't need a second cross-package
 * type import. (TS erases all of these at build.)
 */
type _ScopeRef = ReturnType<MountFn>

let _mount: MountFn | null = null

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
 * Build a custom element class around a setup function.
 *
 * The returned class:
 * - In `connectedCallback`: builds `SetupContext`, runs `setup(ctx)`,
 *   mounts the resulting tree, stores the `MountScope` for cleanup.
 * - In `disconnectedCallback`: calls `scope.dispose()` if a scope
 *   was captured.
 *
 * Effects created during `setup()` auto-register with the resulting
 * `MountScope` because arbor's `mount()` owns the scope-collector
 * (`_activeMountDisposers`) for the duration of the call (arbor §2.2).
 * `setup()` itself runs *before* `mount()`, so its body must produce
 * the tree without sneaking effects out — but any effect a `branch`
 * attribute or reactive `leaf` registers during materialization is
 * captured by `mount()`'s collector.
 *
 * @throws Error if `_setMount` has not been called.
 */
export function defineComponent(setup: Setup): typeof HTMLElement {
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
