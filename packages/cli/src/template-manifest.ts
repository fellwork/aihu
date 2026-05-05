/**
 * @aihu/cli/template-manifest — public TypeScript shape for `template.config.ts`.
 *
 * Templates depend on this type as a peer; the CLI consumes manifests at
 * scaffold time. Per arch-6 §2.3, this is the contract between
 * `@aihu/cli` and every `@aihu/templates-*` package.
 *
 * Zero runtime deps; the validator is hand-rolled type guards.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChoiceValue = string | boolean

export interface OverridableField {
  readonly choices: ReadonlyArray<ChoiceValue>
  readonly default: ChoiceValue
}

export interface ConditionalFile {
  readonly path: string
  readonly when: string
}

export type PostInstallKind = 'pm-install' | 'git-init' | 'lint-fix' | 'aihu-check'

export interface PostInstallStep {
  readonly kind: PostInstallKind
  readonly when?: string
  readonly allowFailure?: boolean
}

export interface ConditionalDep {
  readonly version: string
  readonly when: string
}

export interface TemplateManifest {
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly contractVersion: number
  readonly cliRange: string
  readonly fixed: Readonly<Record<string, ChoiceValue>>
  readonly overridable: Readonly<Record<string, OverridableField>>
  readonly conditionalFiles: ReadonlyArray<ConditionalFile>
  readonly placeholders: ReadonlyArray<string>
  readonly postInstall: ReadonlyArray<PostInstallStep>
  readonly appPeerDeps: Readonly<Record<string, string>>
  readonly appPeerDepsConditional?: Readonly<Record<string, ConditionalDep>>
}

// ─── Validator ───────────────────────────────────────────────────────────────

const POST_INSTALL_KINDS: ReadonlyArray<PostInstallKind> = [
  'pm-install',
  'git-init',
  'lint-fix',
  'aihu-check',
]

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function fail(msg: string): never {
  throw new Error(`Invalid TemplateManifest: ${msg}`)
}

function requireString(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(`${path} must be a string`)
  return v
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path} must be a finite number`)
  return v
}

function isChoiceValue(v: unknown): v is ChoiceValue {
  return typeof v === 'string' || typeof v === 'boolean'
}

function validateOverridable(v: unknown, path: string): OverridableField {
  if (!isObject(v)) fail(`${path} must be an object`)
  const choices = v.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    fail(`${path}.choices must be a non-empty array`)
  }
  for (let i = 0; i < choices.length; i++) {
    if (!isChoiceValue(choices[i])) fail(`${path}.choices[${i}] must be string or boolean`)
  }
  if (!isChoiceValue(v.default)) fail(`${path}.default must be string or boolean`)
  if (!choices.includes(v.default)) fail(`${path}.default must appear in ${path}.choices`)
  return { choices: choices as ReadonlyArray<ChoiceValue>, default: v.default }
}

function validateConditionalFile(v: unknown, path: string): ConditionalFile {
  if (!isObject(v)) fail(`${path} must be an object`)
  return {
    path: requireString(v.path, `${path}.path`),
    when: requireString(v.when, `${path}.when`),
  }
}

function validatePostInstallStep(v: unknown, path: string): PostInstallStep {
  if (!isObject(v)) fail(`${path} must be an object`)
  const kind = requireString(v.kind, `${path}.kind`)
  if (!POST_INSTALL_KINDS.includes(kind as PostInstallKind)) {
    fail(`${path}.kind must be one of ${POST_INSTALL_KINDS.join(', ')}`)
  }
  const step: { kind: PostInstallKind; when?: string; allowFailure?: boolean } = {
    kind: kind as PostInstallKind,
  }
  if (v.when !== undefined) step.when = requireString(v.when, `${path}.when`)
  if (v.allowFailure !== undefined) {
    if (typeof v.allowFailure !== 'boolean') fail(`${path}.allowFailure must be boolean`)
    step.allowFailure = v.allowFailure
  }
  return step
}

function validateStringRecord(v: unknown, path: string): Record<string, string> {
  if (!isObject(v)) fail(`${path} must be an object`)
  const out: Record<string, string> = {}
  for (const k of Object.keys(v)) {
    out[k] = requireString(v[k], `${path}.${k}`)
  }
  return out
}

function validateConditionalDeps(v: unknown, path: string): Record<string, ConditionalDep> {
  if (!isObject(v)) fail(`${path} must be an object`)
  const out: Record<string, ConditionalDep> = {}
  for (const k of Object.keys(v)) {
    const entry = v[k]
    if (!isObject(entry)) fail(`${path}.${k} must be an object`)
    out[k] = {
      version: requireString(entry.version, `${path}.${k}.version`),
      when: requireString(entry.when, `${path}.${k}.when`),
    }
  }
  return out
}

/**
 * Validate an arbitrary value as a TemplateManifest. Throws Error with a
 * clear message on failure; returns the typed manifest on success.
 */
export function validateManifest(obj: unknown): TemplateManifest {
  if (!isObject(obj)) fail('manifest must be an object')

  const name = requireString(obj.name, 'name')
  const displayName = requireString(obj.displayName, 'displayName')
  const description = requireString(obj.description, 'description')
  const contractVersion = requireNumber(obj.contractVersion, 'contractVersion')
  const cliRange = requireString(obj.cliRange, 'cliRange')

  if (!isObject(obj.fixed)) fail('fixed must be an object')
  const fixed: Record<string, ChoiceValue> = {}
  for (const k of Object.keys(obj.fixed)) {
    const val = (obj.fixed as Record<string, unknown>)[k]
    if (!isChoiceValue(val)) fail(`fixed.${k} must be a string or boolean`)
    fixed[k] = val
  }

  if (!isObject(obj.overridable)) fail('overridable must be an object')
  const overridable: Record<string, OverridableField> = {}
  for (const k of Object.keys(obj.overridable)) {
    overridable[k] = validateOverridable(
      (obj.overridable as Record<string, unknown>)[k],
      `overridable.${k}`,
    )
  }

  if (!Array.isArray(obj.conditionalFiles)) fail('conditionalFiles must be an array')
  const conditionalFiles = obj.conditionalFiles.map((c, i) =>
    validateConditionalFile(c, `conditionalFiles[${i}]`),
  )

  if (!Array.isArray(obj.placeholders)) fail('placeholders must be an array')
  const placeholders: string[] = []
  for (let i = 0; i < obj.placeholders.length; i++) {
    placeholders.push(requireString(obj.placeholders[i], `placeholders[${i}]`))
  }

  if (!Array.isArray(obj.postInstall)) fail('postInstall must be an array')
  const postInstall = obj.postInstall.map((s, i) =>
    validatePostInstallStep(s, `postInstall[${i}]`),
  )

  const appPeerDeps = validateStringRecord(obj.appPeerDeps, 'appPeerDeps')

  const manifest: TemplateManifest = {
    name,
    displayName,
    description,
    contractVersion,
    cliRange,
    fixed,
    overridable,
    conditionalFiles,
    placeholders,
    postInstall,
    appPeerDeps,
    ...(obj.appPeerDepsConditional !== undefined
      ? {
          appPeerDepsConditional: validateConditionalDeps(
            obj.appPeerDepsConditional,
            'appPeerDepsConditional',
          ),
        }
      : {}),
  }

  return manifest
}
