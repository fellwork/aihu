import { inject } from '@aihu/context'
import type { Signal } from '@aihu/signals'
import { batch, effect, signal, untrack } from '@aihu/signals'
import type { ResourceStore, ResourceStoreWithMeta } from './store.ts'
import { createResourceStore, ResourceStoreToken } from './store.ts'
import type { DataState, Resource, ResourceHandle, ResourceOptions } from './types.ts'

// Module-level default singleton store, lazy-initialized on first use.
// Priority in createResource: options.store → inject(ResourceStoreToken) → this.
let _defaultStore: ResourceStore | undefined

/**
 * Create a reactive data resource.
 *
 * @param key      Reactive signal whose string value is the cache key.
 *                 null or undefined → resource stays idle (no fetch fired).
 *                 When the signal changes to a new string, the resource
 *                 automatically fetches the new key.
 * @param fetcher  Any (key: string) => Promise<T>. Backend-agnostic.
 *                 Called with the resolved key string at fetch time.
 * @param options  Cache store, dehydration flag, initial data.
 *
 * Returns a ResourceHandle<T> (Resource<T> extended with dispose()).
 * The public return type is Resource<T>; dispose() is accessible for
 * tests and internal lifecycle management.
 *
 * NOTE: The 'streaming' state in DataState<T> is reserved for future
 * fromWebSocket() / fromReadableStream() adapters and is NEVER produced
 * by this function. Only Promise<T> fetchers are handled here.
 */
export function createResource<T>(
  key: Signal<string | null | undefined>,
  fetcher: (key: string) => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T> {
  // 1. Resolve the cache store (injection happens at createResource call time,
  //    i.e. during component setup — matching @aihu/context's sync model).
  const store: ResourceStore =
    options?.store ?? inject(ResourceStoreToken) ?? (_defaultStore ??= createResourceStore())

  // 2. Determine initial state.
  const initialState: DataState<T> =
    options?.initialData !== undefined
      ? { status: 'ready', data: options.initialData }
      : { status: 'idle' }

  // 3. Create the reactive state signal.
  const [getState, setState] = signal<DataState<T>>(initialState)

  // 4. Stale flag. A fresh signal per fetch resets the state; equal-write
  //    suppression in @aihu/signals coalesces repeated invalidate()s in one
  //    batch wave into a single effect re-run (setStale(true) is a no-op once
  //    already true) — the coalescing the old lattice provided, for free.
  let [_staleRead, _setStale] = signal(false)

  // 5. Active fetch guard — prevents a stale Promise from overwriting newer
  //    state. The counter is monotonic (bumped by +1); the bump
  //    runs through untrack() because the signal is mutated inside the
  //    effect below — subscribing the effect to its own version would be a
  //    bug (and would throw SignalCircularError on the self-write). Async
  //    .then callbacks run outside any tracking scope, so direct read() is
  //    safe there.
  // Monotonic fetch-version counter (only ever bumped by +1, so max === +1).
  const [_vRead, _setV] = signal(0)
  const _bump = (): number =>
    untrack(() => {
      const n = _vRead() + 1
      _setV(n)
      return n
    })

  // 6. Internal helper: start a fetch for a given key, writing loading/ready/error.
  function _startFetch(fetchKey: string): void {
    ;[_staleRead, _setStale] = signal(false)
    const fetchId = _bump()
    setState({ status: 'loading' })

    fetcher(fetchKey).then(
      (data) => {
        if (fetchId !== _vRead()) return // superseded by a newer fetch
        const next: DataState<T> = { status: 'ready', data }
        store.set(fetchKey, next as DataState<unknown>)
        // If dehydrate: true, mark this key as dehydration-eligible.
        if (options?.dehydrate) {
          ;(store as Partial<ResourceStoreWithMeta>).markDehydratable?.(fetchKey)
        }
        setState(next)
      },
      (error: unknown) => {
        if (fetchId !== _vRead()) return
        const next: DataState<T> = { status: 'error', error }
        store.set(fetchKey, next as DataState<unknown>)
        setState(next)
      },
    )
  }

  // 7. Watch the key signal via effect().
  //    effect() runs synchronously on creation, then re-runs whenever key[0]()
  //    changes. If the key is already non-null and a fresh cache entry exists,
  //    the resource initializes to 'ready' without calling the fetcher.
  const disposeEffect = effect(() => {
    const currentKey = key[0]()

    if (currentKey == null) {
      // Null/undefined key → idle. Any in-flight fetch is effectively
      // abandoned (its fetchId will be stale when it resolves).
      _bump() // invalidate any in-flight fetch
      setState({ status: 'idle' })
      return
    }

    // Check if a ready cache entry exists and is not stale.
    const cached = store.get(currentKey)
    if (cached?.status === 'ready' && !_staleRead()) {
      setState({ status: 'ready', data: cached.data as T })
      return
    }

    // Start a new fetch for this key.
    _startFetch(currentKey)
  })

  // 8. Build and return the ResourceHandle<T>.
  const handle: ResourceHandle<T> = {
    state: [getState, setState] as unknown as Signal<DataState<T>>,

    refetch(): void {
      const currentKey = key[0]()
      if (currentKey == null) return
      // Delete the store entry to force bypass of cache in next run,
      // then start a fresh fetch directly (don't wait for effect re-run).
      store.delete(currentKey)
      ;[_staleRead, _setStale] = signal(false)
      _startFetch(currentKey)
    },

    invalidate(): void {
      const currentKey = key[0]()
      if (currentKey == null) return
      if (store.get(currentKey)?.status !== 'ready') return
      // Mark stale but do NOT change the signal state — the UI continues
      // showing the last known 'ready' data. batch() coalesces multiple
      // invalidate() calls in the same tick into a single effect re-run.
      // commit() is idempotent within a batch wave.
      batch(() => {
        _setStale(true)
      })
      // No store mutation, no setState call: spec §3.3 invalidate invariant.
    },

    dispose: disposeEffect,
  }
  return handle
}
