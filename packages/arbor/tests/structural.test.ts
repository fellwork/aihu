import { describe, expect, it } from 'vitest'
import { ArborNotImplementedError, each, when } from '../src/index.ts'

/**
 * Tests for `when()` and `each()` v1-reconciler stubs per spec §1.6 + §4
 * (Task 18). Both factories throw `ArborNotImplementedError` immediately
 * on call — before `mount()` ever sees them — so the v1 reconciler upgrade
 * is a no-public-API change. Signatures are locked.
 *
 * The args are coerced via `as never` because the stubs throw before reading
 * them. The point of these tests is purely the synchronous-throw contract.
 */

describe('structural stubs', () => {
  it('when() throws ArborNotImplementedError synchronously (spec §4 Task 18 #1)', () => {
    expect(() => when([() => true, () => {}] as never, () => null as never)).toThrow(
      ArborNotImplementedError,
    )
  })

  it('each() throws ArborNotImplementedError synchronously (spec §4 Task 18 #2)', () => {
    expect(() =>
      each(
        [() => [], () => {}] as never,
        (x) => String(x),
        () => null as never,
      ),
    ).toThrow(ArborNotImplementedError)
  })
})
