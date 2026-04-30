import type { ResourceStore } from './store.ts'
import type { ResourceStoreWithMeta } from './store.ts'

/**
 * Returns a serializer function compatible with SsrOptions.serializer.
 *
 * The serializer emits all store entries that are:
 *   (a) status === 'ready', AND
 *   (b) marked with { dehydrate: true } in their ResourceOptions
 *       (tracked via store.markDehydratable).
 *
 * Entries that are not status 'ready' (loading, error, idle) are skipped.
 * Entries without a markDehydratable call are skipped.
 *
 * Usage:
 *   const store = createResourceStore()
 *   await renderToString(app, {
 *     serializer: createResourceSerializer(store),
 *   })
 *
 * NOTE: Client-side rehydration is NOT a @scribe/data concern. The application
 * entry point reads the dehydrated JSON from <script id="__scribe_state__"> and
 * pre-populates a ResourceStore before providing it via ResourceStoreToken. See
 * spec §6.5 for the client rehydration pattern.
 */
export function createResourceSerializer(
  store: ResourceStore,
): () => Record<string, unknown> {
  return (): Record<string, unknown> => {
    const resources: Record<string, unknown> = {}
    const meta = store as Partial<ResourceStoreWithMeta>
    const eligible = meta.dehydratableKeys ?? new Set<string>()
    for (const [key, state] of store.entries()) {
      if (state.status === 'ready' && eligible.has(key)) {
        resources[key] = state
      }
    }
    return { resources }
  }
}
