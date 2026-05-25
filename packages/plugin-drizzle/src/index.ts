/**
 * @aihu-plugin/drizzle — Drizzle ORM data adapter for aihu.
 *
 * SERVER-ONLY. Produces typed data-access shapes from Drizzle queries:
 *
 *   createDrizzleResource(db, queryFn, options?) → (key: string) => Promise<T>
 *       A fetcher compatible with `@aihu-plugin/data`'s
 *       `createResource(keySignal, fetcher, options?)`.
 *
 *   drizzleLoader(db, queryFn) → DefinedLoader<T>
 *       An SSR loader for `@aihu/server`'s `defineLoader` / `defineRoute`.
 *
 * Plugin registration (Plugin Contract Spec §3, §7.1):
 *   drizzle() → Plugin — register in `defineAihuConfig({ plugins: [drizzle()] })`.
 *
 * Optional peers: `drizzle-orm` and its drivers (`postgres`, `@libsql/client`)
 * are OPTIONAL peerDependencies. This package imports NO `drizzle-orm` runtime
 * value (Drizzle types are referenced via `import type` only), so importing it
 * never breaks when the peers are absent. The caller supplies the `db` handle.
 *
 * NOT browser-eligible: a Drizzle `db` handle holds a live DB connection, so the
 * adapter runs only in the SSR / loader tier and carries NO `.size-limit.json`
 * row (see `.size-limit.README.md`, server-side classification).
 */

export type { DefinedLoader } from './query.ts'
export { createDrizzleResource, drizzleLoader } from './query.ts'
export type { DrizzleQuery, DrizzleQueryFn, DrizzleResourceOptions } from './types.ts'

// ---------------------------------------------------------------------------
// Plugin factory (Plugin Contract Spec §3)
// ---------------------------------------------------------------------------

import type { Plugin } from '@aihu/plugin'
import { drizzlePlugin } from './plugin.ts'

/**
 * Plugin factory for `@aihu-plugin/drizzle`. Accepts optional configuration
 * (reserved for v0.4+ when query-macro lowering is wired) and returns the
 * configured plugin instance for `defineAihuConfig({ plugins: [drizzle()] })`.
 *
 * @example
 * // aihu.config.ts
 * import { drizzle } from '@aihu-plugin/drizzle'
 * import { defineAihuConfig } from '@aihu/server'
 *
 * export default defineAihuConfig({
 *   plugins: [drizzle()],
 * })
 */
export function drizzle(_config?: Record<string, never>): Plugin {
  return drizzlePlugin
}
