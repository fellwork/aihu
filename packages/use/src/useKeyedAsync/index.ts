/**
 * `useKeyedAsync` — an async resource whose IDENTITY is a reactive `key`:
 * changing the key clears `data` synchronously and cancels the previous
 * key's in-flight request (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * This fills a gap `useAsync`/`useAsyncAbortable` deliberately leave open:
 * those wrap a manually-invoked `execute()` with "last call wins"
 * semantics, but the PREVIOUS call's `data` stays visible while a new call
 * is in flight (stale-while-revalidate) — correct for a plain re-fetch, but
 * wrong once the call's IDENTITY has changed. A payload keyed to an
 * abandoned identity is not just outdated, it can be actively wrong to
 * show — e.g. re-anchoring word-level annotations to the wrong verse
 * during the async window while navigating. `useKeyedAsync` resets to
 * `initialData` the INSTANT `key()` changes, before `fn` is even called.
 *
 * `key()` returning `null`/`undefined` means "nothing to fetch": state
 * resets and `fn` is not called — no request, no loading state.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{data()}`, never bare `{data}`.
 *
 * SSR (`isClient === false`): static getters of the initial state; `key()`
 * is never read and `fn` is never called (the isClient no-op invariant —
 * `useWatch()` itself already no-ops server-side, but this composable branches
 * explicitly too, matching every other `@aihu/use` composable's house style).
 */
import { batch, signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'
import { useWatch } from '../useWatch/index.ts'

export interface UseKeyedAsyncOptions<T> {
  /** `data()`'s value before the first resolve, and whenever the key
   * resets to `null`/`undefined`. Default `undefined`. */
  initialData?: T
  /** Called with the resolved value after a successful fetch for the
   * CURRENT key (a superseded key's resolve never calls this). */
  onSuccess?: (data: T) => void
  /** Called with the caught error after a rejected fetch for the CURRENT
   * key. NOT called when the rejection is the abort itself (see module
   * doc on `useAsyncAbortable` for the same rule). */
  onError?: (error: unknown) => void
}

export interface UseKeyedAsyncReturn<T> {
  /** Reactive getter — read as `{data()}` in templates (parens required).
   * The latest resolved value for the CURRENT key, or `initialData`. */
  readonly data: () => T | undefined
  /** Reactive getter — the last caught error for the CURRENT key, or
   * `undefined`. Cleared the instant the key changes. */
  readonly error: () => unknown
  /** Reactive getter — `true` while a fetch for the CURRENT key is in
   * flight. */
  readonly isLoading: () => boolean
  /** Reactive getter — `true` once the CURRENT key's fetch has settled
   * (resolved or rejected); `false` again the instant the key changes. */
  readonly isFinished: () => boolean
  /** Re-run `fn` for the CURRENT key WITHOUT clearing `data` first — a
   * refresh, not a navigation to a different identity. No-op when the
   * current key is `null`/`undefined`. */
  reload: () => void
}

/**
 * Fetch `fn(key, signal)` whenever the reactive `key()` getter's value
 * changes (`useWatch`'s `Object.is` value-change gate — shallow, by
 * reference; a key that mutates in place is not detected as a change). The
 * `AbortSignal` lets `fn` cancel real in-flight work (`fetch(url,
 * { signal })`) when a newer key supersedes it, mirroring
 * `useAsyncAbortable` — just driven by key identity instead of a manual
 * `execute()` call.
 */
export function useKeyedAsync<T, K>(
  key: () => K | null | undefined,
  fn: (key: K, signal: AbortSignal) => Promise<T>,
  options: UseKeyedAsyncOptions<T> = {},
): UseKeyedAsyncReturn<T> {
  const { initialData, onSuccess, onError } = options

  if (!isClient) {
    const data = (): T | undefined => initialData
    const error = (): unknown => undefined
    const isLoading = (): boolean => false
    const isFinished = (): boolean => false
    const reload = (): void => {}
    return { data, error, isLoading, isFinished, reload }
  }

  const [data, setData] = signal<T | undefined>(initialData)
  const [error, setError] = signal<unknown>(undefined)
  const [isLoading, setIsLoading] = signal(false)
  const [isFinished, setIsFinished] = signal(false)

  // Call-identity guard, same rationale as useAsync/useAsyncAbortable: a
  // resolve/reject that arrives after a NEWER call (a superseding key, or a
  // reload()) has already started must not clobber that newer call's state.
  let callId = 0
  let currentKey: K | null | undefined
  let controller: AbortController | undefined

  const run = (k: K, ac: AbortController): void => {
    const id = ++callId
    setIsLoading(true)
    fn(k, ac.signal)
      .then((result) => {
        if (id !== callId) return // superseded — drop this result
        batch(() => {
          setData(() => result)
          setIsLoading(false)
          setIsFinished(true)
        })
        onSuccess?.(result)
      })
      .catch((e) => {
        if (id !== callId) return // superseded — drop this rejection
        if (ac.signal.aborted) {
          // Standalone abort (nothing else will ever settle this call):
          // clear isLoading/isFinished so a bound spinner doesn't hang
          // forever; error stays untouched — an abort is not a failure.
          batch(() => {
            setIsLoading(false)
            setIsFinished(true)
          })
          return
        }
        batch(() => {
          setError(e)
          setIsLoading(false)
          setIsFinished(true)
        })
        onError?.(e)
      })
  }

  useWatch(
    key,
    (k, _oldKey, onCleanup) => {
      controller?.abort()
      currentKey = k
      // Clear IMMEDIATELY on key change — never paint the previous key's
      // data under the new key while its fetch is in flight (the property
      // that distinguishes this from useAsync/useAsyncAbortable).
      batch(() => {
        setData(() => initialData)
        setError(undefined)
        setIsLoading(false)
        setIsFinished(false)
      })
      if (k === null || k === undefined) return
      const ac = new AbortController()
      controller = ac
      onCleanup(() => ac.abort())
      run(k, ac)
    },
    { immediate: true },
  )

  const reload = (): void => {
    if (currentKey === null || currentKey === undefined) return
    controller?.abort()
    const ac = new AbortController()
    controller = ac
    run(currentKey, ac)
  }

  return { data, error, isLoading, isFinished, reload }
}
