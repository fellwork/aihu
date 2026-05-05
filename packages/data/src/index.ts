/**
 * @aihu/data — signal-native, backend-agnostic data fetching primitive.
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
 * Plugin registration (Plugin Contract Spec §3, §7.1):
 *   data() → Plugin — register @aihu/data in defineAihuConfig({ plugins: [data()] })
 *
 * Dependencies: @aihu/signals, @aihu/context only (runtime).
 * @aihu/plugin is build/dev-time only and not bundled into the runtime output.
 */

export { createResource } from './resource.ts'
export { createResourceSerializer } from './serializer.ts'
export type { ResourceStore, ResourceStoreWithMeta } from './store.ts'
export { createResourceStore, ResourceStoreToken } from './store.ts'
export type { DataState, Resource, ResourceOptions } from './types.ts'

// ---------------------------------------------------------------------------
// Plugin factory (Plugin Contract Spec §3)
// ---------------------------------------------------------------------------

import type { Plugin } from '@aihu/plugin'
import { dataPlugin } from './plugin.ts'

/**
 * Plugin factory for `@aihu/data`. Accepts optional configuration (reserved
 * for v0.4+ when `$resource` macro lowering is wired) and returns a configured
 * plugin instance for use in `defineAihuConfig({ plugins: [data()] })`.
 *
 * @example
 * // aihu.config.ts
 * import { data } from '@aihu/data'
 * import { defineAihuConfig } from '@aihu/server'
 *
 * export default defineAihuConfig({
 *   plugins: [data()],
 * })
 */
export function data(_config?: Record<string, never>): Plugin {
  return dataPlugin
}
