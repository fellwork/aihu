/**
 * @aihu/magna/codegen — node-only build-time entry.
 *
 * This barrel collects everything that touches `node:fs` (the SDL pipeline and
 * the plugin factory that wires it into the aihu `beforeCompile` hook) so the
 * default `@aihu/magna` entry stays browser-safe.
 *
 * This module is build-time ONLY. It MUST NOT be imported in browser bundles.
 *
 * @example
 * // aihu.config.ts
 * import { magna } from '@aihu/magna/codegen'
 */

// Build-time SDL pipeline (advanced consumers)
export { beforeCompile } from './codegen.js'
// Plugin factory (wires beforeCompile into the aihu build hook)
export { magna } from './plugin.js'

// Build-time warning + flag helpers
export { setBuildFlag, writeWarnOnce } from './warnings.js'
