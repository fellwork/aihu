/**
 * SSR state transfer — registry-based, arbor-independent.
 *
 * Wire shape (`<script type="application/json">` compatible):
 *
 *   { [storeId]: { [stateKey]: jsonValue } }
 *
 * Server (inside the request's `runWithContext` scope, after render):
 *
 *   const json = JSON.stringify(serializeStores()).replace(/</g, '\\u003c')
 *   html += `<script type="application/json" id="__AIHU_STORE_STATE__">${json}</script>`
 *
 * Client (entry point, BEFORE mounting components):
 *
 *   const el = document.getElementById('__AIHU_STORE_STATE__')
 *   if (el) hydrateStores(JSON.parse(el.textContent!))
 *
 * Only state (signal pairs) is serialized — never getters or actions.
 * A store instantiated on the client that has no snapshot entry simply
 * initializes fresh; a snapshot entry whose store is never used stays
 * pending and is adopted lazily if/when the store is first used.
 *
 * This path deliberately does NOT depend on the arbor walk or
 * `MountScope.serialize()`: a compile-time SSR string renderer that never
 * builds the arbor tree server-side serializes stores exactly the same way.
 */
import { untrack } from '@aihu/signals'
import { resolveRegistry } from './registry.ts'
import { _adoptState } from './store.ts'
import type { StateTree } from './types.ts'

/**
 * Snapshot every instantiated store in the ACTIVE registry (per-request on
 * the server) as `{ storeId: { stateKey: value } }`. Reads are untracked —
 * serializing never subscribes anything.
 */
export function serializeStores(): Record<string, StateTree> {
  const registry = resolveRegistry()
  const out: Record<string, StateTree> = {}
  for (const [id, internal] of registry.stores) {
    const snapshot: StateTree = {}
    for (const [key, read] of internal.stateReads) snapshot[key] = untrack(read)
    out[id] = snapshot
  }
  return out
}

/**
 * Pre-seed store state from a server snapshot. Call BEFORE components run:
 * stores instantiated later adopt their snapshot entry during
 * instantiation (before any subscriber can observe initial values), so
 * client setups adopt server values instead of re-deriving them.
 * Already-instantiated stores are patched immediately.
 */
export function hydrateStores(snapshot: Record<string, StateTree>): void {
  const registry = resolveRegistry()
  for (const [id, state] of Object.entries(snapshot)) {
    const existing = registry.stores.get(id)
    if (existing !== undefined) _adoptState(existing, state)
    else registry.pending.set(id, state)
  }
}
