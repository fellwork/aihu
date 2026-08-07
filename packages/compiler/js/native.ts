/**
 * @aihu/compiler native-addon loader — the in-process compile fast path.
 *
 * A `native.ts`-style loader in the mold of packages/server/src/native.ts:
 * platform matrix → per-platform optionalDependency package → dev fallback,
 * with explicit escape hatches and a cached three-state result. The addon
 * (packages/compiler/src-native, napi-rs) exposes
 * `compileEnvelope(source, optionsJson) → envelopeJson` — one boundary
 * crossing per file — which `js/envelope.ts` routes `transform()` /
 * `compileToAst()` / `compileRouteMeta()` through.
 *
 * States:
 *   - loaded:      addon required successfully; compiles run in-process.
 *   - disabled:    `AIHU_COMPILER_NATIVE=0` — the documented escape hatch.
 *   - unavailable: no addon for this platform / load failed. UNLIKE
 *                  @aihu/server's fail-loud contract, a failed load here is a
 *                  one-shot WARNING, not a throw: the CLI spawn path is a
 *                  byte-identical fallback that always exists, so failing the
 *                  whole build over a fast-path load would be strictly worse.
 *                  The exception is `AIHU_COMPILER_NATIVE_ADDON=<path>` — an
 *                  explicit override that fails loud (same doctrine as
 *                  AIHU_COMPILE_BIN: a pinned path that doesn't load is a
 *                  configuration error, and silently ignoring it hands back a
 *                  plausible-looking wrong backend).
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface CompilerNativeAddon {
  compileEnvelope(source: string, optionsJson: string): string
  /**
   * The version string baked into the addon at build time. Present since
   * @aihu/compiler-native 0.1.x; ABSENT on older addons, which is why every
   * consumer must treat a missing method as "unknown/incompatible" rather
   * than assuming it is there (see envelope.ts's version handshake).
   */
  compilerVersion?(): string
}

export interface NativePlatformDescriptor {
  readonly platformId: string
  readonly packageName: string
  readonly nodeFile: string
}

function detectPlatform(): NativePlatformDescriptor | null {
  if (typeof process === 'undefined' || !process.platform || !process.arch) {
    return null
  }
  const key = `${process.platform}-${process.arch}`
  switch (key) {
    case 'darwin-arm64':
      return {
        platformId: 'darwin-arm64',
        packageName: '@aihu/compiler-native-darwin-arm64',
        nodeFile: 'aihu-compiler-native.darwin-arm64.node',
      }
    case 'darwin-x64':
      return {
        platformId: 'darwin-x64',
        packageName: '@aihu/compiler-native-darwin-x64',
        nodeFile: 'aihu-compiler-native.darwin-x64.node',
      }
    case 'linux-x64':
      return {
        platformId: 'linux-x64-gnu',
        packageName: '@aihu/compiler-native-linux-x64-gnu',
        nodeFile: 'aihu-compiler-native.linux-x64-gnu.node',
      }
    case 'linux-arm64':
      return {
        platformId: 'linux-arm64-gnu',
        packageName: '@aihu/compiler-native-linux-arm64-gnu',
        nodeFile: 'aihu-compiler-native.linux-arm64-gnu.node',
      }
    case 'win32-x64':
      return {
        platformId: 'win32-x64-msvc',
        packageName: '@aihu/compiler-native-win32-x64-msvc',
        nodeFile: 'aihu-compiler-native.win32-x64-msvc.node',
      }
    default:
      return null
  }
}

/**
 * Where a loaded addon came from. This decides whether the version handshake
 * in envelope.ts can say anything meaningful about it:
 *
 *   - `package`   — a published per-platform optionalDependency. Its release
 *                   version is knowable (`packageVersion`) and is exactly the
 *                   thing `packages/compiler/package.json` pins, so it CAN be
 *                   compared against the pin.
 *   - `dev-build` — `src-native/aihu-compiler-native.node`, produced by
 *                   `scripts/build-native.ts` from THIS source tree. It has no
 *                   release version at all; it is trusted by construction.
 *   - `override`  — `AIHU_COMPILER_NATIVE_ADDON=<path>`. Gated like `package`
 *                   when the pinned file turns out to live inside a published
 *                   platform package, trusted like `dev-build` otherwise.
 */
export type CompilerNativeOrigin = 'package' | 'dev-build' | 'override'

export type CompilerNativeState =
  | {
      kind: 'loaded'
      addon: CompilerNativeAddon
      addonPath: string
      origin: CompilerNativeOrigin
      /**
       * The `version` of the published per-platform package the addon was
       * loaded from, or `null` when the addon did not come from one (a local
       * cargo build). NOT the crate version reported by `compilerVersion()`:
       * `src-native/Cargo.toml` is pinned at 0.1.0 and never bumped per
       * release, so `CARGO_PKG_VERSION` cannot identify a release. The npm
       * package version can, and it is what the pin in
       * `packages/compiler/package.json` is expressed in.
       */
      packageVersion: string | null
    }
  | { kind: 'disabled' }
  | { kind: 'unavailable'; error?: Error }

let _state: CompilerNativeState | null = null
let _warnedLoadFailure = false

/**
 * Read the `version` of the published platform package that owns `addonPath`.
 *
 * Deliberately NOT a walk up to the nearest package.json: the dev candidate
 * lives at `packages/compiler/src-native/…`, whose nearest ancestor manifest is
 * `@aihu/compiler` itself (version 1.2.2) — reading that would report a
 * confidently wrong "addon version". Only a manifest sitting in the SAME
 * directory as the `.node`, and naming an `@aihu/compiler-native-*` package,
 * counts.
 */
function readAddonPackageVersion(addonPath: string): string | null {
  try {
    const manifestPath = join(dirname(addonPath), 'package.json')
    if (!existsSync(manifestPath)) return null
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: unknown
      version?: unknown
    }
    if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@aihu/compiler-native-')) {
      return null
    }
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

/**
 * The per-platform addon package for the current platform, or `null` on a
 * platform with no prebuilt addon. Exported so envelope.ts can look the pinned
 * version up in `packages/compiler/package.json`'s optionalDependencies.
 */
export function nativePlatformDescriptor(): NativePlatformDescriptor | null {
  return detectPlatform()
}

function isAddonShaped(mod: unknown): mod is CompilerNativeAddon {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    typeof (mod as CompilerNativeAddon).compileEnvelope === 'function'
  )
}

/**
 * Resolve (and cache) the native compiler addon. This is the ONLY module in
 * @aihu/compiler that requires a napi `.node` file.
 */
export function loadCompilerNative(): CompilerNativeState {
  if (_state !== null) return _state

  // Escape hatch — checked before everything else.
  if (typeof process !== 'undefined' && process.env?.AIHU_COMPILER_NATIVE === '0') {
    _state = { kind: 'disabled' }
    return _state
  }

  const requireFn = createRequire(import.meta.url)

  // Explicit addon path override — fails LOUD (a pinned path that does not
  // load is a configuration error, never a silent fallthrough).
  const override = process.env?.AIHU_COMPILER_NATIVE_ADDON
  if (override) {
    let addon: unknown
    try {
      addon = requireFn(override)
    } catch (err) {
      throw new Error(
        `[@aihu/compiler] AIHU_COMPILER_NATIVE_ADDON is set to '${override}', ` +
          `which failed to load: ${(err as Error).message}`,
      )
    }
    if (!isAddonShaped(addon)) {
      throw new Error(
        `[@aihu/compiler] AIHU_COMPILER_NATIVE_ADDON module at '${override}' ` +
          `does not export compileEnvelope()`,
      )
    }
    _state = {
      kind: 'loaded',
      addon,
      addonPath: override,
      origin: 'override',
      packageVersion: readAddonPackageVersion(override),
    }
    return _state
  }

  const descriptor = detectPlatform()
  if (descriptor === null) {
    _state = { kind: 'unavailable' }
    return _state
  }

  // 1. Per-platform optionalDependency package (the published-consumer path).
  let resolvedPath: string | null = null
  try {
    resolvedPath = requireFn.resolve(descriptor.packageName)
  } catch {
    // Package not installed — fall through to the dev candidates.
  }

  // 2. Dev fallbacks: the standalone src-native build. `aihu-compiler-native.node`
  //    is staged by `bun packages/compiler/scripts/build-native.ts` (which runs
  //    cargo and copies the platform cdylib); the target/release candidate
  //    covers a manual copy. This module lives at js/ (source) or dist/
  //    (bundled) — both one level below the package root.
  const devCandidates = [
    resolve(__dirname, '../src-native/aihu-compiler-native.node'),
    resolve(__dirname, '../src-native/target/release/aihu-compiler-native.node'),
  ]
  const candidates = resolvedPath ? [resolvedPath] : devCandidates.filter((c) => existsSync(c))
  const origin: CompilerNativeOrigin = resolvedPath ? 'package' : 'dev-build'

  for (const candidate of candidates) {
    try {
      const addon = requireFn(candidate)
      if (isAddonShaped(addon)) {
        _state = {
          kind: 'loaded',
          addon,
          addonPath: candidate,
          origin,
          packageVersion: readAddonPackageVersion(candidate),
        }
        return _state
      }
      throw new Error(`module at ${candidate} does not export compileEnvelope()`)
    } catch (err) {
      // Present-but-broken (ABI mismatch, corrupt download, placeholder file):
      // warn ONCE, loudly, then fall back to the spawn path — which is
      // byte-identical, just slower. `AIHU_COMPILER_NATIVE=0` silences this.
      if (!_warnedLoadFailure) {
        _warnedLoadFailure = true
        console.warn(
          `[@aihu/compiler] native addon found but failed to load; falling back to ` +
            `the aihu-compile spawn path (identical output, slower).\n` +
            `  Candidate: ${candidate}\n` +
            `  Error:     ${(err as Error).message}\n` +
            `  Reinstall @aihu/compiler (or rebuild: cargo build --release ` +
            `--manifest-path packages/compiler/src-native/Cargo.toml), or set ` +
            `AIHU_COMPILER_NATIVE=0 to silence this warning.`,
        )
      }
      _state = { kind: 'unavailable', error: err as Error }
      return _state
    }
  }

  _state = { kind: 'unavailable' }
  return _state
}

/** Returns the cached state kind (resolving if needed). @internal */
export function _getCompilerNativeStateKind(): CompilerNativeState['kind'] {
  return loadCompilerNative().kind
}

/** Reset the cached state. Used by tests that mock detection/env. @internal */
export function _resetCompilerNative(): void {
  _state = null
  _warnedLoadFailure = false
}

/**
 * Force the cached loader state — the injection seam for tests that need a
 * specific addon (right version / wrong version / no `compilerVersion` at all)
 * without a Rust build. `loadCompilerNative()` returns this verbatim until
 * `_resetCompilerNative()` clears it.
 * @internal
 */
export function _setCompilerNativeForTest(state: CompilerNativeState | null): void {
  _state = state
  _warnedLoadFailure = false
}
