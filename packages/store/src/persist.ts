/**
 * First-party persistence plugin — localStorage write-through, opt-in per
 * store via `defineStore(id, def, { persist: true | { key } })`.
 *
 * SSR-guarded: storage resolves per instantiation; when `window` is absent
 * (server) the plugin is a no-op for that instance. On client init the
 * stored snapshot is `$patch`ed in (storage wins over any SSR-hydrated
 * value — the device's local edits are the fresher truth). Writes are
 * coalesced per microtask, so a burst of writes (or one `batch`) lands as
 * a single `setItem`.
 */
import type { StateTree, StorePlugin } from './types.ts'

/** Minimal storage contract (satisfied by `window.localStorage`). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface PersistPluginConfig {
  /** Storage backend; defaults to `window.localStorage` (client only). */
  storage?: StorageLike
  /** Key prefix, defaults to `"aihu:"`. Full key: `${prefix}${key ?? id}`. */
  prefix?: string
}

/** Per-store opt-in shape: `{ persist: true }` or `{ persist: { key } }`. */
export interface PersistStoreOptions {
  key?: string
}

/**
 * Build a persistence plugin. Pass a custom `storage` to persist somewhere
 * other than localStorage (or to test). Register globally:
 *
 *   registerStorePlugin(createPersistPlugin())
 */
export function createPersistPlugin(config: PersistPluginConfig = {}): StorePlugin {
  return ({ store, id, options }) => {
    const opt = options?.persist as boolean | PersistStoreOptions | undefined
    if (opt === undefined || opt === false) return undefined
    const storage =
      config.storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    if (storage === undefined) return undefined // SSR / storage unavailable
    const key = `${config.prefix ?? 'aihu:'}${(typeof opt === 'object' && opt.key) || id}`

    // Hydrate-from-storage on init.
    try {
      const stored = storage.getItem(key)
      if (stored !== null) store.$patch(JSON.parse(stored) as StateTree)
    } catch {
      // Corrupt/inaccessible entry: start from current state.
    }

    // Write-through, microtask-coalesced.
    let queued = false
    let latest: StateTree | null = null
    store.$subscribe((state) => {
      latest = state
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        try {
          storage.setItem(key, JSON.stringify(latest))
        } catch {
          // Quota/serialization failure: drop this write, keep subscribing.
        }
      })
    })
    return undefined
  }
}

/** Ready-made persistence plugin with default config (localStorage, `aihu:`). */
export const persistPlugin: StorePlugin = createPersistPlugin()
