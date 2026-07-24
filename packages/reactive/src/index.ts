/**
 * `@aihu/reactive` — fine-grained Proxy-backed deep reactive trees on
 * `@aihu/signals` (docs/plans/2026-07-24-deep-reactivity.md).
 *
 * Public entry — barrel over `./internal.ts`. Kept as a thin re-export
 * (rather than putting the implementation directly here) so the module
 * also carries a test-only introspection export (`__nodeOf`) that must
 * NEVER be part of this measured `dist/index.js`: since this file never
 * references that binding, rolldown's tree-shaking drops it from the
 * build the same way it would drop any other unused export of an
 * imported module.
 */
export { isReactive, mutate, reactive, reconcile, unwrap } from './internal.ts'
