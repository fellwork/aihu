import type { ChildList } from './types.ts'

/**
 * Shared `EMPTY_CHILDREN` constant for shape-locked Branch/Leaf runtime
 * objects.
 *
 * Per `.team/phase-3/spec-arbor.md` §2.9 (hidden-class shape locking):
 * Branch and Leaf runtime objects MUST always have the same field set.
 * V8 deoptimizes when objects of the "same logical type" have different
 * shapes. When `attrs` is omitted, store `null` (NOT `undefined`, NOT
 * missing). When `children` is omitted, store `EMPTY_CHILDREN` — a frozen
 * module-level empty array (saves allocation per fragment).
 *
 * Shape-locking also applies to `StructuralNode` (Plan 1.1): all seven
 * fields (`kind`, `structuralKind`, `condition`, `grow`, `list`, `keyFn`,
 * `listGrow`) are always present; unused arms are `null`. See `types.ts`.
 *
 * R3-arbor (investigation-arbor-restructure.md §Q4): the prior
 * `_makeBranch` / `_makeTextLeaf` / `_makeElementLeaf` factories were
 * single-call internal helpers; their literals now live inline at the
 * `branch()` / `leaf()` factory bodies. The shape-lock invariant is
 * enforced at each literal; see `branch.ts` and `leaf.ts`.
 */

/**
 * @internal — frozen module-level empty children array.
 * Reused across all branch nodes that have no children, saving an
 * allocation per call site (per spec §2.9).
 */
export const EMPTY_CHILDREN: ChildList = Object.freeze([]) as ChildList
