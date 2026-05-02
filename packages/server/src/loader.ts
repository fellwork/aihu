/// <reference lib="dom" />
/**
 * Three-state loader for @scribe/server's native (Rust napi-rs) renderer.
 *
 * States (per spec-server-native.md §3):
 *   - NATIVE_LOADED: addon required successfully; renderToString routes to Rust.
 *   - EDGE_SKIPPED: edge runtime detected OR SCRIBE_NATIVE_SKIP=1 OR platform
 *                   not in the four-platform support matrix; silently uses TS.
 *   - NATIVE_FAILED_LOUD: platform IS supported and addon load failed —
 *                         throws on first renderToString call (lazy throw, so
 *                         module import does not poison consumers who never
 *                         call renderToString).
 *
 * Hard constraint (spec §10): ssr.ts must remain byte-identical. This file
 * only adds a new export path — it does not modify existing behavior.
 *
 * Fall-through to TS implementation (always, regardless of native state):
 *   - opts.serializer is set (JS callback can't cross FFI)
 *   - opts.contextSetup is set (JS callback can't cross FFI)
 *   - component is not a function (`{ toHtml(): string }` provider)
 *   - native state is EDGE_SKIPPED or NATIVE_FAILED_LOUD
 */

import { renderToString as tsRenderToString } from './ssr.ts'
import type { ComponentDescription, SsrOptions } from './ssr.ts'

// ---------------------------------------------------------------------------
// Platform support matrix
// ---------------------------------------------------------------------------
//
// Maps process.platform + process.arch to the platform package name and the
// .node file inside it. Mirrors the package directory names under
// packages/server/npm/<platform>/ and the napi-rs distribution convention.

interface PlatformDescriptor {
  readonly platformId: string
  readonly packageName: string
  readonly nodeFile: string
}

function detectPlatform(): PlatformDescriptor | null {
  if (typeof process === 'undefined' || !process.platform || !process.arch) {
    return null
  }
  const platform = process.platform
  const arch = process.arch
  const key = `${platform}-${arch}`

  switch (key) {
    case 'darwin-arm64':
      return {
        platformId: 'darwin-arm64',
        packageName: '@scribe/server-darwin-arm64',
        nodeFile: 'server-native.darwin-arm64.node',
      }
    case 'darwin-x64':
      return {
        platformId: 'darwin-x64',
        packageName: '@scribe/server-darwin-x64',
        nodeFile: 'server-native.darwin-x64.node',
      }
    case 'linux-x64':
      // We only ship glibc; musl users fall through silently to TS.
      return {
        platformId: 'linux-x64-gnu',
        packageName: '@scribe/server-linux-x64-gnu',
        nodeFile: 'server-native.linux-x64-gnu.node',
      }
    case 'win32-x64':
      return {
        platformId: 'win32-x64-msvc',
        packageName: '@scribe/server-win32-x64-msvc',
        nodeFile: 'server-native.win32-x64-msvc.node',
      }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Edge-runtime detection (§3.2)
// ---------------------------------------------------------------------------

function detectEdge(): boolean {
  // Cloudflare Workers + Vercel Edge both set EdgeRuntime as a global.
  // Workers: 'experimental'. Vercel: 'vercel'. Any truthy value = edge.
  // biome-ignore lint/suspicious/noExplicitAny: feature-detect a global that may not exist
  const er = (globalThis as any).EdgeRuntime
  if (typeof er !== 'undefined' && er) return true

  // Next.js App Router edge routes set NEXT_RUNTIME=edge at startup.
  if (typeof process !== 'undefined' && process.env && process.env.NEXT_RUNTIME === 'edge') {
    return true
  }

  // SCRIBE_NATIVE_SKIP=1 is the user-controlled escape hatch (silent fallthrough).
  if (typeof process !== 'undefined' && process.env && process.env.SCRIBE_NATIVE_SKIP === '1') {
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Native addon loader
// ---------------------------------------------------------------------------

interface NativeAddon {
  renderTree(treeJson: string, hydratable: boolean): string
  renderDocument(treeJson: string, headJson: string, hydratable: boolean): string
}

type LoaderState =
  | { kind: 'native-loaded'; addon: NativeAddon; descriptor: PlatformDescriptor }
  | { kind: 'edge-skipped' }
  | { kind: 'native-failed-loud'; descriptor: PlatformDescriptor; error: Error }
  | { kind: 'unsupported-platform' }

let _state: LoaderState | null = null

function resolveState(): LoaderState {
  if (_state !== null) return _state

  // SCRIBE_FORCE_NATIVE=1 overrides edge detection — used by CI parity gate (§4.4).
  const forceNative =
    typeof process !== 'undefined' &&
    process.env &&
    process.env.SCRIBE_FORCE_NATIVE === '1'

  if (!forceNative && detectEdge()) {
    _state = { kind: 'edge-skipped' }
    return _state
  }

  const descriptor = detectPlatform()
  if (descriptor === null) {
    // Platform not supported (e.g., linux/arm64) — silent TS fallthrough.
    _state = { kind: 'unsupported-platform' }
    return _state
  }

  // Attempt require. We use createRequire so this works in both ESM and CJS
  // contexts. Loading is fully synchronous — no dynamic import().
  let addon: NativeAddon
  try {
    // node:module is only importable in Node-like environments (Node, Bun,
    // Deno-with-node-compat). Edge runtimes are filtered out earlier by
    // detectEdge(); platform support already returned non-null.
    //
    // We deliberately use `require()` here (not `await import()`) because:
    //   1. The module export must be synchronous to keep the renderToString
    //      signature `(c, opts) => Promise<string>` resolve in one microtask.
    //   2. .node addons are CJS-only — `import('foo.node')` is not portable.
    //
    // The `require` call is reachable in ESM via createRequire(import.meta.url).
    // We use the eval trick to keep rolldown from rewriting the call.
    // biome-ignore lint/suspicious/noExplicitAny: dynamic require for native addon
    const dynRequire: (id: string) => any =
      // biome-ignore lint/security/noGlobalEval: scoped to a known module spec
      typeof require === 'function' ? require : (0, eval)('require')
    const mod = dynRequire('node:module') as {
      createRequire: (path: string) => (id: string) => unknown
    }
    // base path for createRequire — process.cwd() is always valid in Node/Bun.
    const base = `${process.cwd()}/index.js`
    const requireFn = mod.createRequire(base)
    addon = requireFn(descriptor.packageName) as NativeAddon
  } catch (err) {
    const error = err as Error & { code?: string }
    _state = { kind: 'native-failed-loud', descriptor, error }
    return _state
  }

  // Sanity-check the loaded module surface.
  if (
    !addon ||
    typeof addon.renderTree !== 'function' ||
    typeof addon.renderDocument !== 'function'
  ) {
    _state = {
      kind: 'native-failed-loud',
      descriptor,
      error: new Error(
        `addon at ${descriptor.packageName} did not export renderTree/renderDocument`,
      ),
    }
    return _state
  }

  _state = { kind: 'native-loaded', addon, descriptor }
  return _state
}

// ---------------------------------------------------------------------------
// Error types — failure-loud contract (§5)
// ---------------------------------------------------------------------------

export class ScribeNativeError extends Error {
  readonly code: 'SCRIBE_NATIVE_MISSING' | 'SCRIBE_NATIVE_LOAD_FAILED'
  constructor(
    message: string,
    code: 'SCRIBE_NATIVE_MISSING' | 'SCRIBE_NATIVE_LOAD_FAILED',
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'ScribeNativeError'
    this.code = code
    if (options?.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

function buildMissingBinaryError(descriptor: PlatformDescriptor): ScribeNativeError {
  const msg =
    `[@scribe/server] Native renderer binary not found for this platform.\n\n` +
    `  Platform:         ${descriptor.platformId}\n` +
    `  Expected package: ${descriptor.packageName}\n` +
    `  Expected file:    ${descriptor.packageName}/${descriptor.nodeFile}\n\n` +
    `  This binary is distributed as an optionalDependency of @scribe/server.\n` +
    `  Your package manager may have skipped it.\n\n` +
    `  To reinstall:\n` +
    `    npm install @scribe/server\n` +
    `    # or: pnpm install   or: bun install\n\n` +
    `  If you built from source or are running a CI environment without npm access,\n` +
    `  set SCRIBE_NATIVE_SKIP=1 to use the TypeScript fallback (slower, always correct).`
  return new ScribeNativeError(msg, 'SCRIBE_NATIVE_MISSING')
}

function buildCorruptBinaryError(
  descriptor: PlatformDescriptor,
  cause: Error,
): ScribeNativeError {
  const msg =
    `[@scribe/server] Native renderer binary failed to load.\n\n` +
    `  Platform:         ${descriptor.platformId}\n` +
    `  Expected package: ${descriptor.packageName}\n` +
    `  Load error:       ${cause.message}\n\n` +
    `  The binary exists but could not be initialized. This usually means:\n` +
    `    - The binary was built for a different Node.js version (ABI mismatch)\n` +
    `    - The file is corrupted (incomplete download or disk error)\n\n` +
    `  To fix:\n` +
    `    npm install @scribe/server   (re-downloads the platform package)\n\n` +
    `  Original error: ${cause.stack ?? cause.message}`
  return new ScribeNativeError(msg, 'SCRIBE_NATIVE_LOAD_FAILED', { cause })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  // Hard fall-throughs to TS — these features cannot cross the FFI boundary.
  // (Spec §1 non-goals: serializer, contextSetup. Spec §2.3: { toHtml } stays JS.)
  if (
    opts?.serializer ||
    opts?.contextSetup ||
    typeof component !== 'function'
  ) {
    return tsRenderToString(component, opts)
  }

  const state = resolveState()

  if (state.kind === 'edge-skipped' || state.kind === 'unsupported-platform') {
    return tsRenderToString(component, opts)
  }

  if (state.kind === 'native-failed-loud') {
    const cause = state.error
    const code = (cause as Error & { code?: string }).code
    const isMissing = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND'

    // SCRIBE_FORCE_NATIVE=1 promotes any load failure to a thrown error
    // (this is the CI parity-gate signal per spec §4.4).
    const forceNative =
      typeof process !== 'undefined' &&
      process.env &&
      process.env.SCRIBE_FORCE_NATIVE === '1'

    // Corrupt-binary errors (anything other than MODULE_NOT_FOUND on a
    // supported platform) are always loud — silently coercing them to the TS
    // fallback would mask real ABI/version mismatches.
    if (!isMissing) {
      throw buildCorruptBinaryError(state.descriptor, cause)
    }

    // Missing binary: loud only under SCRIBE_FORCE_NATIVE=1; otherwise silent
    // TS fallthrough so developer machines and consumers without the
    // optionalDependency installed continue to work transparently.
    if (forceNative) {
      throw buildMissingBinaryError(state.descriptor)
    }
    return tsRenderToString(component, opts)
  }

  // state.kind === 'native-loaded'
  // Materialize the component; if the factory throws we let it propagate.
  let root: unknown
  try {
    root = component()
  } catch (err) {
    throw err
  }

  const treeJson = JSON.stringify(root)
  const hydratable = opts?.hydratable ?? false

  if (opts?.head) {
    const headJson = JSON.stringify(opts.head)
    return state.addon.renderDocument(treeJson, headJson, hydratable)
  }
  return state.addon.renderTree(treeJson, hydratable)
}

// ---------------------------------------------------------------------------
// Test/introspection helpers (NOT part of the public @scribe/server surface;
// imported only by packages/server/tests/native-parity.test.ts).
// ---------------------------------------------------------------------------

/**
 * Returns the resolved loader state kind. Used by the parity test to decide
 * whether to skip (when native is not loaded on this platform).
 */
export function _getLoaderStateKind(): LoaderState['kind'] {
  return resolveState().kind
}

/**
 * Reset the cached loader state. Used by unit tests that mock platform
 * detection (e.g., setting EdgeRuntime). Not part of the public API.
 */
export function _resetLoaderState(): void {
  _state = null
}
