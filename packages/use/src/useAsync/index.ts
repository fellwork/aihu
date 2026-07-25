/**
 * `useAsync` — reactive state around a single async function: `data`,
 * `error`, `isLoading`, `isFinished`, plus a manual `execute()` to
 * (re)invoke it (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{data()}`, never bare `{data}`.
 *
 * Deliberately thin: this is NOT a resource cache, request dedup layer, or
 * suspense integration — `@aihu/runtime`'s `createResource` already owns
 * that (CORE `@aihu/use` depends on `@aihu/signals` only, so it cannot
 * import `@aihu/runtime` even if it wanted to duplicate that machinery).
 * `useAsync` is the `@aihu/use`-house equivalent of VueUse's
 * `useAsyncState`/`useAsync`: a small reactive wrapper around one
 * caller-supplied async function, nothing more.
 *
 * SSR (`isClient === false`): `execute()` is a documented NO-OP that
 * resolves to `undefined` without ever calling `fn` — server-side
 * data-fetching is explicitly out of scope for `@aihu/use` (the isClient
 * no-op invariant: no signal, no async machinery, no risk of an
 * unhandled-rejection escaping SSR setup). Getters return the initial
 * (unresolved) state.
 */

import { batch, signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'

export interface UseAsyncOptions<T> {
  /** Invoke `fn` once immediately on call. Default `true`. Only meaningful
   * when `fn` is callable with zero arguments — a `fn` that requires
   * arguments should pass `immediate: false` and call `execute(...)`
   * itself. */
  immediate?: boolean
  /** `data()`'s value before the first resolve. Default `undefined`. */
  initialData?: T
  /** Called with the resolved value after a successful `execute()`. */
  onSuccess?: (data: T) => void
  /** Called with the caught error after a rejected `execute()`. */
  onError?: (error: unknown) => void
  /** Clear `error()` and `isFinished()` at the START of each `execute()`
   * call (before `fn` resolves). Default `true` — set `false` to keep the
   * previous error/data visible while a re-fetch is in flight. */
  resetOnExecute?: boolean
}

export interface UseAsyncReturn<T, Args extends unknown[]> {
  /** Reactive getter — read as `{data()}` in templates (parens required).
   * The last resolved value, or `initialData` before the first resolve. */
  readonly data: () => T | undefined
  /** Reactive getter — the last caught error, or `undefined`. Cleared at
   * the start of the next `execute()` when `resetOnExecute` (default). */
  readonly error: () => unknown
  /** Reactive getter — `true` while an `execute()` call is in flight. */
  readonly isLoading: () => boolean
  /** Reactive getter — `true` once at least one `execute()` call has
   * settled (resolved OR rejected). */
  readonly isFinished: () => boolean
  /** (Re)invoke `fn`. A call in flight is NOT cancelled by a new call (see
   * `useAsyncAbortable` for that) — but only the LATEST call's result is
   * ever written to `data`/`error`/`isLoading`/`isFinished` (a stale
   * resolve from a superseded call is silently dropped). */
  execute: (...args: Args) => Promise<T | undefined>
}

/**
 * Wrap `fn` in reactive `data`/`error`/`isLoading`/`isFinished` getters plus
 * a manual `execute()`. `immediate` (default) fires one zero-argument
 * `execute()` call right away on the client.
 */
export function useAsync<T, Args extends unknown[] = []>(
  fn: (...args: Args) => Promise<T>,
  options: UseAsyncOptions<T> = {},
): UseAsyncReturn<T, Args> {
  const { immediate = true, initialData, onSuccess, onError, resetOnExecute = true } = options

  // SSR: static getters of the initial state, no signal — execute() never
  // calls `fn` (the isClient no-op invariant: no server-side fetching).
  if (!isClient) {
    const data = (): T | undefined => initialData
    const error = (): unknown => undefined
    const isLoading = (): boolean => false
    const isFinished = (): boolean => false
    const execute = async (): Promise<T | undefined> => undefined
    return { data, error, isLoading, isFinished, execute }
  }

  const [data, setData] = signal<T | undefined>(initialData)
  const [error, setError] = signal<unknown>(undefined)
  const [isLoading, setIsLoading] = signal(false)
  const [isFinished, setIsFinished] = signal(false)

  // Call-identity guard: a stale resolve/reject from a SUPERSEDED execute()
  // call (an earlier call that hasn't settled yet when a newer one starts)
  // must not clobber the newer call's in-flight/settled state. Last call
  // wins, not last resolve.
  let callId = 0

  const execute = async (...args: Args): Promise<T | undefined> => {
    const id = ++callId
    if (resetOnExecute) {
      batch(() => {
        setError(undefined)
        setIsFinished(false)
      })
    }
    setIsLoading(true)
    try {
      const result = await fn(...args)
      if (id !== callId) return undefined // superseded — drop this result
      batch(() => {
        // Functional-updater form: `T` is generic/unconstrained, so a bare
        // `result` is ambiguous against `Write<T>`'s updater overload when
        // `T` could itself be a function (see useLocalStorage/useDebounced).
        setData(() => result)
        setIsLoading(false)
        setIsFinished(true)
      })
      onSuccess?.(result)
      return result
    } catch (e) {
      if (id !== callId) return undefined // superseded — drop this rejection
      batch(() => {
        setError(e)
        setIsLoading(false)
        setIsFinished(true)
      })
      onError?.(e)
      return undefined
    }
  }

  if (immediate) {
    // Fire-and-forget: execute() catches internally, so there is no
    // unhandled-rejection risk from not awaiting it here.
    void execute(...([] as unknown as Args))
  }

  return { data, error, isLoading, isFinished, execute }
}
