import { createContext } from '@aihu/context'
import type { DataState } from './types.ts'

/**
 * Cache store interface for @aihu/data resources.
 *
 * The public interface is intentionally minimal — it covers cache I/O and
 * iteration. Staleness tracking is an internal createResource concern.
 */
export interface ResourceStore {
  /** Get the cached state for a key, or undefined if not cached. */
  get(key: string): DataState<unknown> | undefined
  /** Write a state entry into the cache. */
  set(key: string, state: DataState<unknown>): void
  /** Delete a cache entry (used by refetch() to force a fresh load). */
  delete(key: string): void
  /** Iterate all entries (used by createResourceSerializer). */
  entries(): IterableIterator<[string, DataState<unknown>]>
}

/**
 * Extended internal store type that includes dehydration tracking.
 * Returned by createResourceStore(). Not part of the public ResourceStore
 * interface — dehydratableKeys is an implementation detail for SSR.
 */
export interface ResourceStoreWithMeta extends ResourceStore {
  /** Keys whose ready state should be included in SSR dehydration. */
  readonly dehydratableKeys: Set<string>
  /**
   * Register a key as dehydration-eligible. Called by createResource when
   * dehydrate: true on a successful fetch.
   */
  markDehydratable(key: string): void
}

/**
 * Create a new in-memory ResourceStore backed by a plain Map.
 * No eviction, no TTL, no LRU in v1. Store size is bounded by the
 * application's usage patterns.
 *
 * The returned store also implements ResourceStoreWithMeta for SSR
 * dehydration tracking via markDehydratable() and dehydratableKeys.
 */
export function createResourceStore(): ResourceStoreWithMeta {
  const _map = new Map<string, DataState<unknown>>()
  const dehydratableKeys = new Set<string>()
  return {
    get: (key) => _map.get(key),
    set: (key, state) => _map.set(key, state),
    delete: (key) => _map.delete(key),
    entries: () => _map.entries(),
    dehydratableKeys,
    markDehydratable: (key) => dehydratableKeys.add(key),
  }
}

/**
 * Context token for the ResourceStore.
 * Inject in component setup:  const store = inject(ResourceStoreToken)
 * Provide at app root:        provide(ResourceStoreToken, createResourceStore())
 *
 * No default value is provided — inject(ResourceStoreToken) returns undefined
 * when no store is provided, which causes createResource to fall back to the
 * module-level singleton store.
 */
export const ResourceStoreToken = createContext<ResourceStore>()
