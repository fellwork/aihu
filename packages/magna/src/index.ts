/**
 * @aihu/magna — public API.
 *
 * GraphQL bridge for Magna: dep-free fetch, resource composition over
 * @aihu-plugin/data, JWT relay via getToken config, and a beforeCompile
 * SDL pipeline with graceful skip when @aihu/magna-gqlmin is absent.
 *
 * @example
 * import { magna, createMagnaFetch, createMagnaResource } from '@aihu/magna'
 */

// Build-time pipeline (advanced consumers)
export { beforeCompile } from './codegen.js'

// Runtime helpers
export { createMagnaFetch } from './fetch.js'
// Plugin factory
export { magna } from './plugin.js'
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
