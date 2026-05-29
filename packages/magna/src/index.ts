/**
 * @aihu/magna — public API (browser-safe runtime entry).
 *
 * GraphQL bridge for Magna: dep-free fetch, resource composition over
 * @aihu-plugin/data, and JWT relay via getToken config.
 *
 * The build-time pipeline (`magna` plugin + `beforeCompile`) lives in the
 * node-only `@aihu/magna/codegen` subpath, keeping this entry free of
 * `node:fs` so it stays browser-safe.
 *
 * @example
 * import { createMagnaFetch, createMagnaResource } from '@aihu/magna'
 */

// Runtime helpers
export { createMagnaFetch } from './fetch.js'
export { createMagnaResource } from './resource.js'
export { useMagnaSubscription } from './subscription.js'

// Types
export type {
  MagnaBuildContext,
  MagnaFetch,
  MagnaJwtRelay,
  MagnaPluginOptions,
  MagnaResource,
  MagnaSubscriptionHandle,
} from './types.js'
