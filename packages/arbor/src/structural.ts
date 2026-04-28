import type { Signal } from '@scribe/signals'
import { ArborNotImplementedError } from './errors.ts'
import type { Branch, Leaf } from './types.ts'

/**
 * `when()` and `each()` — v1 reconciler stubs per spec §1.6 + §5 (Task 18).
 *
 * Both factories throw `ArborNotImplementedError` immediately on call,
 * before `mount()` ever sees them. They are exported so the compiler can
 * emit syntactically valid calls today; the v1 reconciler implementation
 * MUST accept these exact signatures (locked).
 *
 * Why typed throws and not silent no-ops: per spec §1.6 + Architect B's
 * runtime spec Q10 — silent no-ops would mask bugs in compiler-emitted
 * code (a `when(condition, grow)` that returns `undefined` instead of a
 * Branch would corrupt mount). The typed throw fails fast.
 *
 * Parameters are prefixed with `_` to mark them unused at the body level
 * while preserving the locked public signature for the v1 reconciler.
 */

/**
 * Conditional rendering primitive — v1 reconciler stub.
 *
 * Throws `ArborNotImplementedError('when()')` on call. The v1 reconciler
 * will swap the body to materialize `grow()` when `condition` reads true,
 * and remove/dispose when it reads false.
 */
export function when(_condition: Signal<boolean>, _grow: () => Branch | Leaf): Branch {
  throw new ArborNotImplementedError('when()')
}

/**
 * List rendering primitive — v1 reconciler stub.
 *
 * Throws `ArborNotImplementedError('each()')` on call. The v1 reconciler
 * will swap the body to materialize one child per item with `key(item)` as
 * the reconciliation identity and `grow(item, index)` as the per-item
 * factory.
 */
export function each<T>(
  _list: Signal<T[]>,
  _key: (item: T) => string | number,
  _grow: (item: T, index: number) => Branch | Leaf,
): Branch {
  throw new ArborNotImplementedError('each()')
}
