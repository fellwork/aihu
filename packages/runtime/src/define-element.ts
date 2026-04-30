/**
 * `defineElement` — registration shim for compiler-emitted custom
 * element classes. Full implementation lands in Task 21.
 *
 * Per `.team/phase-4/spec-runtime.md` §1.2 + §2.2 + §2.3.
 */

import type { DefineOptions } from './types.ts'

export function defineElement(
  _name: string,
  _Ctor: typeof HTMLElement,
  _options?: DefineOptions,
): void {
  throw new Error('not implemented')
}
