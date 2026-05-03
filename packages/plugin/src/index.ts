/**
 * @scribe/plugin — build/dev-time only plugin contract.
 *
 * Implements the type contract and registration plumbing defined in the
 * Plugin Contract Spec (`docs/superpowers/specs/2026-05-02-spec-plugin-contract.md`)
 * sections §1 (Plugin Anatomy), §2 (Contributions), §3 (Configuration),
 * §6.5 (Server-Side Contributions), and §8.1 (Validation errors).
 *
 * v0.2.1 ships the type contract plus a `definePlugin` factory and a
 * `validatePlugin` build-time validator. The compiler dispatcher is a no-op
 * until v0.3+ wires block parsers, macro lowerings, and hook execution.
 *
 * Per Plugin Contract Spec §7.2: scribe does NOT auto-discover plugins.
 * Every plugin MUST be explicitly imported and registered in
 * `defineScribeConfig({ plugins: [...] })`.
 *
 * Runtime imports: NONE. This package is build/dev-time only and carries no
 * runtime size budget. Per Learning #49 (v3 dep-free thesis): zero non-`@scribe/*`
 * dependencies; in this package's case, zero dependencies of any kind.
 */

// ---------------------------------------------------------------------------
// Build / SFC / Block / Macro context shapes (spec §4.2, §5.2)
// ---------------------------------------------------------------------------

/**
 * Build target semantics per Block Structure Spec §11.5. Plugin server-side
 * contributions follow the same target-awareness rules (Plugin Contract Spec §6.5.7).
 */
export type BuildTarget = 'client' | 'server' | 'universal'

/** Build mode (dev vs production build). */
export type BuildMode = 'dev' | 'build'

/**
 * Build-time context provided to `beforeCompile` hooks (spec §4.2).
 * Resolved once per build; hooks see the same values throughout.
 */
export interface BuildContext {
  /** Resolved plugin configuration (per spec §3). */
  readonly config: Readonly<Record<string, unknown>>
  readonly mode: BuildMode
  readonly outputDir: string
  readonly projectRoot: string
}

/**
 * Per-SFC compilation context provided to `afterParse` and `afterCompile` hooks
 * (spec §4.2). Extends BuildContext with file-specific metadata.
 */
export interface SfcContext extends BuildContext {
  readonly sfcPath: string
  readonly componentName: string
  /**
   * Symbol table contents (per Block Structure Spec §11.3). Opaque shape
   * here; the compiler defines exact contents.
   */
  readonly symbolTable: Readonly<Record<string, unknown>>
}

/**
 * Per-block context provided to `transformBlock` hooks and macro lowering
 * (spec §4.2, §5.2). Extends SfcContext with the current block's identity.
 */
export interface BlockContext extends SfcContext {
  readonly blockType: string
  readonly blockName: string
}

/**
 * Macro lowering context (spec §5.2). Provides plugin config, SFC and block
 * contexts, plus the `imports` and `runtime` helpers for emitting bundle
 * references without hardcoding paths.
 */
export interface MacroContext {
  readonly pluginConfig: Readonly<Record<string, unknown>>
  readonly sfc: SfcContext
  readonly block: BlockContext
  /** Request an import. Returns the local name to use in emitted code. */
  readonly imports: (spec: string) => string
  /** Request a runtime helper. Returns the local name to use in emitted code. */
  readonly runtime: (name: string) => string
}

/** Macro arguments — opaque shape; per-macro semantics. */
export type MacroArgs = Readonly<Record<string, unknown>>

// ---------------------------------------------------------------------------
// Lowering result (spec §5.3 + Block Structure §11.5)
// ---------------------------------------------------------------------------

export interface ImportSpec {
  readonly from: string
  readonly names: ReadonlyArray<string>
}

/**
 * Complex emission result for macros that emit multiple statements or require
 * imports/hoisted declarations (spec §5.3).
 *
 * The optional `target` field directs lowered output to either the client or
 * server bundle (per Block Structure Spec §11.5 split-bundle compilation).
 * `'universal'` is permitted for code that runs in both contexts.
 */
export interface LoweringResult {
  readonly code: string
  readonly imports?: ReadonlyArray<ImportSpec>
  readonly hoist?: ReadonlyArray<string>
  /**
   * Explicit emission target per Block Structure Spec §11.5. When omitted,
   * the compiler infers based on enclosing context.
   */
  readonly target?: BuildTarget
}

/**
 * Macro lowering function signature (spec §5.1). May return either a raw code
 * string (simple case) or a `LoweringResult` (complex emission).
 */
export type MacroLowering = (ctx: MacroContext, args: MacroArgs) => string | LoweringResult

/**
 * Macro validation function signature (spec §5.4). Runs at parse time; calls
 * `ctx.error(...)` to report validation failures at the SFC source location.
 */
export type MacroValidation = (
  ctx: { readonly error: (msg: string) => void },
  args: MacroArgs,
) => void

// ---------------------------------------------------------------------------
// Contribution shapes (spec §2)
// ---------------------------------------------------------------------------

/**
 * Macro contribution declaration (spec §2.2). `name` MUST start with `$`;
 * `validIn` lists block selectors where the macro is permitted. `lowering`
 * is required per §2.2 type matrix.
 */
export interface Macro {
  readonly name: string
  readonly validIn: ReadonlyArray<string>
  readonly lowering: MacroLowering
  readonly validation?: MacroValidation
  /**
   * When true, the macro emits server-only output (per spec §6.5.2). The
   * compiler treats it analogously to `$server`: lowered output goes to the
   * server artifact and client code accessing it gets RPC stubs.
   */
  readonly serverOnly?: boolean
}

/**
 * Block parser signature (spec §2.1). Receives the block body (text between
 * `{` and `}`) plus a parser context; returns an AST node specific to the
 * block's purpose.
 */
export type BlockParser = (body: string, ctx: BlockContext) => unknown

/**
 * Transform stages (spec §2.4). Order: `after-parse` → `before-lower` →
 * `after-lower`. Within a stage, plugin registration order determines
 * order of operations.
 */
export type TransformStage = 'after-parse' | 'before-lower' | 'after-lower'

export interface Transform {
  readonly stage: TransformStage
  readonly fn: (input: unknown) => unknown
}

/**
 * Server middleware contribution (spec §6.5.3). PROVISIONAL in v1.0 — may
 * evolve based on plugin author feedback during the v1.x series.
 */
export type MiddlewareStage = 'before-handler' | 'after-handler' | 'on-error'

export interface Middleware {
  readonly name: string
  readonly stage: MiddlewareStage
  /** Path to the middleware handler module, relative to the plugin root. */
  readonly handler: string
}

/**
 * Server-only runtime helper map (spec §6.5.1). Keys are helper names; values
 * are paths (relative to the plugin root) to the helper module. Server-only
 * helpers are loaded into the server bundle but never the client bundle.
 */
export type ServerRuntime = Readonly<Record<string, string>>

/**
 * Plugin contributions (spec §2 + §6.5). All fields optional; a plugin with
 * no contributions and no hooks is valid but does nothing.
 */
export interface Contributes {
  readonly blocks?: ReadonlyArray<string>
  readonly macros?: ReadonlyArray<Macro>
  readonly components?: ReadonlyArray<string>
  readonly transforms?: ReadonlyArray<Transform>
  /** Server-only runtime helpers (spec §6.5.1). */
  readonly serverRuntime?: ServerRuntime
  /** Server middleware (spec §6.5.3, provisional). */
  readonly middleware?: ReadonlyArray<Middleware>
}

// ---------------------------------------------------------------------------
// Hooks (spec §4)
// ---------------------------------------------------------------------------

export type BeforeCompileHook = (ctx: BuildContext) => Promise<void> | void
export type AfterParseHook = (
  ctx: SfcContext,
  ast: unknown,
) => Promise<unknown | void> | unknown | void
export type TransformBlockHook = (
  ctx: BlockContext,
  block: unknown,
) => Promise<unknown | void> | unknown | void
export type AfterCompileHook = (
  ctx: SfcContext,
  output: unknown,
) => Promise<unknown | void> | unknown | void

export interface Hooks {
  readonly beforeCompile?: BeforeCompileHook
  readonly afterParse?: AfterParseHook
  readonly transformBlock?: TransformBlockHook
  readonly afterCompile?: AfterCompileHook
}

// ---------------------------------------------------------------------------
// Configuration schema (spec §3.1)
// ---------------------------------------------------------------------------

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function'

export interface ConfigFieldSpec {
  readonly type: ConfigFieldType
  readonly default?: unknown
  readonly description?: string
}

export type ConfigSchema = Readonly<Record<string, ConfigFieldSpec>>

// ---------------------------------------------------------------------------
// Plugin definition (spec §1.1)
// ---------------------------------------------------------------------------

/**
 * Plugin definition input — what authors pass to `definePlugin`. Required
 * fields: `name`, `version`, `namespace` (per spec §1.2).
 */
export interface PluginConfig {
  readonly name: string
  readonly version: string
  readonly namespace: string
  /** Compatible scribe versions (semver range). Checked at registration (spec §7.3). */
  readonly scribeVersion?: string
  readonly configSchema?: ConfigSchema
  readonly contributes?: Contributes
  readonly hooks?: Hooks
  readonly parsers?: Readonly<Record<string, BlockParser>>
  /** Other plugin namespaces this plugin depends on (spec §10.1). */
  readonly dependencies?: ReadonlyArray<string>
}

/**
 * Plugin instance — the registered, validated plugin. v0.2.1 keeps the same
 * shape as `PluginConfig`; future versions may add a discriminator brand.
 */
export interface Plugin extends PluginConfig {
  /** Brand to distinguish constructed plugins from raw config objects. */
  readonly __scribe_plugin: true
}

// ---------------------------------------------------------------------------
// Reserved namespaces (spec §1.3)
// ---------------------------------------------------------------------------

/**
 * Reserved plugin namespaces per spec §1.3. Plugins MUST NOT use these names
 * as their `namespace` field.
 */
export const RESERVED_NAMESPACES: ReadonlyArray<string> = Object.freeze([
  'scribe',
  'core',
  'state',
  'template',
  'style',
  'agent',
  'route',
])

/**
 * Valid identifier pattern for plugin namespaces (spec §1.3): alphanumeric,
 * underscores, hyphens. Must start with a letter or underscore.
 */
const NAMESPACE_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

// ---------------------------------------------------------------------------
// Validation (spec §8.1)
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** Stable error code corresponding to a row in spec §8.1 / §8.2. */
  readonly code:
    | 'invalid-namespace'
    | 'reserved-namespace'
    | 'duplicate-namespace'
    | 'missing-required-field'
    | 'scribe-version-mismatch'
  readonly message: string
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: ReadonlyArray<ValidationError> }

/**
 * Current scribe framework version against which `scribeVersion` ranges are
 * checked. Imported by `validatePlugin` for the §7.3 compatibility check.
 *
 * v0.2.1: `0.2.0` per the v1 framework plan (`@scribe/plugin` package version).
 */
export const SCRIBE_VERSION = '0.2.0'

/**
 * Track of namespaces seen by `validatePlugin` calls in the current process.
 * Reset by `resetValidationState()` (used by tests). The compiler invokes
 * `validatePlugin` per plugin in `defineScribeConfig.plugins` at registration
 * time; duplicates surface as the §8.1 "Duplicate namespace" error.
 */
const seenNamespaces = new Set<string>()

/**
 * Reset the duplicate-namespace tracker. Intended for tests and for compiler
 * implementations that initialize a fresh registration pass per build.
 */
export function resetValidationState(): void {
  seenNamespaces.clear()
}

/**
 * Validate a plugin per spec §8.1. Returns a `ValidationResult` describing
 * any errors found. Does NOT throw — the caller decides whether to abort.
 *
 * Error cases covered (per spec §8.1):
 *   - invalid-namespace        (e.g., `@scope/foo`, contains `/`, starts with digit)
 *   - reserved-namespace       (`scribe`, `core`, `state`, `template`, `style`, `agent`, `route`)
 *   - duplicate-namespace      (two plugins with the same `namespace` in one pass)
 *   - missing-required-field   (no `name` / `version` / `namespace`)
 *   - scribe-version-mismatch  (declared `scribeVersion` range incompatible with framework)
 */
export function validatePlugin(plugin: Plugin): ValidationResult {
  const errors: ValidationError[] = []

  // Missing required fields (spec §8.1 row 4)
  const missing: string[] = []
  if (!plugin.name) missing.push('name')
  if (!plugin.version) missing.push('version')
  if (!plugin.namespace) missing.push('namespace')
  if (missing.length > 0) {
    errors.push({
      code: 'missing-required-field',
      message: `plugin definition missing required fields: ${missing.join(', ')}`,
    })
  }

  // Namespace shape & reservation checks (spec §1.3, §8.1 rows 1-2)
  if (plugin.namespace) {
    if (!NAMESPACE_PATTERN.test(plugin.namespace)) {
      errors.push({
        code: 'invalid-namespace',
        message: `plugin namespace must be a valid identifier; got '${plugin.namespace}'`,
      })
    } else if (RESERVED_NAMESPACES.includes(plugin.namespace)) {
      errors.push({
        code: 'reserved-namespace',
        message: `plugin namespace '${plugin.namespace}' is reserved by scribe`,
      })
    } else if (seenNamespaces.has(plugin.namespace)) {
      errors.push({
        code: 'duplicate-namespace',
        message: `duplicate plugin namespace '${plugin.namespace}'. Plugins must have unique namespaces`,
      })
    } else {
      seenNamespaces.add(plugin.namespace)
    }
  }

  // scribeVersion compatibility (spec §7.3, §8.1 row 5)
  if (plugin.scribeVersion && !satisfies(SCRIBE_VERSION, plugin.scribeVersion)) {
    const id = plugin.name && plugin.version ? `'${plugin.name}@${plugin.version}'` : 'plugin'
    errors.push({
      code: 'scribe-version-mismatch',
      message: `plugin ${id} requires scribe ${plugin.scribeVersion}; running ${SCRIBE_VERSION}`,
    })
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

/**
 * Minimal semver range check. Supports the subset used by the spec for
 * `scribeVersion`: exact (`0.2.0`), caret (`^0.2.0`), tilde (`~0.2.0`), and
 * `*` / `x` wildcards. We deliberately do NOT pull in a `semver` dependency
 * (Learning #49: zero non-`@scribe/*` runtime deps).
 *
 * For ranges this helper does not understand, it returns `false`, which
 * surfaces as a `scribe-version-mismatch` error and forces plugin authors
 * onto the supported subset. That's the conservative bias the spec wants
 * (compatibility errors caught at registration, not at runtime).
 */
function satisfies(version: string, range: string): boolean {
  const trimmed = range.trim()
  if (trimmed === '*' || trimmed === 'x' || trimmed === '') return true

  const v = parseSemver(version)
  if (!v) return false

  if (trimmed.startsWith('^')) {
    const r = parseSemver(trimmed.slice(1))
    if (!r) return false
    if (r.major === 0) {
      // ^0.x.y — compatible with patches/minor only when minor matches and patch >=
      if (r.minor === 0) {
        return v.major === 0 && v.minor === 0 && v.patch >= r.patch
      }
      return v.major === 0 && v.minor === r.minor && v.patch >= r.patch
    }
    return v.major === r.major && (v.minor > r.minor || (v.minor === r.minor && v.patch >= r.patch))
  }

  if (trimmed.startsWith('~')) {
    const r = parseSemver(trimmed.slice(1))
    if (!r) return false
    return v.major === r.major && v.minor === r.minor && v.patch >= r.patch
  }

  // Exact match
  const r = parseSemver(trimmed)
  if (!r) return false
  return v.major === r.major && v.minor === r.minor && v.patch === r.patch
}

function parseSemver(s: string): { major: number; minor: number; patch: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(s.trim())
  if (!m) return null
  // m[1], m[2], m[3] are guaranteed by the regex; cast for noUncheckedIndexedAccess.
  return {
    major: Number.parseInt(m[1] as string, 10),
    minor: Number.parseInt(m[2] as string, 10),
    patch: Number.parseInt(m[3] as string, 10),
  }
}

// ---------------------------------------------------------------------------
// definePlugin factory (spec §1.1)
// ---------------------------------------------------------------------------

/**
 * Define a scribe plugin. Brands the input config with `__scribe_plugin: true`
 * and returns it as a `Plugin`. Does NOT validate — call `validatePlugin`
 * separately (the compiler does this at registration per spec §7.1).
 *
 * @example
 * import { definePlugin } from '@scribe/plugin'
 *
 * export default definePlugin({
 *   name: 'forms',
 *   version: '0.1.0',
 *   namespace: 'forms',
 *   contributes: {
 *     blocks: ['fields'],
 *     macros: [{ name: '$field', validIn: ['@forms.fields'], lowering: lowerField }],
 *   },
 * })
 */
export function definePlugin(config: PluginConfig): Plugin {
  return {
    ...config,
    __scribe_plugin: true,
  }
}
