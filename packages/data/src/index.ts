/**
 * @scribe/data — signal-native, backend-agnostic data fetching primitive.
 *
 * Primary API:
 *   createResource(key, fetcher, options?) → Resource<T>
 *
 * Cache:
 *   createResourceStore() → ResourceStoreWithMeta
 *   ResourceStoreToken    — context token for store injection
 *
 * SSR dehydration:
 *   createResourceSerializer(store) → () => Record<string, unknown>
 *
 * Dependencies: @scribe/signals, @scribe/context only.
 * Does NOT import from @scribe/server or any Layer 4 package.
 */

export type { DataState, Resource, ResourceOptions } from './types.ts'
export { createResource } from './resource.ts'
export type { ResourceStore, ResourceStoreWithMeta } from './store.ts'
export { createResourceStore, ResourceStoreToken } from './store.ts'
export { createResourceSerializer } from './serializer.ts'
