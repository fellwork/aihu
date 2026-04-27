import type { Signal } from '@scribe/signals'
import type { AttrMap, Branch, ChildList, Leaf } from './types.ts'

/**
 * Internal `Branch` / `Leaf` runtime constructors and the shared
 * `EMPTY_CHILDREN` constant.
 *
 * Per `.team/phase-3/spec-arbor.md` §2.9 (hidden-class shape locking):
 * Branch and Leaf runtime objects MUST always have the same field set.
 * V8 deoptimizes when objects of the "same logical type" have different
 * shapes. When `attrs` is omitted, store `null` (NOT `undefined`, NOT
 * missing). When `children` is omitted, store `EMPTY_CHILDREN` — a frozen
 * module-level empty array (saves allocation per fragment).
 *
 * The `_`-prefixed factories are `/** @internal *\/` and never re-exported
 * from `index.ts`. Public `branch()` and `leaf()` factories (Tasks 13/14)
 * call into these.
 */

/**
 * @internal — frozen module-level empty children array.
 * Reused across all branch nodes that have no children, saving an
 * allocation per call site (per spec §2.9).
 */
export const EMPTY_CHILDREN: ChildList = Object.freeze([]) as ChildList

/**
 * @internal — Branch runtime constructor with shape-locked fields.
 *
 * Always populates all four fields (`kind`, `tag`, `attrs`, `children`)
 * even when the caller omits attrs/children. `null` placeholders preserve
 * V8 hidden-class identity per spec §2.9.
 */
export function _makeBranch(
  tag: string | null,
  attrs: AttrMap | null,
  children: ChildList,
): Branch {
  return { kind: 'branch', tag, attrs, children }
}

/**
 * @internal — Leaf runtime constructor for text leaves.
 *
 * `value` is either a static string or a `Signal<string>` (a Signal is the
 * tuple `readonly [Read<T>, Write<T>]`). `tag` and `attrs` are always
 * `null` for text leaves — but they are *present* on the object so Branch
 * and element-Leaf share the hidden-class shape per spec §2.9.
 */
export function _makeTextLeaf(value: Signal<string> | string): Leaf {
  return { kind: 'leaf', leafKind: 'text', value, tag: null, attrs: null }
}

/**
 * @internal — Leaf runtime constructor for terminal element leaves
 * (`<img>`, `<br>`, `<input>`, `<hr>`, etc.). `value` is always `null` for
 * element leaves but present on the object per spec §2.9.
 */
export function _makeElementLeaf(tag: string, attrs: AttrMap | null): Leaf {
  return { kind: 'leaf', leafKind: 'element', value: null, tag, attrs }
}
