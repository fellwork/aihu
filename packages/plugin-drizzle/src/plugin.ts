import type { Plugin } from '@aihu/plugin'

/**
 * `@aihu-plugin/drizzle` plugin — registration shim.
 *
 * Registers the Drizzle adapter under the Plugin Contract (Plugin Contract Spec
 * §1.1, §3, §7.1). Like `@aihu-plugin/data`, this ships registration plumbing
 * ONLY — `contributes: {}` is a deliberate no-op. The adapter's value lives in
 * the runtime helper library (`createDrizzleResource` / `drizzleLoader`), NOT in
 * macro lowering: the compiler's macro-lowering dispatcher is a no-op until
 * v0.4, so there is no `$resource`-style macro to wire here yet.
 *
 * `serverOnly: true` marks this plugin's (future) contributions as server-bundle
 * only — a Drizzle `db` handle holds a live DB connection and must never reach a
 * browser bundle (Plugin Contract Spec §6.5 / Amendment 03).
 *
 * We construct the Plugin object directly (satisfying the `Plugin` type contract
 * via `__aihu_plugin: true`) rather than calling `definePlugin()`, keeping
 * `@aihu/plugin` a build/type-only dependency with zero runtime footprint — same
 * pattern as `@aihu-plugin/data`'s `dataPlugin`.
 *
 * Consumers register it via:
 *   defineAihuConfig({ plugins: [drizzle()] })
 */
export const drizzlePlugin: Plugin = {
  name: 'drizzle',
  version: '0.1.0',
  namespace: 'drizzle',
  serverOnly: true,
  contributes: {}, // no-op until v0.4 lowers query macros
  __aihu_plugin: true,
}
