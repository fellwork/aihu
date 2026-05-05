/**
 * @aihu/cli/scaffold-pipeline — the 6 pure functions per arch-6 §4.4.
 *
 * Pipeline order: resolveTemplate → mergeOptions → enumerateFiles →
 * readSubstituteWrite → runPostInstall → printNextSteps.
 *
 * Purity contract (arch-6 §4.4):
 *   - resolveTemplate / mergeOptions / enumerateFiles do NO I/O.
 *     They operate on the manifest object the caller hands them.
 *   - readSubstituteWrite and runPostInstall DO I/O — but the I/O surface
 *     is injected via the FileSystem and Spawner interfaces so tests can
 *     run them against in-memory fakes without touching the disk.
 */

import type { SpawnSyncReturns } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { evalWhen } from './conditional-eval.ts'
import type { PostInstallStep, TemplateManifest } from './template-manifest.ts'
import { validateManifest } from './template-manifest.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedOptions {
  appName: string
  appDescription?: string
  pm: 'bun' | 'pnpm' | 'npm' | 'yarn'
  /** All overridable cells from the manifest, resolved to a final value. */
  overrides: Record<string, string | boolean>
  /** Whether to skip the git-init post-install step. */
  noGit?: boolean
}

export interface FileTuple {
  /** Path within the template/ directory (POSIX-style; '/' separator). */
  sourcePath: string
  /** Path written into the user's project (drops `.tmpl`). */
  targetRelPath: string
  /** True when sourcePath ends in `.tmpl` and substitution must run. */
  isTemplate: boolean
}

export interface WrittenFiles {
  written: string[]
  skipped: string[]
}

export interface PostInstallResult {
  ran: PostInstallStep[]
  skipped: PostInstallStep[]
  failures: Array<{ step: PostInstallStep; error: string }>
}

// ─── Injectable side-effect surfaces (real implementations + test fakes) ─────

export interface FileSystem {
  exists(path: string): boolean
  read(path: string): string
  write(path: string, content: string): void
  mkdirp(path: string): void
}

export const realFileSystem: FileSystem = {
  exists: (p) => existsSync(p),
  read: (p) => readFileSync(p, 'utf8'),
  write: (p, c) => writeFileSync(p, c, 'utf8'),
  mkdirp: (p) => mkdirSync(p, { recursive: true }),
}

export interface Spawner {
  run(
    command: string,
    args: ReadonlyArray<string>,
    cwd: string,
  ): { status: number | null; stdout: string; stderr: string }
}

export const realSpawner: Spawner = {
  run(command, args, cwd) {
    const result: SpawnSyncReturns<string> = spawnSync(command, [...args], {
      cwd,
      shell: false, // mirrors create.ts pattern
      encoding: 'utf8',
    })
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  },
}

// ─── 1. resolveTemplate ──────────────────────────────────────────────────────

/**
 * Stub for B1.1: load a manifest object from a path. The full version (B1.2+)
 * dynamically imports `<pkg>/dist/template.config.js` from a resolved npm
 * package; the seam is identical because both produce a validated
 * TemplateManifest.
 *
 * For B1.1, callers pass the manifest object directly. We expose a function
 * shape that takes either an already-loaded object or a `loader` callback so
 * tests can inject without touching the disk.
 */
export interface ResolveTemplateInput {
  /** Already-loaded manifest object (the typical B1.1 path). */
  manifest?: unknown
  /** Optional async loader (B1.2 will plug in `import()`-by-path here). */
  loader?: () => Promise<unknown>
}

export async function resolveTemplate(
  input: ResolveTemplateInput,
): Promise<TemplateManifest> {
  const raw =
    input.manifest !== undefined
      ? input.manifest
      : input.loader
        ? await input.loader()
        : undefined
  if (raw === undefined) {
    throw new Error('resolveTemplate: must provide either `manifest` or `loader`')
  }
  return validateManifest(raw)
}

// ─── 2. mergeOptions ─────────────────────────────────────────────────────────

export interface MergeOptionsInput {
  appName: string
  appDescription?: string
  pm?: 'bun' | 'pnpm' | 'npm' | 'yarn'
  noGit?: boolean
  /** User-supplied override values (CLI flags + prompt answers). */
  userOverrides: Record<string, string | boolean>
}

export function mergeOptions(
  manifest: TemplateManifest,
  input: MergeOptionsInput,
): ResolvedOptions {
  // Validate appName: kebab-ish, no leading digit (per arch-6 §4.3).
  if (!/^[a-z][a-z0-9-]*$/.test(input.appName)) {
    throw new Error(
      `mergeOptions: appName ${JSON.stringify(input.appName)} must match /^[a-z][a-z0-9-]*$/`,
    )
  }

  // Reject any user-attempted override of a `fixed` cell.
  for (const key of Object.keys(input.userOverrides)) {
    if (Object.hasOwn(manifest.fixed, key)) {
      throw new Error(
        `mergeOptions: cannot override fixed manifest cell ${JSON.stringify(key)}`,
      )
    }
  }

  // Resolve every `overridable` cell: user value if provided + valid, else default.
  const overrides: Record<string, string | boolean> = {}
  for (const key of Object.keys(manifest.overridable)) {
    const field = manifest.overridable[key]!
    if (Object.hasOwn(input.userOverrides, key)) {
      const v = input.userOverrides[key]!
      if (!field.choices.includes(v)) {
        throw new Error(
          `mergeOptions: ${key}=${JSON.stringify(v)} not in allowed choices ${JSON.stringify(field.choices)}`,
        )
      }
      overrides[key] = v
    } else {
      overrides[key] = field.default
    }
  }

  // Reject unknown override keys (anything not in fixed and not in overridable).
  for (const key of Object.keys(input.userOverrides)) {
    if (!Object.hasOwn(manifest.overridable, key)) {
      throw new Error(`mergeOptions: unknown override key ${JSON.stringify(key)}`)
    }
  }

  const result: ResolvedOptions = {
    appName: input.appName,
    pm: input.pm ?? 'bun',
    overrides,
    ...(input.appDescription !== undefined ? { appDescription: input.appDescription } : {}),
    ...(input.noGit !== undefined ? { noGit: input.noGit } : {}),
  }
  return result
}

// ─── 3. enumerateFiles ───────────────────────────────────────────────────────

export interface EnumerateFilesInput {
  /** Every file path under template/ in POSIX form, e.g. `'src/main.ts.tmpl'`. */
  templateFiles: ReadonlyArray<string>
}

/**
 * Pure: given a manifest + resolved options + a list of paths under template/,
 * produce the ordered FileTuple list to write.
 *
 * For each path:
 *   - if it appears in manifest.conditionalFiles, evaluate the `when`
 *     expression against the merged context (overrides ∪ fixed cells).
 *     Skip the file if the expression is false.
 *   - otherwise include unconditionally.
 *
 * Strips `.tmpl` from the target relpath when present.
 */
export function enumerateFiles(
  manifest: TemplateManifest,
  options: ResolvedOptions,
  input: EnumerateFilesInput,
): FileTuple[] {
  const conditional = new Map<string, string>()
  for (const c of manifest.conditionalFiles) {
    conditional.set(normalize(c.path), c.when)
  }

  const ctx: Record<string, unknown> = {
    ...manifest.fixed,
    ...options.overrides,
  }

  const out: FileTuple[] = []
  for (const raw of input.templateFiles) {
    const sourcePath = normalize(raw)
    const when = conditional.get(sourcePath)
    if (when !== undefined && !evalWhen(when, ctx)) continue

    const isTemplate = sourcePath.endsWith('.tmpl')
    const targetRelPath = isTemplate ? sourcePath.slice(0, -5) : sourcePath
    out.push({ sourcePath, targetRelPath, isTemplate })
  }
  return out
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

// ─── 4. readSubstituteWrite ──────────────────────────────────────────────────

const PLACEHOLDER_TOKENS = [
  '__APP_NAME__',
  '__APP_DESCRIPTION__',
  '__APP_VERSION__',
  '__AIHU_VERSION__',
  '__TEMPLATE_NAME__',
  '__SCAFFOLD_DATE__',
] as const

export interface ReadSubstituteWriteInput {
  templateRoot: string
  targetDir: string
  manifest: TemplateManifest
  options: ResolvedOptions
  fs?: FileSystem
  /** Override the date stamp (deterministic tests). */
  now?: () => string
}

export function readSubstituteWrite(
  files: ReadonlyArray<FileTuple>,
  input: ReadSubstituteWriteInput,
): WrittenFiles {
  const fs = input.fs ?? realFileSystem
  const written: string[] = []
  const skipped: string[] = []

  const subs = buildSubstitutions(input.manifest, input.options, input.now)

  for (const f of files) {
    const src = posix.join(normalize(input.templateRoot), f.sourcePath)
    const dst = join(input.targetDir, f.targetRelPath.replace(/\//g, sepFor(input.targetDir)))

    if (fs.exists(dst)) {
      skipped.push(dst)
      continue
    }

    const raw = fs.read(src)
    const content = f.isTemplate ? substitute(raw, subs) : raw

    fs.mkdirp(dirname(dst))
    fs.write(dst, content)
    written.push(dst)
  }

  return { written, skipped }
}

function sepFor(targetDir: string): string {
  return targetDir.includes('\\') ? '\\' : '/'
}

function buildSubstitutions(
  manifest: TemplateManifest,
  options: ResolvedOptions,
  now: (() => string) | undefined,
): Record<string, string> {
  const aihuVersion = manifest.appPeerDeps['@aihu/runtime'] ?? '^1.0.0'
  return {
    __APP_NAME__: options.appName,
    __APP_DESCRIPTION__: options.appDescription ?? manifest.displayName,
    __APP_VERSION__: '0.1.0',
    __AIHU_VERSION__: aihuVersion,
    __TEMPLATE_NAME__: manifest.name,
    __SCAFFOLD_DATE__: (now ?? (() => new Date().toISOString().slice(0, 10)))(),
  }
}

function substitute(input: string, subs: Record<string, string>): string {
  let out = input
  for (const token of PLACEHOLDER_TOKENS) {
    out = out.replaceAll(token, subs[token] ?? '')
  }
  return out
}

// ─── 5. runPostInstall ───────────────────────────────────────────────────────

export interface RunPostInstallInput {
  manifest: TemplateManifest
  options: ResolvedOptions
  targetDir: string
  spawner?: Spawner
}

export function runPostInstall(input: RunPostInstallInput): PostInstallResult {
  const spawner = input.spawner ?? realSpawner
  const ctx: Record<string, unknown> = {
    ...input.manifest.fixed,
    ...input.options.overrides,
    initGit: input.options.noGit !== true && (input.options.overrides.initGit ?? true),
  }

  const ran: PostInstallStep[] = []
  const skipped: PostInstallStep[] = []
  const failures: Array<{ step: PostInstallStep; error: string }> = []

  for (const step of input.manifest.postInstall) {
    if (step.when !== undefined) {
      if (!evalWhen(step.when, ctx)) {
        skipped.push(step)
        continue
      }
    }

    const cmd = commandFor(step, input.options.pm)
    if (cmd === null) {
      // Step is recognized but a no-op for this options shape (e.g. git-init
      // when --no-git was passed; aihu-check before the binary exists).
      skipped.push(step)
      continue
    }

    const res = spawner.run(cmd.command, cmd.args, input.targetDir)
    if (res.status === 0) {
      ran.push(step)
    } else if (step.allowFailure === true) {
      ran.push(step) // best-effort; we ran it, it failed quietly
    } else {
      failures.push({
        step,
        error: `command ${cmd.command} ${cmd.args.join(' ')} exited with status ${res.status}: ${res.stderr.trim()}`,
      })
    }
  }

  return { ran, skipped, failures }
}

function commandFor(
  step: PostInstallStep,
  pm: ResolvedOptions['pm'],
): { command: string; args: string[] } | null {
  switch (step.kind) {
    case 'pm-install':
      return { command: pm, args: ['install'] }
    case 'git-init':
      return { command: 'git', args: ['init'] }
    case 'lint-fix':
      return { command: pm, args: ['run', 'check'] }
    case 'aihu-check':
      // The aihu binary is the new app's local devDep; until install ran,
      // we can't run it. Skip silently if pm-install has not yet run.
      return null
  }
}

// ─── 6. printNextSteps ───────────────────────────────────────────────────────

export interface PrintNextStepsInput {
  options: ResolvedOptions
  targetDir: string
  /** Inject for testing; defaults to process.stdout.write. */
  output?: (chunk: string) => void
}

export function printNextSteps(input: PrintNextStepsInput): void {
  const write = input.output ?? ((s: string) => process.stdout.write(s))
  const lines = [
    '',
    `  Done! Your app is at ${input.targetDir}`,
    '',
    '  Next steps:',
    `    cd ${input.options.appName}`,
    `    ${input.options.pm} run dev`,
    '',
    '  Docs: https://github.com/fellwork/aihu',
    '',
  ]
  write(lines.join('\n'))
}
