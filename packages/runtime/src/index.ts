/**
 * `@scribe/runtime` — public exports.
 *
 * Per `.team/phase-4/spec-runtime.md` §1 + §5 + §1.5 (defineComponent
 * ratified for v0).
 *
 * `RuntimeError` is intentionally NOT re-exported (spec §1.3 /
 * Decision 2B): the only throw site is a startup invariant violation,
 * not a production-time catchable condition.
 *
 * `_setMount` and `_setSignal` are re-exported here as internal bootstrap
 * exports (decision D5). They are not public API but are accessible via the
 * package barrel for compiler-emitted options-form components at app boot.
 */

export { defineComponent } from './define-component.ts'
export { defineElement } from './define-element.ts'
export type { ComponentOptions, DefineOptions, Setup, SetupContext, ShadowMode } from './types.ts'

/**
 * Internal bootstrap exports — not part of the public API contract.
 * Required by compiler-emitted options-form components at app boot.
 * See decision D5 (Phase 1 engineering review).
 */
export { _setMount, _setSignal } from './define-component.ts'

/**
 * HMR helper — re-runs a component's setup function in-place without
 * a full page reload. Tree-shakeable; never referenced in production
 * builds (Vite plugin gates injection with `if (__DEV__ && import.meta.hot)`).
 *
 * @internal
 */
export { _hmrReplace } from './define-component.ts'
