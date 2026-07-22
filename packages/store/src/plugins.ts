/**
 * Global plugin registration. Plugins are behavior, not state: the set is
 * module-global on purpose (shared across SSR requests — each request's
 * stores still get their own plugin *invocations* at instantiation).
 */
import type { Dispose } from '@aihu/signals'
import type { StorePlugin } from './types.ts'

const plugins = new Set<StorePlugin>()

/**
 * Register a plugin globally. It runs once for every store instantiated
 * afterwards (already-live instances are not retro-visited), receiving
 * `{ store, id, options }`. A returned record is merged onto the
 * instance. Returns a dispose that unregisters the plugin.
 */
export function registerStorePlugin(plugin: StorePlugin): Dispose {
  plugins.add(plugin)
  return () => {
    plugins.delete(plugin)
  }
}

/** @internal — snapshot of the active plugin list, in registration order. */
export function _activePlugins(): StorePlugin[] {
  return [...plugins]
}
