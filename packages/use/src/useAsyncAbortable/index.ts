/**
 * `useAsyncAbortable` — `useAsync` plus `AbortController` wiring: a new
 * `execute()` call aborts the previous still-in-flight call, and the
 * current controller is aborted when the surrounding effect scope disposes
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{data()}`, never bare `{data}`.
 *
 * Deliberately thin, same scope note as `useAsync`: not a resource cache or
 * dedup layer — a small reactive wrapper, this time around a
 * signal-accepting async function.
 *
 * SSR (`isClient === false`): `execute()`/`abort()` are documented NO-OPs —
 * `fn` is never called server-side (the isClient no-op invariant).
 */

import { batch, signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseAsyncAbortableOptions<T> {
  /** Invoke `fn` once immediately on call. Default `true`. Only meaningful
   * when `fn` is callable with zero (non-signal) arguments. */
  immediate?: boolean
  /** `data()`'s value before the first resolve. Default `undefined`. */
  initialData?: T
  /** Called with the resolved value after a successful (non-aborted)
   * `execute()`. */
  onSuccess?: (data: T) => void
  /** Called with the caught error after a rejected `execute()` — NOT
   * called when the rejection is the abort itself (see module doc). */
  onError?: (error: unknown) => void
  /** Clear `error()` and `isFinished()` at the START of each `execute()`
   * call. Default `true`. */
  resetOnExecute?: boolean
}

export interface UseAsyncAbortableReturn<T, Args extends unknown[]> {
  /** Reactive getter — read as `{data()}` in templates (parens required). */
  readonly data: () => T | undefined
  /** Reactive getter — the last caught error, or `undefined`. An abort
   * never populates this (see module doc). */
  readonly error: () => unknown
  /** Reactive getter — `true` while a call is in flight. */
  readonly isLoading: () => boolean
  /** Reactive getter — `true` once at least one call has settled
   * (resolved, rejected, or was superseded/aborted). */
  readonly isFinished: () => boolean
  /**
   * (Re)invoke `fn`, passing it an `AbortSignal` as its first argument
   * (then `...args`). Aborts the PREVIOUS in-flight call (if any) first —
   * only one call is ever in flight at a time. An aborted call's
   * resolve/reject is silently dropped: it updates neither `data` nor
   * `error`.
   */
  execute: (...args: Args) => Promise<T | undefined>
  /** Abort the current in-flight call, if any. Idempotent. Does not by
   * itself start a new call. */
  abort: () => void
}

/**
 * `useAsync`, but `fn` receives an `AbortSignal` it should pass to
 * `fetch`/etc. so a superseding `execute()` call (or scope teardown) can
 * cancel real in-flight work, not just drop the eventual result.
 */
export function useAsyncAbortable<T, Args extends unknown[] = []>(
  fn: (signal: AbortSignal, ...args: Args) => Promise<T>,
  options: UseAsyncAbortableOptions<T> = {},
): UseAsyncAbortableReturn<T, Args> {
  const { immediate = true, initialData, onSuccess, onError, resetOnExecute = true } = options

  // SSR: static getters of the initial state, no signal, no controller —
  // execute()/abort() never touch `fn` or AbortController (isClient no-op
  // invariant; some SSR runtimes don't even define AbortController).
  if (!isClient) {
    const data = (): T | undefined => initialData
    const error = (): unknown => undefined
    const isLoading = (): boolean => false
    const isFinished = (): boolean => false
    const execute = async (): Promise<T | undefined> => undefined
    const abort = (): void => {}
    return { data, error, isLoading, isFinished, execute, abort }
  }

  const [data, setData] = signal<T | undefined>(initialData)
  const [error, setError] = signal<unknown>(undefined)
  const [isLoading, setIsLoading] = signal(false)
  const [isFinished, setIsFinished] = signal(false)

  let controller: AbortController | undefined
  // Call-identity guard, same rationale as useAsync: a resolve/reject that
  // arrives after a NEWER execute() has already started must not clobber
  // that newer call's state (belt-and-suspenders alongside the abort
  // itself, which handles the common case but not a `fn` that swallows the
  // signal and resolves anyway).
  let callId = 0

  const abort = (): void => {
    controller?.abort()
  }

  const execute = async (...args: Args): Promise<T | undefined> => {
    // A new call always supersedes any call still in flight.
    controller?.abort()
    const ac = new AbortController()
    controller = ac
    const id = ++callId

    if (resetOnExecute) {
      batch(() => {
        setError(undefined)
        setIsFinished(false)
      })
    }
    setIsLoading(true)
    try {
      const result = await fn(ac.signal, ...args)
      // A NEWER execute() has already taken over — that call owns
      // isLoading/isFinished now, so this settle is dropped entirely.
      if (id !== callId) return undefined
      if (ac.signal.aborted) {
        // Standalone abort (no superseding call): nothing else will ever
        // settle this state, so isLoading/isFinished must clear here or
        // they get stuck forever (error is left untouched — an abort is
        // not a failure).
        batch(() => {
          setIsLoading(false)
          setIsFinished(true)
        })
        return undefined
      }
      batch(() => {
        // Functional-updater form — see useAsync/useLocalStorage.
        setData(() => result)
        setIsLoading(false)
        setIsFinished(true)
      })
      onSuccess?.(result)
      return result
    } catch (e) {
      // An aborted call rejecting (either via a native AbortError from
      // `fetch`, or `fn` observing `signal.aborted` and throwing its own)
      // is EXPECTED, not a real failure — surfacing it as `error` would
      // flash a spurious error state on every superseded call (e.g. fast
      // typeahead re-fetching). Silently drop it instead.
      if (id !== callId) return undefined // superseded — newer call owns state
      if (ac.signal.aborted) {
        // Standalone abort: same reasoning as the resolve path above —
        // clear isLoading/isFinished so a bound spinner doesn't hang
        // forever, but leave `error` untouched.
        batch(() => {
          setIsLoading(false)
          setIsFinished(true)
        })
        return undefined
      }
      batch(() => {
        setError(e)
        setIsLoading(false)
        setIsFinished(true)
      })
      onError?.(e)
      return undefined
    }
  }

  tryOnScopeDispose(() => {
    controller?.abort()
  })

  if (immediate) {
    // Fire-and-forget: execute() catches internally.
    void execute(...([] as unknown as Args))
  }

  return { data, error, isLoading, isFinished, execute, abort }
}
