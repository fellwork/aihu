/**
 * @aihu/plugin-demo — public entry point.
 *
 * Exports all three surfaces required by the consumer contract:
 *   - `demo`              — build-time plugin factory (via `@aihu/plugin`)
 *   - `createDemoRoutes`  — route-handler factory (per A3 §2.1 router pattern)
 *   - `createDemoRuntime` — reactive runtime export (uses `@aihu/signals`)
 *   - Types: `DemoOptions`, `DemoResource`
 */

export { demo } from './plugin.ts'
export { createDemoRoutes } from './routes.ts'
export { createDemoRuntime } from './runtime.ts'
export type { DemoOptions, DemoResource } from './types.ts'
