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
 * Plugin registration (Plugin Contract Spec §3, §7.1):
 *   data() → Plugin — register @scribe/data in defineScribeConfig({ plugins: [data()] })
 *
 * Dependencies: @scribe/signals, @scribe/context only (runtime).
 * @scribe/plugin is build/dev-time only and not bundled into the runtime output.
 */

export type { DataState, Resource, ResourceOptions } from './types.ts'
export { createResource } from './resource.ts'
export type { ResourceStore, ResourceStoreWithMeta } from './store.ts'
export { createResourceStore, ResourceStoreToken } from './store.ts'
export { createResourceSerializer } from './serializer.ts'

// ---------------------------------------------------------------------------
// Plugin factory (Plugin Contract Spec §3)
// ---------------------------------------------------------------------------

import type { Plugin } from '@scribe/plugin'
import { dataPlugin } from './plugin.ts'


/**
 * Plugin factory for `@scribe/data`. Accepts optional configuration (reserved
 * for v0.4+ when `$resource` macro lowering is wired) and returns a configured
 * plugin instance for use in `defineScribeConfig({ plugins: [data()] })`.
 *
 * @example
 * // scribe.config.ts
 * import { data } from '@scribe/data'
 * import { defineScribeConfig } from '@scribe/server'
 *
 * export default defineScribeConfig({
 *   plugins: [data()],
 * })
 */
export function data(_config?: Record<string, never>): Plugin {
  return dataPlugin
}
