import type { Signal } from '@scribe/signals'
import { _makeElementLeaf, _makeTextLeaf } from './node.ts'
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
 * Both forms return opaque `Leaf` nodes via the internal `_makeTextLeaf` /
 * `_makeElementLeaf` constructors in `node.ts`. The shape-lock guarantees
 * (always-present `null` for absent fields) live with those internals per
 * spec §2.9 — this module is a thin delegation layer.
 */
export interface LeafFactory {
  (value: Signal<string> | string): Leaf
  element(tag: string, attrs?: AttrMap): Leaf
}

const leafFn = (value: Signal<string> | string): Leaf => _makeTextLeaf(value)

/**
 * `leaf.element(tag, attrs?)` — omitted `attrs` is normalized to `null`
 * before reaching the internal constructor so the runtime shape stays
 * locked per spec §2.9.
 */
;(leafFn as LeafFactory).element = (tag: string, attrs?: AttrMap): Leaf =>
  _makeElementLeaf(tag, attrs ?? null)

export const leaf: LeafFactory = leafFn as LeafFactory
