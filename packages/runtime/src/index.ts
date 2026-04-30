/**
 * `@scribe/runtime` — public exports.
 *
 * Per `.team/phase-4/spec-runtime.md` §1 + §5.
 *
 * `RuntimeError` is intentionally NOT re-exported (spec §1.3 /
 * Decision 2B): the only throw site is a startup invariant violation,
 * not a production-time catchable condition.
 */

export { defineElement } from './define-element.ts'
export type { DefineOptions, ShadowMode } from './types.ts'
