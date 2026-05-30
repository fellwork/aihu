import { defineAihuConfig } from '@aihu/server'

/**
 * Consumer-app config (plugin-demo-consumer-contract.md Pattern 4).
 *
 * This slice (G3a) is imperative-only: the auth gate, magna read, and SEO
 * routes are wired directly in `src/routes.ts` via the imperative factories
 * (getAuthState / createMagnaFetch / createMagnaResource / createSeoRoutes),
 * NOT through the plugins array. The plugins array is therefore empty.
 *
 * TODO(G3b): register auth()/magna()/seo() plugins + $auth/$query macros in Round 3.
 */
export default defineAihuConfig({ plugins: [] })
