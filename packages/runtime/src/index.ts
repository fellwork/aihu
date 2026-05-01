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
 * `_setMount` is internal-but-exported from `define-component.ts` for
 * the documented wiring pattern (`import { _setMount } from
 * '@scribe/runtime/src/define-component'` at app boot). It is not part
 * of the public surface.
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
