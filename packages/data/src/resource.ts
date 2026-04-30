import { effect, signal } from '@scribe/signals'
import type { Signal } from '@scribe/signals'
import { inject } from '@scribe/context'
import { ResourceStoreToken, createResourceStore } from './store.ts'
import type { ResourceStore, ResourceStoreWithMeta } from './store.ts'
import type { DataState, Resource, ResourceHandle, ResourceOptions } from './types.ts'

// ---------------------------------------------------------------------------
// Module-level default singleton store
// ---------------------------------------------------------------------------
//
// Priority for store resolution in createResource:
//   1. options.store             (explicit, highest priority)
//   2. inject(ResourceStoreToken) from @scribe/context  (context-provided)
//   3. module-level singleton    (fallback, lowest priority)
//
// The singleton is lazy-initialized on first use.
let _defaultStore: ResourceStore | null = null

function getDefaultStore(): ResourceStore {
  if (_defaultStore === null) _defaultStore = createResourceStore()
  return _defaultStore
}

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
  //    i.e. during component setup — matching @scribe/context's sync model).
  const store: ResourceStore =
    options?.store ??
    inject(ResourceStoreToken) ??
    getDefaultStore()

  // 2. Determine initial state.
  const initialState: DataState<T> =
    options?.initialData !== undefined
      ? { status: 'ready', data: options.initialData }
      : { status: 'idle' }

  // 3. Create the reactive state signal.
  const [getState, setState] = signal<DataState<T>>(initialState)

  // 4. Stale flag — set by invalidate(), cleared on each new fetch start.
  //    This is a closure variable, not a store property (see spec §5.3).
  let _stale = false

  // 5. Active fetch guard — prevents a stale Promise from overwriting newer
  //    state. Incremented on every new fetch start (including refetch).
  let _fetchId = 0

  // 6. Internal helper: start a fetch for a given key, writing loading/ready/error.
  function _startFetch(fetchKey: string): void {
    _stale = false
    const fetchId = ++_fetchId
    setState({ status: 'loading' })

    fetcher(fetchKey).then(
      (data) => {
        if (fetchId !== _fetchId) return // superseded by a newer fetch
        const next: DataState<T> = { status: 'ready', data }
        store.set(fetchKey, next as DataState<unknown>)
        // If dehydrate: true, mark this key as dehydration-eligible.
        if (options?.dehydrate === true) {
          const meta = store as Partial<ResourceStoreWithMeta>
          meta.markDehydratable?.(fetchKey)
        }
        setState(next)
      },
      (error: unknown) => {
        if (fetchId !== _fetchId) return
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
      _fetchId++ // invalidate any in-flight fetch
      setState({ status: 'idle' })
      return
    }

    // Check if a ready cache entry exists and is not stale.
    const cached = store.get(currentKey)
    if (cached !== undefined && cached.status === 'ready' && !_stale) {
      setState(cached as DataState<T>)
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
      _stale = false
      _startFetch(currentKey)
    },

    invalidate(): void {
      const currentKey = key[0]()
      if (currentKey == null) return
      const current = store.get(currentKey)
      if (current?.status !== 'ready') return
      // Mark stale but do NOT change the signal state — the UI continues
      // showing the last known 'ready' data. The next refetch() or
      // key-signal change will bypass the cache check.
      _stale = true
      // No store mutation, no setState call: spec §3.3 invalidate invariant.
    },

    dispose(): void {
      disposeEffect()
    },
  }

  return handle
}
