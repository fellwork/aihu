/**
 * @scribe/router/plugin — build-time Vite plugin entry.
 *
 * This module is intentionally separate from the browser runtime (`./index.ts`)
 * so the Node.js / build-time code (node:fs, node:path) is never included in
 * the browser bundle measured by `.size-limit.json`.
 *
 * Usage in vite.config.ts:
 *   import { viteRouterIntegration } from '@scribe/router/plugin'
 *
 * v0.7.4: `viteRouterPlugin` renamed to `viteRouterIntegration`.
 * The old name remains as a deprecated re-export until v1.0.
 */
export type { RouterPluginOptions, RouteSidecar, LayoutMap, MiddlewareScan } from './vite-plugin.ts'
export { viteRouterIntegration, viteRouterPlugin, readRouteSidecar, scanLayouts } from './vite-plugin.ts'
