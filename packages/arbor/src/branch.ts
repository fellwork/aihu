import { EMPTY_CHILDREN } from './node.ts'
import type { AttrMap, Branch, ChildList } from './types.ts'

/**
 * `branch(tag, attrs?, children?)` — public factory for branch nodes per
 * `.team/phase-3/spec-arbor.md` §1.2.
 *
 * Returns an opaque `Branch` node. Does NOT touch the DOM at construction
 * — only `mount()` materializes nodes. `tag === null` is the fragment /
 * grouping case: no wrapper element is created at mount, children are
 * appended directly to the host or parent (per spec §1.2 and §2.3).
 *
 * Shape-lock per §2.9 (R3-arbor inlines the prior `_makeBranch` factory
 * here — investigation-arbor-restructure.md §Q4 — single call site):
 * - omitted `attrs` is normalized to `null` (NOT `undefined`)
 * - omitted `children` is normalized to the frozen module-level
 *   `EMPTY_CHILDREN` array (saves a per-call allocation for fragments
 *   and childless branches)
 *
 * The compiler never emits attrs on null-tag branches; runtime
 * defensiveness for that case lands in v1 (per spec §1.2). v0 just
 * passes attrs through.
 */
export function branch(tag: string | null, attrs?: AttrMap, children?: ChildList): Branch {
  // shape per spec §2.9 — all four fields always present
  return { kind: 'branch', tag, attrs: attrs ?? null, children: children ?? EMPTY_CHILDREN }
}
