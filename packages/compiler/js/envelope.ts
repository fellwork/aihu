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
 * Backend selection is CACHED at first use (per module instance):
 * `AIHU_COMPILER_NATIVE=0` forces spawn; an explicit `AIHU_COMPILE_BIN` /
 * `SCRIBE_COMPILE_BIN` binary pin forces spawn (working ON the compiler means
 * the pinned binary must actually run — an addon silently shadowing it would
 * reintroduce the exact quiet-wrong-answer failure the pin exists to prevent).
 * The cache means css-engine's mid-build `SCRIBE_COMPILE_BIN` handshake
 * (which programmatically sets the var AFTER the first transform) cannot
 * de-select an already-active native backend.
 *
 * The memo's "binary stamp" (transform-memo.ts `_binStamp`) generalizes to
 * whichever backend is active: the addon's `.node` file path (stat'd for
 * mtime+size, so a rebuilt addon invalidates entries) when native, the
 * resolved CLI binary path when spawning.
 */

import { execFileSync } from 'node:child_process'
import { loadCompilerNative } from './native.ts'
import { resolveCompilerBinary } from './resolve-binary.ts'

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
 * Resolve (once) which backend serves compiles for this process.
 * @internal
 */
export function _resolveCompileBackend(): CompileBackend {
  if (_backend !== null) return _backend
  const env = typeof process !== 'undefined' ? process.env : undefined
  if (env?.AIHU_COMPILER_NATIVE === '0' || env?.AIHU_COMPILE_BIN || env?.SCRIBE_COMPILE_BIN) {
    _backend = { kind: 'spawn' }
    return _backend
  }
  const native = loadCompilerNative()
  _backend =
    native.kind === 'loaded'
      ? {
          kind: 'native',
          compileEnvelope: native.addon.compileEnvelope.bind(native.addon),
          stampPath: native.addonPath,
        }
      : { kind: 'spawn' }
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
 * css-engine handshake sets SCRIBE_COMPILE_BIN), then the shared resolver.
 * Call-time, never cached here (Bug 6 doctrine: the env var may be set
 * between calls).
 * @internal
 */
export function resolveSpawnBinPath(): string {
  return process.env.SCRIBE_COMPILE_BIN ?? process.env.AIHU_COMPILE_BIN ?? resolveCompilerBinary()
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
