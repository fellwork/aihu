/// <reference lib="dom" />
/**
 * Three-state loader for @scribe/server's native (Rust napi-rs) renderer.
 *
 * States (per spec-server-native.md §3, as adjudicated in
 * .team/v1/director-notes/server-native-session-002.md):
 *   - NATIVE_LOADED: addon required successfully; renderToString routes to Rust.
 *   - EDGE_SKIPPED: edge runtime detected OR SCRIBE_NATIVE_SKIP=1 OR platform
 *                   is NOT in the four-platform support matrix; silently uses TS.
 *   - NATIVE_FAILED_LOUD: platform IS supported and addon load failed —
 *                         throws at module load time (eager throw per spec
 *                         §3.1: "module never finishes loading; callers get
 *                         the thrown error"). The thrown error is a
 *                         `ScribeNativeError` with reinstall instructions.
 *
 * Default contract (spec §5.1, §5.2): on a supported platform, a missing or
 * corrupt binary is loud. The documented escape hatch is `SCRIBE_NATIVE_SKIP=1`
 * (spec §5.3): set it to silently fall through to the TS implementation
 * (slower, always correct). `SCRIBE_NATIVE_SKIP` is the only env-var lever
 * in this loader's contract.
 *
 * Hard constraint (spec §10): ssr.ts must remain byte-identical. This file
 * only adds a new export path — it does not modify existing behavior.
 *
 * Fall-through to TS implementation (always, regardless of native state):
 *   - opts.serializer is set (JS callback can't cross FFI)
 *   - opts.contextSetup is set (JS callback can't cross FFI)
 *   - component is not a function (`{ toHtml(): string }` provider)
 *   - native state is EDGE_SKIPPED
 *   (NATIVE_FAILED_LOUD never reaches renderToString — module load throws.)
 */

import type { ComponentDescription, SsrOptions } from './ssr.ts'
import { renderToString as tsRenderToString } from './ssr.ts'

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

  // SCRIBE_NATIVE_SKIP=1 is the documented escape hatch (spec §5.3) — short-
  // circuit at the very top so we never attempt platform detection or require.
  // This is the only env-var lever in the loader contract. detectEdge() also
  // honours SCRIBE_NATIVE_SKIP, but checking it explicitly here makes the
  // intent obvious and keeps the early return cheap.
  if (typeof process !== 'undefined' && process.env && process.env.SCRIBE_NATIVE_SKIP === '1') {
    _state = { kind: 'edge-skipped' }
    return _state
  }

  if (detectEdge()) {
    _state = { kind: 'edge-skipped' }
    return _state
  }

  const descriptor = detectPlatform()
  if (descriptor === null) {
    // Platform not supported (e.g., linux/arm64, linux/musl) — silent TS
    // fallthrough. This is distinct from "supported platform with missing
    // binary" (which throws below) per spec §3.1 and Director session-002.
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

function buildCorruptBinaryError(descriptor: PlatformDescriptor, cause: Error): ScribeNativeError {
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
// Eager module-load resolution (spec §3.1)
// ---------------------------------------------------------------------------
//
// Per Director session-002, AC-9 requires that on a supported platform a
// missing or corrupt binary throws at module load time — "module never
// finishes loading; callers get the thrown error." Resolving state here
// (rather than lazily on the first renderToString call) makes the failure
// surface as an import error, which is what production consumers expect.
//
// The escape hatches that reach this block silently:
//   - SCRIBE_NATIVE_SKIP=1 (documented opt-out; spec §5.3)
//   - edge runtime detected (spec §3.2)
//   - platform not in support matrix (e.g., linux/musl, linux/arm64)
//
// On a supported platform with a load failure, the descriptor + error are
// formatted into a `ScribeNativeError` and thrown synchronously below.
{
  const _initial = resolveState()
  if (_initial.kind === 'native-failed-loud') {
    const cause = _initial.error
    const code = (cause as Error & { code?: string }).code
    const isMissing = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND'
    if (isMissing) {
      throw buildMissingBinaryError(_initial.descriptor)
    }
    throw buildCorruptBinaryError(_initial.descriptor, cause)
  }
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
  if (opts?.serializer || opts?.contextSetup || typeof component !== 'function') {
    return tsRenderToString(component, opts)
  }

  const state = resolveState()

  // Either silent fall-through path: SCRIBE_NATIVE_SKIP=1, edge runtime, or
  // platform not in the support matrix. NATIVE_FAILED_LOUD is unreachable
  // here because the module-load throw above prevents this file from
  // finishing initialization in that case.
  if (state.kind === 'edge-skipped' || state.kind === 'unsupported-platform') {
    return tsRenderToString(component, opts)
  }

  if (state.kind === 'native-failed-loud') {
    // Defensive: a test harness may have called _resetLoaderState() and
    // mutated env after the module-load throw was bypassed. Re-throw with
    // the same formatting as the eager path so behaviour is consistent.
    const cause = state.error
    const code = (cause as Error & { code?: string }).code
    const isMissing = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND'
    if (isMissing) {
      throw buildMissingBinaryError(state.descriptor)
    }
    throw buildCorruptBinaryError(state.descriptor, cause)
  }

  // state.kind === 'native-loaded'
  // Materialize the component; if the factory throws we let it propagate.
  const root = component()

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
