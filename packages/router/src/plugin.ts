/**
 * @scribe/router/plugin — build-time Vite plugin entry.
 *
 * This module is intentionally separate from the browser runtime (`./index.ts`)
 * so the Node.js / build-time code (node:fs, node:path) is never included in
 * the browser bundle measured by `.size-limit.json`.
 *
 * Usage in vite.config.ts:
 *   import { viteRouterPlugin } from '@scribe/router/plugin'
 */
export type { RouterPluginOptions, RouteSidecar, LayoutMap } from './vite-plugin.ts'
export { viteRouterPlugin, readRouteSidecar, scanLayouts } from './vite-plugin.ts'
