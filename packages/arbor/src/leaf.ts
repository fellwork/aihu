import type { Signal } from '@scribe/signals'
import type { AttrMap, Leaf } from './types.ts'

/**
 * `LeafFactory` — public factory for leaf nodes per
 * `.team/phase-3/spec-arbor.md` §1.3.
 *
 * Two shapes share one symbol:
 *
 * - `leaf(value)` — text leaf. `value` is `Signal<string> | string`. The
 *   discriminant at runtime is `Array.isArray(value)`: a Signal is the
 *   tuple `readonly [Read<T>, Write<T>]`, so `Array.isArray` is the only
 *   reliable runtime check (per spec §1.3 + Deviation #11).
 *
 * - `leaf.element(tag, attrs?)` — terminal element leaf for `<img>`,
 *   `<br>`, `<input>`, `<hr>`, etc. `attrs` follows the same semantics as
 *   `branch` attrs (see spec §1.2).
 *
 * Both forms construct opaque `Leaf` nodes inline (R3-arbor —
 * investigation-arbor-restructure.md §Q4 — the prior `_makeTextLeaf` and
 * `_makeElementLeaf` factories were single-call internal helpers). The
 * shape-lock guarantees (always-present `null` for absent fields) are
 * enforced at the literal — see spec §2.9.
 */
export interface LeafFactory {
  (value: Signal<string> | string): Leaf
  element(tag: string, attrs?: AttrMap): Leaf
}

const leafFn = (value: Signal<string> | string): Leaf =>
  // shape per spec §2.9 — text leaf carries `tag: null, attrs: null`
  ({ kind: 'leaf', leafKind: 'text', value, tag: null, attrs: null })

/**
 * `leaf.element(tag, attrs?)` — omitted `attrs` is normalized to `null`
 * before reaching the literal so the runtime shape stays locked per spec §2.9.
 */
;(leafFn as LeafFactory).element = (tag: string, attrs?: AttrMap): Leaf =>
  // shape per spec §2.9 — element leaf carries `value: null`
  ({ kind: 'leaf', leafKind: 'element', value: null, tag, attrs: attrs ?? null })

export const leaf: LeafFactory = leafFn as LeafFactory
