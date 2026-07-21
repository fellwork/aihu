/// <reference lib="dom" />
/**
 * @aihu/server/native — the Node-native portability boundary.
 *
 * This is the ONLY module in @aihu/server allowed to reference `node:module`,
 * `createRequire`, or the platform-specific napi `.node` addon. It is built as
 * a SEPARATE entry (dist/native.js) with `platform: 'node'` so the
 * `import { createRequire } from "node:module"` it emits is a real, static ESM
 * external that survives a downstream Rolldown re-bundle (Bug 4 — see
 * investigation 4a796a8f-0f2b-4865-a498-73cf11b6f04c).
 *
 * The main @aihu/server entry (loader.ts → index.ts) imports this module ONLY
 * via a lazy `await import('./native.js')`, resolved server-side on the first
 * native render. As a result the main entry's STATIC import graph contains NO
 * `node:` builtin, so browser / edge (Cloudflare, Vercel) / Deno consumers that
 * bundle @aihu/server never load `node:module` and never hit the client-leak
 * `TypeError` regression that broke @aihu/app@0.1.8.
 *
 * Contract (spec-server-native.md §3, Director session-002):
 *   - native-loaded:        addon required successfully; render routes to Rust.
 *   - edge-skipped:         edge runtime OR SCRIBE_NATIVE_SKIP=1 OR unsupported
 *                           platform; caller silently uses the TS fallback.
 *   - native-failed-loud:   platform IS supported and the addon load failed —
 *                           resolveNativeState() records the error and
 *                           throwIfNativeFailed() surfaces it loudly (spec
 *                           §3.1). With the lazy boundary this throw now
 *                           surfaces on the first native render call (or on a
 *                           direct `import '@aihu/server/native'`) rather than
 *                           at bare `@aihu/server` import time — which is the
 *                           intended portability behaviour: importing the
 *                           framework for json/notFound/router never triggers
 *                           the native load.
 */

import { createRequire } from 'node:module'
import type { ComponentDescription, SsrOptions } from './ssr.ts'
import { renderToString as tsRenderToString } from './ssr.ts'

// ---------------------------------------------------------------------------
// Platform support matrix
// ---------------------------------------------------------------------------
//
// Maps process.platform + process.arch to the platform package name and the
// .node file inside it. Mirrors the package directory names under
// packages/server/npm/<platform>/ and the napi-rs distribution convention.

export interface PlatformDescriptor {
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
        packageName: '@aihu/server-darwin-arm64',
        nodeFile: 'server-native.darwin-arm64.node',
      }
    case 'darwin-x64':
      return {
        platformId: 'darwin-x64',
        packageName: '@aihu/server-darwin-x64',
        nodeFile: 'server-native.darwin-x64.node',
      }
    case 'linux-x64':
      // We only ship glibc; musl users fall through silently to TS.
      return {
        platformId: 'linux-x64-gnu',
        packageName: '@aihu/server-linux-x64-gnu',
        nodeFile: 'server-native.linux-x64-gnu.node',
      }
    case 'win32-x64':
      return {
        platformId: 'win32-x64-msvc',
        packageName: '@aihu/server-win32-x64-msvc',
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

export interface NativeAddon {
  renderTree(treeJson: string, hydratable: boolean): string
  renderDocument(treeJson: string, headJson: string, hydratable: boolean): string
}

export type NativeState =
  | { kind: 'native-loaded'; addon: NativeAddon; descriptor: PlatformDescriptor }
  | { kind: 'edge-skipped' }
  | { kind: 'native-failed-loud'; descriptor: PlatformDescriptor; error: Error }
  | { kind: 'unsupported-platform' }

let _state: NativeState | null = null

/**
 * Resolve (and cache) the native loader state. This is where `node:module` /
 * `createRequire` / the napi `.node` require lives — the single Node-native
 * site in the whole package.
 */
export function resolveNativeState(): NativeState {
  if (_state !== null) return _state

  // SCRIBE_NATIVE_SKIP=1 is the documented escape hatch (spec §5.3) — short-
  // circuit at the very top so we never attempt platform detection or require.
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
    // We deliberately use createRequire here (not `await import()`) because:
    //   1. The module export must be synchronous to keep the renderToString
    //      signature `(c, opts) => Promise<string>` resolve in one microtask.
    //   2. .node addons are CJS-only — `import('foo.node')` is not portable.
    //
    // This module is built as a SEPARATE entry with platform:'node', so
    // Rolldown emits a real `import { createRequire } from "node:module"` here
    // that survives a downstream re-bundle (Bug 4 fix preserved). The static
    // node:module import lives ONLY in dist/native.js — never in dist/index.js.
    const requireFn = createRequire(`${process.cwd()}/index.js`)
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

export class AihuNativeError extends Error {
  readonly code: 'SCRIBE_NATIVE_MISSING' | 'SCRIBE_NATIVE_LOAD_FAILED'
  constructor(
    message: string,
    code: 'SCRIBE_NATIVE_MISSING' | 'SCRIBE_NATIVE_LOAD_FAILED',
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'AihuNativeError'
    this.code = code
    if (options?.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

function buildMissingBinaryError(descriptor: PlatformDescriptor): AihuNativeError {
  const msg =
    `[@aihu/server] Native renderer binary not found for this platform.\n\n` +
    `  Platform:         ${descriptor.platformId}\n` +
    `  Expected package: ${descriptor.packageName}\n` +
    `  Expected file:    ${descriptor.packageName}/${descriptor.nodeFile}\n\n` +
    `  This binary is distributed as an optionalDependency of @aihu/server.\n` +
    `  Your package manager may have skipped it.\n\n` +
    `  To reinstall:\n` +
    `    npm install @aihu/server\n` +
    `    # or: pnpm install   or: bun install\n\n` +
    `  If you built from source or are running a CI environment without npm access,\n` +
    `  set SCRIBE_NATIVE_SKIP=1 to use the TypeScript fallback (slower, always correct).`
  return new AihuNativeError(msg, 'SCRIBE_NATIVE_MISSING')
}

function buildCorruptBinaryError(descriptor: PlatformDescriptor, cause: Error): AihuNativeError {
  const msg =
    `[@aihu/server] Native renderer binary failed to load.\n\n` +
    `  Platform:         ${descriptor.platformId}\n` +
    `  Expected package: ${descriptor.packageName}\n` +
    `  Load error:       ${cause.message}\n\n` +
    `  The binary exists but could not be initialized. This usually means:\n` +
    `    - The binary was built for a different Node.js version (ABI mismatch)\n` +
    `    - The file is corrupted (incomplete download or disk error)\n\n` +
    `  To fix:\n` +
    `    npm install @aihu/server   (re-downloads the platform package)\n\n` +
    `  Original error: ${cause.stack ?? cause.message}`
  return new AihuNativeError(msg, 'SCRIBE_NATIVE_LOAD_FAILED', { cause })
}

/**
 * Convert a `native-failed-loud` state into the formatted AihuNativeError and
 * throw it. Used by both the loader's render path and a direct
 * `import '@aihu/server/native'` eager check. No-op for any other state.
 */
export function throwIfNativeFailed(state: NativeState): void {
  if (state.kind !== 'native-failed-loud') return
  const cause = state.error
  const code = (cause as Error & { code?: string }).code
  const isMissing = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND'
  if (isMissing) {
    throw buildMissingBinaryError(state.descriptor)
  }
  throw buildCorruptBinaryError(state.descriptor, cause)
}

// ---------------------------------------------------------------------------
// Native render entry — invoked lazily by loader.ts on the server-side native
// path. Mirrors the renderToString fall-through contract so the loader only
// has to decide "native or TS" once.
// ---------------------------------------------------------------------------

/**
 * Dialect guard (#465): the Rust renderer implements the LEGACY tree dialect
 * — text leaves that carry `text`, tagged branches, plain-value attrs. The
 * live arbor dialect has moved past it: text leaves carry `value` (possibly a
 * `[read, write]` Signal tuple — functions vanish under JSON.stringify),
 * element leaves exist (`leafKind: 'element'`), `branch(''|null)` is a
 * fragment, `when()`/`each()` emit `kind: 'structural'` nodes whose branches
 * are closures, and reactive attrs are tuples. Handing any of those to the
 * addon silently DROPS or mangles content (the render.rs walker returns ''
 * for unknown shapes). Until the native renderer is brought up to the current
 * dialect, trees containing modern constructs take the TS path — "slower,
 * always correct" — and the native fast path serves only what it can render
 * byte-correctly. Returns true when the addon can render `node` faithfully.
 */
function _nativeDialectSupports(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return true
  const obj = node as Record<string, unknown>
  if (obj.kind === 'structural') return false
  if (obj.kind === 'leaf') {
    // render.rs reads `obj.text` only; the live dialect's `value`/`leafKind`
    // fields mean content the addon would drop (or an element leaf it has no
    // case for).
    return !('value' in obj) && !('leafKind' in obj)
  }
  if (obj.kind === 'branch') {
    if (obj.tag === null || obj.tag === '') return false // fragment
    const attrs = obj.attrs
    if (typeof attrs === 'object' && attrs !== null) {
      for (const v of Object.values(attrs as Record<string, unknown>)) {
        if (typeof v === 'function' || Array.isArray(v)) return false // reactive/tuple attr
      }
    }
    const children = obj.children
    if (Array.isArray(children)) {
      for (const c of children) if (!_nativeDialectSupports(c)) return false
    }
  }
  return true
}

/**
 * Render via the native (Rust) renderer when available, falling back to the TS
 * implementation for edge / unsupported platforms. Throws AihuNativeError when
 * the platform is supported but the addon failed to load (failure-loud, §5).
 *
 * The caller (loader.ts) has already filtered the JS-only fall-throughs
 * (serializer / contextSetup / non-function component) before reaching here.
 */
export async function renderToStringNative(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  const state = resolveNativeState()

  if (state.kind === 'edge-skipped' || state.kind === 'unsupported-platform') {
    return tsRenderToString(component, opts)
  }

  if (state.kind === 'native-failed-loud') {
    throwIfNativeFailed(state)
  }

  // state.kind === 'native-loaded'
  const addon = (state as Extract<NativeState, { kind: 'native-loaded' }>).addon

  // Materialize the component; if the factory throws we let it propagate.
  const root = (component as () => unknown)()

  // Dialect guard: modern-dialect trees (structural nodes, `value` leaves,
  // fragments, reactive attrs) take the always-correct TS walker. The factory
  // has already run; re-wrap its result so the tree is not built twice.
  if (!_nativeDialectSupports(root)) {
    return tsRenderToString(() => root, opts)
  }

  const treeJson = JSON.stringify(root)
  const hydratable = opts?.hydratable ?? false

  if (opts?.head) {
    const headJson = JSON.stringify(opts.head)
    return addon.renderDocument(treeJson, headJson, hydratable)
  }
  return addon.renderTree(treeJson, hydratable)
}

// ---------------------------------------------------------------------------
// Test/introspection helpers (NOT part of the public @aihu/server surface).
// ---------------------------------------------------------------------------

/** Returns the resolved native loader state kind. */
export function _getNativeStateKind(): NativeState['kind'] {
  return resolveNativeState().kind
}

/** Reset the cached native state. Used by unit tests that mock detection. */
export function _resetNativeState(): void {
  _state = null
}

// ---------------------------------------------------------------------------
// Eager resolution for the direct `import '@aihu/server/native'` entry.
// Preserves the spec §3.1 / AC-9 "loud at import time" contract for consumers
// who explicitly opt into the native path. The main @aihu/server entry does
// NOT import this module statically, so a bare `import '@aihu/server'` never
// reaches this block.
// ---------------------------------------------------------------------------
{
  const initial = resolveNativeState()
  throwIfNativeFailed(initial)
}
