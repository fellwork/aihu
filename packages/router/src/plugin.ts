/**
 * @aihu/router/plugin — build-time Vite plugin entry.
 *
 * This module is intentionally separate from the browser runtime (`./index.ts`)
 * so the Node.js / build-time code (node:fs, node:path) is never included in
 * the browser bundle measured by `.size-limit.json`.
 *
 * Usage in vite.config.ts:
 *   import { viteRouterIntegration } from '@aihu/router/plugin'
 *
 * v0.7.4: `viteRouterPlugin` renamed to `viteRouterIntegration`.
 * The old name remains as a deprecated re-export until v1.0.
 */
export type { LayoutMap, MiddlewareScan, RouterPluginOptions, RouteSidecar } from './vite-plugin.ts'
export {
  layoutTagFor,
  readRouteSidecar,
  scanLayouts,
  scanPages,
  viteRouterIntegration,
  viteRouterPlugin,
} from './vite-plugin.ts'
