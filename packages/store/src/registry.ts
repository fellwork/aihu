/**
 * Registry resolution — where store instances live.
 *
 * Client: one lazy module-singleton registry (per-id lazy singletons).
 * Server: one registry PER REQUEST, carried on @aihu/context's flat SSR
 * context map (`runWithContext` / `setSsrContextMap`). Two concurrent
 * request scopes therefore never share a store instance.
 *
 * This registry is also the store's OWN serialize/hydrate substrate: the
 * SSR state-transfer path (`ssr.ts`) reads instances from here and never
 * touches the arbor tree or `MountScope.serialize()` — a compile-time SSR
 * string renderer that never builds the arbor tree server-side can still
 * serialize stores.
 */
import { createContext, inject, provide } from '@aihu/context'
import type { StoreRegistry } from './types.ts'

/** Same dev-detection convention as @aihu/signals (bundlers inline it). */
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

/**
 * Context token carrying the per-request registry on the server. Written
 * into the request's flat SSR context map on first store use, so the
 * request handler does not need to seed anything — wrapping the render in
 * `runWithContext(new Map(), ...)` is the whole contract.
 */
const RegistryToken = createContext<StoreRegistry>()

/** Client (and unscoped-server-fallback) module singleton. */
let moduleRegistry: StoreRegistry | null = null

function createRegistry(): StoreRegistry {
  return { stores: new Map(), pending: new Map() }
}

/**
 * Resolve the active registry.
 *
 * Server (`typeof window === 'undefined'`): look for a registry on the
 * active SSR context map; if the map does not carry one yet, install a
 * fresh one there (`provide` + re-`inject` proves a map is actually
 * active — `provide` is a no-op outside a request scope). Outside any
 * request scope, fall back to the module singleton.
 *
 * Client: always the module singleton. The context dance is deliberately
 * skipped so a `useStore()` call inside a component setup cannot leak the
 * registry into the component's hierarchical provides.
 */
export function resolveRegistry(): StoreRegistry {
  if (typeof window === 'undefined') {
    const existing = inject(RegistryToken)
    if (existing !== undefined) return existing
    const fresh = createRegistry()
    provide(RegistryToken, fresh)
    if (inject(RegistryToken) === fresh) return fresh
  }
  if (moduleRegistry === null) {
    moduleRegistry = createRegistry()
    if (__DEV__ && typeof window !== 'undefined') {
      // Dev-only inspection hook: id → internal record (record.instance is
      // the store). No devtools UI — just a global for the console.
      ;(globalThis as Record<string, unknown>).__AIHU_STORES__ = moduleRegistry.stores
    }
  }
  return moduleRegistry
}

/**
 * @internal — test-only. Drop the module-singleton registry so each test
 * starts from a clean slate. Does not touch per-request registries.
 */
export function _resetStoreRegistry(): void {
  moduleRegistry = null
  if (__DEV__ && typeof globalThis !== 'undefined') {
    delete (globalThis as Record<string, unknown>).__AIHU_STORES__
  }
}
