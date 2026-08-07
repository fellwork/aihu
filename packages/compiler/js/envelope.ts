/**
 * envelope.ts — backend dispatch for the single-parse envelope compile.
 *
 * Every compile request (`transform` / `compileToAst` / `compileRouteMeta`)
 * routes memo-first, then through ONE of three backends, in order:
 *
 *   1. **native addon** (packages/compiler/src-native, napi) — in-process,
 *      zero spawn. Selected once per process by `_resolveCompileBackend()`.
 *   2. **envelope CLI spawn** — the legacy `aihu-compile` spawn args PLUS
 *      `--envelope <options-json>`. A binary that knows the flag answers with
 *      one JSON envelope (single parse, every requested artifact); the JSON
 *      carries the `"envelope": 1` discriminant.
 *   3. **legacy per-output spawn** — an OLDER binary ignores `--envelope`
 *      and answers with its normal single artifact (JS / AST JSON / route
 *      JSON), which the discriminant check detects. That output is used
 *      as-is, so stale binaries keep exactly their historical behavior —
 *      feature detection costs zero extra spawns.
 *
 * The native addon must additionally PASS A VERSION HANDSHAKE before it is
 * selected (`_checkNativeAddonVersion`): its release version has to equal the
 * pin in `packages/compiler/package.json`'s optionalDependencies. It is a
 * published artifact and the CLI binary is not, so on any branch that changes
 * Rust the addon is stale by construction and would quietly emit pre-change
 * output. A mismatch warns once and falls back to spawn — except under an
 * explicit `AIHU_COMPILER_NATIVE_ADDON` pin, which throws.
 *
 * Backend selection is CACHED at first use (per module instance):
 * `AIHU_COMPILER_NATIVE=0` forces spawn; an explicit `AIHU_COMPILE_BIN`
 * binary pin forces spawn (working ON the compiler means
 * the pinned binary must actually run — an addon silently shadowing it would
 * reintroduce the exact quiet-wrong-answer failure the pin exists to prevent).
 * The cache means css-engine's mid-build `AIHU_COMPILE_BIN` handshake
 * (which programmatically sets the var AFTER the first transform) cannot
 * de-select an already-active native backend.
 *
 * The memo's "binary stamp" (transform-memo.ts `_binStamp`) generalizes to
 * whichever backend is active: the addon's `.node` file path (stat'd for
 * mtime+size, so a rebuilt addon invalidates entries) when native, the
 * resolved CLI binary path when spawning.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type CompilerNativeState, loadCompilerNative, nativePlatformDescriptor } from './native.ts'
import { resolveCompilerBinary } from './resolve-binary.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** The wire shape of a compile envelope (Rust `Envelope`, camelCase). */
export interface CompileEnvelope {
  envelope: number
  targets: Record<string, { js?: string; manifest?: string }>
  astJson?: string
  routeJson?: string
  diagnostics: unknown[]
}

/** Options forwarded to the Rust envelope API (Rust `EnvelopeOptions`). */
export interface CompileEnvelopeOptions {
  tag?: string
  path?: string
  targets?: string[]
  emits?: Array<'js' | 'ast' | 'route' | 'manifest'>
  strictTemplates?: boolean
  exprParser?: string
}

export type CompileBackend =
  | {
      kind: 'native'
      compileEnvelope: (source: string, optionsJson: string) => string
      stampPath: string
    }
  | { kind: 'spawn' }

let _backend: CompileBackend | null = null

/**
 * The addon version this source tree requires — `packages/compiler/package.json`'s
 * optionalDependencies pin for the current platform's addon package.
 *
 * That pin is bumped in the SAME commit that changes the Rust, so it is the
 * only in-repo statement of "which addon build this JS expects". This module
 * builds to `dist/envelope.js` and lives at `js/envelope.ts` in source — the
 * manifest is one level up either way.
 * @internal
 */
export function _requiredNativeAddonVersion(): string | null {
  const descriptor = nativePlatformDescriptor()
  if (descriptor === null) return null
  try {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
      optionalDependencies?: Record<string, string>
    }
    const pinned = manifest.optionalDependencies?.[descriptor.packageName]
    return typeof pinned === 'string' ? pinned : null
  } catch {
    return null
  }
}

/** The verdict of the addon⇄source version handshake. @internal */
export type NativeVersionVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing-method' | 'version-mismatch'; actual: string; expected: string }

/**
 * The backend version handshake (§19).
 *
 * ## Why this exists
 *
 * `_resolveCompileBackend()` prefers an in-process addon over the workspace CLI
 * binary. The addon is a PUBLISHED artifact; the CLI binary is built from this
 * source tree. So on any branch that changes Rust, the installed addon is stale
 * BY CONSTRUCTION — the pin it would need names a version that does not exist on
 * npm yet, `bun install` cannot fetch it, and the compile silently produces
 * pre-change output. That is a quiet wrong answer, the worst failure mode a
 * compiler has: it has already produced a "could not reproduce" that was nothing
 * but a stale backend.
 *
 * ## What is compared
 *
 * The addon's RELEASE version (its npm package version) against the pin. NOT the
 * string from `compilerVersion()`: that interpolates `CARGO_PKG_VERSION` from
 * `src-native/Cargo.toml`, which has read `0.1.0` since the addon landed and is
 * never bumped per release — every published addon, current or stale, reports
 * `0.1.0`, so it carries no release identity. `compilerVersion()` IS called: its
 * presence is the capability probe (a missing method means an addon old enough
 * to predate the handshake, which is a mismatch by definition), and what it
 * reports goes into the warning as a diagnostic, which is precisely the role its
 * own Rust doc comment assigns it.
 *
 * A locally built addon (`origin: 'dev-build'`, no platform-package manifest
 * beside it) has no release version and is NOT gated: it was compiled from this
 * very tree, which is the property the gate exists to establish.
 * @internal
 */
export function _checkNativeAddonVersion(
  state: Extract<CompilerNativeState, { kind: 'loaded' }>,
): NativeVersionVerdict {
  const expected = _requiredNativeAddonVersion()
  // No pin (unsupported platform / unreadable manifest): nothing to check
  // against. Never block a working addon on a missing expectation.
  if (expected === null) return { ok: true }

  if (typeof state.addon.compilerVersion !== 'function') {
    return { ok: false, reason: 'missing-method', actual: '<no compilerVersion()>', expected }
  }

  let reported: string
  try {
    reported = String(state.addon.compilerVersion())
  } catch (err) {
    return {
      ok: false,
      reason: 'missing-method',
      actual: `<compilerVersion() threw: ${(err as Error).message}>`,
      expected,
    }
  }

  // Built from this source tree — no release version, nothing stale possible.
  if (state.packageVersion === null) return { ok: true }

  if (state.packageVersion !== expected) {
    return {
      ok: false,
      reason: 'version-mismatch',
      actual: `${state.packageVersion} (reports: ${reported})`,
      expected,
    }
  }
  return { ok: true }
}

function nativeMismatchMessage(
  state: Extract<CompilerNativeState, { kind: 'loaded' }>,
  verdict: Extract<NativeVersionVerdict, { ok: false }>,
): string {
  const cause =
    verdict.reason === 'missing-method'
      ? `the addon does not implement compilerVersion(), so it predates this handshake`
      : `the installed addon is not the build this source requires`
  return (
    `[@aihu/compiler] native addon version mismatch — ${cause}.\n` +
    `  Required (packages/compiler/package.json pin): ${verdict.expected}\n` +
    `  Loaded addon:                                  ${verdict.actual}\n` +
    `  Addon path:                                    ${state.addonPath}\n` +
    `  Cause: the addon is a PUBLISHED artifact, so a branch that changes Rust\n` +
    `         is stale by construction — the pinned version is not on npm yet and\n` +
    `         \`bun install\` cannot fix it. Using it would silently compile with\n` +
    `         pre-change codegen.`
  )
}

/**
 * Resolve (once) which backend serves compiles for this process.
 * @internal
 */
export function _resolveCompileBackend(): CompileBackend {
  if (_backend !== null) return _backend
  const env = typeof process !== 'undefined' ? process.env : undefined
  if (env?.AIHU_COMPILER_NATIVE === '0' || env?.AIHU_COMPILE_BIN) {
    _backend = { kind: 'spawn' }
    return _backend
  }
  const native = loadCompilerNative()
  if (native.kind !== 'loaded') {
    _backend = { kind: 'spawn' }
    return _backend
  }

  const verdict = _checkNativeAddonVersion(native)
  if (!verdict.ok) {
    // An EXPLICIT addon pin that mismatches is a configuration error, not a
    // fallback opportunity — same doctrine as native.ts's override load
    // failure and AIHU_COMPILE_BIN: silently ignoring a pin hands back a
    // plausible-looking wrong backend.
    if (native.origin === 'override') {
      throw new Error(
        `${nativeMismatchMessage(native, verdict)}\n` +
          `  AIHU_COMPILER_NATIVE_ADDON pinned this addon explicitly, so this fails\n` +
          `  rather than falling back. Unset it (the CLI spawn path is byte-identical),\n` +
          `  set AIHU_COMPILER_NATIVE=0, or rebuild:\n` +
          `    bun packages/compiler/scripts/build-native.ts`,
      )
    }
    console.warn(
      `${nativeMismatchMessage(native, verdict)}\n` +
        `  Falling back to the aihu-compile spawn path (built from source,\n` +
        `  byte-identical output, slower). Set AIHU_COMPILER_NATIVE=0 to silence\n` +
        `  this, or build the addon from source:\n` +
        `    bun packages/compiler/scripts/build-native.ts`,
    )
    _backend = { kind: 'spawn' }
    return _backend
  }

  _backend = {
    kind: 'native',
    compileEnvelope: native.addon.compileEnvelope.bind(native.addon),
    stampPath: native.addonPath,
  }
  return _backend
}

/** Reset the cached backend (tests). @internal */
export function _resetCompileBackend(): void {
  _backend = null
}

/**
 * The identity string the memo cache stamps entries with — the active
 * backend's file (addon `.node` path, or the resolved CLI binary path).
 * `_binStamp` stats it, so rebuilding EITHER backend invalidates entries.
 * @internal
 */
export function _backendStampPath(): string {
  const backend = _resolveCompileBackend()
  return backend.kind === 'native' ? backend.stampPath : resolveSpawnBinPath()
}

/**
 * CLI binary resolution for the spawn backend — env override first (the
 * css-engine handshake sets AIHU_COMPILE_BIN), then the shared resolver.
 * Call-time, never cached here (Bug 6 doctrine: the env var may be set
 * between calls).
 * @internal
 */
export function resolveSpawnBinPath(): string {
  return process.env.AIHU_COMPILE_BIN ?? resolveCompilerBinary()
}

/** A backend reply: either a parsed envelope, or a legacy single artifact. */
export type EnvelopeReply =
  | { kind: 'envelope'; envelope: CompileEnvelope }
  | { kind: 'legacy'; output: string }

function parseEnvelopeReply(stdout: string): EnvelopeReply {
  // Envelope replies are a single JSON object carrying the `"envelope"`
  // discriminant. EVERY legacy output fails this test: emitted JS is not
  // JSON (starts with a comment or import), an AST export carries
  // `astVersion` but not `envelope`, a route sidecar is a plain object (or
  // the literal `null`) without it.
  const trimmed = stdout.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { envelope?: unknown }
      if (typeof parsed === 'object' && parsed !== null && parsed.envelope === 1) {
        return { kind: 'envelope', envelope: parsed as unknown as CompileEnvelope }
      }
    } catch {
      // Not JSON — legacy output.
    }
  }
  return { kind: 'legacy', output: stdout }
}

/**
 * Run one compile through the active backend.
 *
 * @param source     the `.aihu` source (stdin for the spawn backend)
 * @param legacyArgs the EXACT argv the pre-envelope spawn used for this call
 *                   (`--stdin --tag … [--ast-json|--route-json|…]`). The spawn
 *                   backend appends `--envelope <json>` to it, so an older
 *                   binary that ignores the flag still answers the legacy
 *                   request correctly.
 * @param options    the envelope options (must agree with `legacyArgs`)
 * @internal
 */
export function _compileViaBackend(
  source: string,
  legacyArgs: string[],
  options: CompileEnvelopeOptions,
): EnvelopeReply {
  const backend = _resolveCompileBackend()
  const optionsJson = JSON.stringify(options)
  if (backend.kind === 'native') {
    const envelope = JSON.parse(backend.compileEnvelope(source, optionsJson)) as CompileEnvelope
    return { kind: 'envelope', envelope }
  }
  const stdout = execFileSync(resolveSpawnBinPath(), [...legacyArgs, '--envelope', optionsJson], {
    input: source,
    encoding: 'utf8',
  })
  return parseEnvelopeReply(stdout)
}
