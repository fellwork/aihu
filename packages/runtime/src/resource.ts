/**
 * `createResource` — reactive async-resource primitive for `@aihu/runtime`.
 *
 * Parallel to `createStream` (see `stream.ts`): the compiler lowers a plain
 * `$resource` collection entry to `const <name> = createResource(() => <body>)`
 * and imports this from `@aihu/runtime` (gated by `needs_create_resource`).
 * Magna-backed `$resource` (a `data.X.query(...)` body) lowers to
 * `createMagnaResource` from `@aihu/magna` instead — that path is unaffected.
 *
 * The handle exposes reactive `loading` / `data` / `error` getters (signal reads,
 * so template bindings like `{user.loading}` re-render) plus `refetch()`. The
 * factory runs eagerly on creation; `refetch()` re-runs it. A monotonic sequence
 * guard drops the result of any run superseded by a newer one, so overlapping
 * refetches never clobber fresher data.
 */

import { signal } from '@aihu/signals'

export interface ResourceHandle<T> {
  /** True while a fetch is in flight (initial load or a refetch). */
  readonly loading: boolean
  /** The latest resolved value, or `null` before the first success. */
  readonly data: T | null
  /** The error from the most recent failed run, or `null`. */
  readonly error: Error | null
  /** Re-run the factory. Resolves when the run settles. */
  refetch(): Promise<void>
}

/**
 * Create a reactive resource backed by an async `factory`. The factory runs
 * immediately; `loading` starts `true`.
 */
export function createResource<T>(factory: () => Promise<T>): ResourceHandle<T> {
  const [getLoading, setLoading] = signal<boolean>(true)
  const [getData, setData] = signal<T | null>(null)
  const [getError, setError] = signal<Error | null>(null)
  let seq = 0

  async function run(): Promise<void> {
    const current = ++seq
    setLoading(true)
    setError(null)
    try {
      const result = await factory()
      if (current !== seq) return // superseded by a newer run — drop this result
      // Updater form (not `setData(result)`): `T` is unconstrained, so a bare
      // value would be ambiguous with the signal's functional-update overload.
      setData(() => result)
    } catch (err) {
      if (current !== seq) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (current === seq) setLoading(false)
    }
  }

  // Eager initial fetch (the $resource contract: it starts loading on mount).
  void run()

  return {
    get loading() {
      return getLoading()
    },
    get data() {
      return getData()
    },
    get error() {
      return getError()
    },
    refetch() {
      return run()
    },
  }
}
