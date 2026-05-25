/// <reference lib="dom" />
/**
 * Public render entry for @aihu/server — the runtime-agnostic boundary.
 *
 * This module is reachable from the main barrel (index.ts) and therefore from
 * EVERY consumer of @aihu/server, including browser / edge (Cloudflare, Vercel)
 * / Deno bundles. It MUST NOT statically import any `node:` builtin. All
 * Node-native code (the napi `.node` addon, `node:module` / `createRequire`)
 * lives behind the `@aihu/server/native` boundary (src/native.ts) and is
 * loaded LAZILY here via `await import('./native.js')`, resolved only when the
 * native render path actually runs server-side.
 *
 * This split fixes the @aihu/app@0.1.8 client-leak regression: the Bug 4 fix
 * (`platform: 'node'` on the server build) made Rolldown hoist a static
 * `import { createRequire } from "node:module"` into dist/index.js. A static
 * node:module import does not tree-shake, so consumers bundling @aihu/server
 * for the browser hit a `TypeError` on bootstrap. By moving the native loader
 * to its own platform:'node' entry and importing it lazily, the main
 * dist/index.js builds node:module-free while the /native entry still survives
 * a downstream Rolldown re-bundle (Bug 4 stays fixed). See investigation
 * 4a796a8f-0f2b-4865-a498-73cf11b6f04c.
 *
 * Fall-through to the pure-TS implementation (always, regardless of native
 * availability) — these never reach the lazy native import:
 *   - opts.serializer is set (JS callback can't cross FFI)
 *   - opts.contextSetup is set (JS callback can't cross FFI)
 *   - component is not a function (`{ toHtml(): string }` provider)
 */

import type { ComponentDescription, SsrOptions } from './ssr.ts'
import { renderToString as tsRenderToString } from './ssr.ts'

/**
 * Render a component to an HTML string.
 *
 * Routes to the native (Rust) renderer when running on a supported Node-like
 * platform with the napi addon installed, falling back to the pure-TS SSR
 * implementation otherwise (edge runtimes, unsupported platforms, or the
 * JS-only feature paths below).
 *
 * The native loader is imported lazily so that a bare `import '@aihu/server'`
 * — e.g. for `json` / `notFound` / router types from a browser, edge, or Deno
 * bundle — never pulls `node:module` into the static import graph.
 */
export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  // Hard fall-throughs to TS — these features cannot cross the FFI boundary.
  // (Spec §1 non-goals: serializer, contextSetup. Spec §2.3: { toHtml } stays
  // JS.) Resolving them here keeps the lazy native import off the hot path for
  // the JS-only cases.
  if (opts?.serializer || opts?.contextSetup || typeof component !== 'function') {
    return tsRenderToString(component, opts)
  }

  // Lazy boundary: pull in the Node-native loader only when a server-side
  // native render is actually requested. This dynamic import is what keeps the
  // main dist/index.js node:module-free for browser / edge / Deno consumers.
  // The '.ts' specifier resolves to src/native.ts under Bundler module
  // resolution at dev/test time; the rolldown build rewrites it to the sibling
  // dist/native.js (the separate platform:'node' entry) — see rolldown.config.ts.
  const native = await import('./native.ts')
  return native.renderToStringNative(component, opts)
}

// ---------------------------------------------------------------------------
// Test/introspection helpers (NOT part of the public @aihu/server surface;
// imported only by packages/server/tests/native-parity.test.ts). These proxy
// to the native boundary so the test surface is preserved. They are async
// because the native module is loaded lazily (keeping node:module out of the
// main static graph is the whole point of the split).
// ---------------------------------------------------------------------------

/**
 * Returns the resolved native loader state kind. Used by the parity test to
 * decide whether to skip (when native is not loaded on this platform).
 */
export async function _getLoaderStateKind(): Promise<
  'native-loaded' | 'edge-skipped' | 'native-failed-loud' | 'unsupported-platform'
> {
  const native = await import('./native.ts')
  return native._getNativeStateKind()
}

/**
 * Reset the cached loader state. Used by unit tests that mock platform
 * detection (e.g., setting EdgeRuntime). Not part of the public API.
 */
export async function _resetLoaderState(): Promise<void> {
  const native = await import('./native.ts')
  native._resetNativeState()
}
