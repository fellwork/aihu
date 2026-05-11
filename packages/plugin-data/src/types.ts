import type { Signal } from '@aihu/signals'
import type { ResourceStore } from './store.ts'

/**
 * All possible states of a reactive resource.
 *
 * Discriminated on `status`. Consumers should exhaustively match all five
 * cases; the `streaming` case should be handled as a default/fallthrough
 * until streaming adapters are available in v1+.
 */
export type DataState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown }
  | { readonly status: 'streaming'; readonly data: T; readonly done: false }

/**
 * The object returned by createResource. Combines a reactive state signal
 * with imperative controls.
 *
 * .state is a Signal<DataState<T>> — read it inside effects and templates
 * exactly as any other signal (state[0]() to get the current state).
 */
export interface Resource<T> {
  readonly state: Signal<DataState<T>>
  /** Immediately trigger a new fetch for the current key, bypassing cache. */
  refetch(): void
  /**
   * Mark the cached entry stale. Does NOT trigger an immediate fetch.
   * The next refetch() call or key-signal change will perform a fresh fetch.
   */
  invalidate(): void
}

/**
 * Internal extension of Resource<T> that adds dispose() for test teardown
 * and component lifecycle management. Not part of the public Resource<T>
 * interface — component teardown is handled by the framework's effect
 * lifecycle. Exposed from createResource's implementation for tests.
 */
export interface ResourceHandle<T> extends Resource<T> {
  /** Stop watching the key signal. Call during teardown to release the effect. */
  dispose(): void
}

export interface ResourceOptions<T> {
  /**
   * Initial value surfaced as { status: 'ready', data: initialData } before
   * the first fetch completes. If omitted, the resource starts as { status: 'idle' }.
   */
  initialData?: T
  /**
   * When true, this resource is included in the SSR dehydration payload
   * emitted by createResourceSerializer(). Default: false.
   */
  dehydrate?: boolean
  /**
   * Cache store to use. When omitted, createResource attempts to inject
   * ResourceStoreToken from @aihu/context; if that also yields undefined,
   * the module-level default singleton store is used.
   */
  store?: ResourceStore
}
