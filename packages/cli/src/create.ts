/**
 * `create-aihu` — interactive project scaffolder for `npx create-aihu@latest`.
 *
 * Usage:
 *   npx create-aihu@latest [project-name] [--template <id>]
 *   npm create aihu [project-name] -- --template <id>
 *   bun create aihu [project-name] --template <id>
 *
 * Features (SOTA npx create pattern):
 *   - Auto-detects available package managers (bun > pnpm > yarn > npm)
 *   - Interactive prompts via Node readline (zero extra dependencies)
 *   - `--template` spans BOTH tiers of the catalogue: the built-in templates
 *     embedded in @aihu/cli (minimal | full | docs | agent) and the
 *     npm-published `@aihu/templates-*` packages (installed on demand and run
 *     through the shared 6-stage scaffold pipeline).
 *   - Optional git init
 *   - Prints exact next steps with detected PM
 *
 * Why the npm-template tier lives here (FEL-422): `npx @aihu/cli app my-app`
 * cannot work — npx infers the bin from the package NAME and @aihu/cli's bins
 * are `aihu` and `create-aihu`, so npm users could never reach
 * `aihu app --template <pkg>`. `create-aihu` is the entry point they DO reach,
 * so it has to be the complete one.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { AppTemplate, CssChoice, PkgManager, ShadowChoice } from './index.js'
import { scaffoldApp } from './index.js'
import { printNextSteps, scaffoldFromTemplatePackage } from './scaffold-pipeline.js'
import {
  type CatalogEntry,
  formatTemplateCatalog,
  type KnownTemplate,
  selectableTemplates,
  selectTemplate,
} from './templates-registry.js'

// ─── Colour helpers (no deps) ────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  purple: '\x1b[35m',
}

function bold(s: string): string {
  return `${c.bold}${s}${c.reset}`
}
function dim(s: string): string {
  return `${c.dim}${s}${c.reset}`
}
function green(s: string): string {
  return `${c.green}${s}${c.reset}`
}
function cyan(s: string): string {
  return `${c.cyan}${s}${c.reset}`
}
function yellow(s: string): string {
  return `${c.yellow}${s}${c.reset}`
}
function purple(s: string): string {
  return `${c.purple}${s}${c.reset}`
}

// ─── Package manager detection ───────────────────────────────────────────────

/** Check if a program exists by running `pm --version` via spawnSync (no shell). */
function pmExists(pm: string): boolean {
  const r = spawnSync(pm, ['--version'], { stdio: 'ignore', shell: false })
  return r.status === 0
}

function detectPm(): PkgManager {
  for (const pm of ['bun', 'pnpm', 'yarn', 'npm'] as const) {
    if (pmExists(pm)) return pm
  }
  return 'npm'
}

// ─── Readline prompt helper ───────────────────────────────────────────────────

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((res) => rl.question(question, res))
}

// ─── Argv flag helpers (pre-fill / skip prompts) ─────────────────────────────

const argv = process.argv.slice(2)

function extractFlag(flag: string): string | undefined {
  const long = `--${flag}`
  const longEq = `${long}=`
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === long) return argv[i + 1]
    if (a.startsWith(longEq)) return a.slice(longEq.length)
  }
  return undefined
}

function hasFlag(flag: string): boolean {
  return argv.includes(`--${flag}`)
}

/**
 * Resolve the css-engine choice from argv (`--css engine|none` or the
 * `--css-engine` boolean alias). Returns `undefined` when no css flag was
 * passed, so the wizard knows to prompt.
 */
function cssFromArgv(): CssChoice | undefined {
  if (hasFlag('css-engine')) return 'engine'
  const raw = extractFlag('css')
  if (raw === 'engine') return 'engine'
  if (raw === 'none') return 'none'
  return undefined
}

/** Resolve the shadow-mode choice from argv, or `undefined` to prompt. */
function shadowFromArgv(): ShadowChoice | undefined {
  const raw = extractFlag('shadow')
  if (raw === 'light' || raw === 'shadow') return raw
  return undefined
}

// ─── Template selection (built-ins + npm packages) ───────────────────────────

/**
 * What `--template` resolved to, including the two "user needs the list" cases
 * that used to silently fall back to `minimal`:
 *
 *   `--template` with no value      -> { kind: 'missing' }
 *   `--template cf-team`            -> { kind: 'package' }   (was: minimal!)
 *   `--template nonsense`           -> { kind: 'unknown' }   (was: minimal!)
 *
 * Silently scaffolding a `minimal` app when the user asked for something else
 * is the worst of the available failure modes — the run "succeeds" and the
 * user finds out much later.
 */
export type CreateTemplateChoice =
  | { readonly kind: 'absent' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'builtin'; readonly name: AppTemplate }
  | { readonly kind: 'package'; readonly id: string; readonly pkg: KnownTemplate }
  | { readonly kind: 'unpublished'; readonly id: string }
  | { readonly kind: 'unknown'; readonly raw: string }

/**
 * Pure classifier over an argv tail. Exported for tests.
 *
 * `present` vs `value` matters: `--template` as the last token (or immediately
 * followed by another flag) is a user who wants the list, not a user who wants
 * the default.
 */
export function classifyTemplateArg(args: ReadonlyArray<string>): CreateTemplateChoice {
  let raw: string | undefined
  let present = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--template') {
      present = true
      const next = args[i + 1]
      raw = next !== undefined && !next.startsWith('-') ? next : undefined
      break
    }
    if (a.startsWith('--template=')) {
      present = true
      raw = a.slice('--template='.length)
      break
    }
  }
  if (!present) return { kind: 'absent' }
  if (raw === undefined || raw === '') return { kind: 'missing' }

  const sel = selectTemplate(raw)
  switch (sel.kind) {
    case 'builtin':
      return { kind: 'builtin', name: sel.id as AppTemplate }
    case 'package':
      return { kind: 'package', id: sel.id, pkg: sel.pkg }
    case 'unpublished':
      return { kind: 'unpublished', id: sel.id }
    case 'unknown':
      return { kind: 'unknown', raw: sel.raw }
  }
}

/** Resolve the built-in template choice from argv, or `undefined` to prompt. */
function templateFromArgv(): AppTemplate | undefined {
  const choice = classifyTemplateArg(argv)
  return choice.kind === 'builtin' ? choice.name : undefined
}

/** Resolve the package-manager choice from argv, or `undefined` to prompt. */
function pmFromArgv(): PkgManager | undefined {
  const raw = extractFlag('pm')
  if (raw === 'bun' || raw === 'pnpm' || raw === 'npm' || raw === 'yarn') return raw
  return undefined
}

/**
 * Pure resolution of every scaffold option from flags + environment, with
 * documented defaults. Used by the non-interactive path (`--yes` or non-TTY
 * stdin) so piped/scripted invocations never hang waiting on a prompt that can
 * never be answered.
 *
 * Defaults: template=minimal, pm=detected, css=none, git=on.
 */
export interface ResolvedCreateOptions {
  readonly template: AppTemplate
  readonly pm: PkgManager
  readonly css: CssChoice
  readonly shadowMode: ShadowChoice
  readonly initGit: boolean
}

export function resolveCreateOptions(opts: {
  template?: AppTemplate | undefined
  pm?: PkgManager | undefined
  css?: CssChoice | undefined
  shadow?: ShadowChoice | undefined
  /** `false` when `--no-git` is present. */
  git?: boolean | undefined
  /** Detected package manager fallback (so this stays pure/testable). */
  detected: PkgManager
}): ResolvedCreateOptions {
  const css: CssChoice = opts.css ?? 'none'
  const shadowMode: ShadowChoice = css === 'engine' ? (opts.shadow ?? 'shadow') : 'shadow'
  return {
    template: opts.template ?? 'minimal',
    pm: opts.pm ?? opts.detected,
    css,
    shadowMode,
    initGit: opts.git ?? true,
  }
}

/** True when the run must be fully non-interactive: `--yes`/`-y` was passed, or
 * stdin is not a TTY (piped/redirected input — Node readline drops buffered
 * lines at EOF, which silently no-ops the wizard). */
function isNonInteractive(): boolean {
  return hasFlag('yes') || argv.includes('-y') || !process.stdin.isTTY
}

// ─── Project name + help ─────────────────────────────────────────────────────

/** Flags that consume the following argv token as their value. */
const VALUE_FLAGS = new Set(['--template', '--pm', '--css', '--shadow', '--options-json'])

/**
 * First positional argument = the project name. Skips flags AND the values of
 * value-taking flags, so `create-aihu --template cf-team my-app` names the app
 * `my-app` — not `--template` (which is what `process.argv[2]` gave you).
 * Exported for tests.
 */
export function parseProjectName(args: ReadonlyArray<string>): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a.startsWith('-')) {
      if (VALUE_FLAGS.has(a)) i++ // skip its value
      continue
    }
    return a
  }
  return undefined
}

/** The `--help` / error-path usage text. Plain text; exported for tests. */
export function usageText(): string {
  return [
    'Usage:',
    '  npm create aihu <project-name> -- [options]',
    '  npx create-aihu <project-name> [options]',
    '  bun create aihu <project-name> [options]',
    '',
    'Options:',
    '  --template <id>     Template to scaffold from (see the list below)',
    '  --pm <bun|pnpm|npm|yarn>   Package manager (default: auto-detected)',
    '  --css <engine|none>        Include @aihu/css-engine (built-in templates only)',
    '  --shadow <light|shadow>    Shadow mode when --css engine is set',
    '  --no-git            Skip git init',
    '  --no-install        Skip dependency install (npm templates only)',
    '  --yes, -y           Non-interactive; take documented defaults',
    '  --help, -h          Show this message',
    '',
    'Templates for --template:',
    formatTemplateCatalog('  '),
    'Examples:',
    '  npm create aihu my-app -- --template minimal',
    '  npx create-aihu my-app --template cf-team',
    '',
  ].join('\n')
}

/**
 * Print the catalogue + exit non-zero. Every "we cannot use that value" path
 * routes through here, so the user never has to already know the names.
 */
function failWithCatalog(message: string): never {
  process.stderr.write(`\n  ${c.red}error${c.reset} ${message}\n\n`)
  process.stderr.write(`  Available templates:\n${formatTemplateCatalog('    ')}\n`)
  process.stderr.write(`  Run with ${bold('--help')} for the full option list.\n\n`)
  process.exit(1)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // `--help` is answered before the banner so the output pipes cleanly.
  if (hasFlag('help') || argv.includes('-h')) {
    process.stdout.write(usageText())
    process.exit(0)
  }

  process.stdout.write('\n')
  process.stdout.write(`${purple(bold('◆'))} ${bold('Create Aihu App')}\n`)
  process.stdout.write(`${dim('  Web Components, reactive.')}\n\n`)

  const detected = detectPm()
  const nonInteractive = isNonInteractive()

  // ── `--template` triage ─────────────────────────────────────────────────────
  // Anything we cannot honor exits non-zero WITH the catalogue, on both the
  // interactive and non-interactive paths. Previously all three of these cases
  // silently produced a `minimal` app.
  const choice = classifyTemplateArg(argv)
  switch (choice.kind) {
    case 'missing':
      failWithCatalog('--template needs a value.')
      break
    case 'unknown':
      failWithCatalog(`unknown template ${JSON.stringify(choice.raw)}.`)
      break
    case 'unpublished':
      failWithCatalog(
        `template ${JSON.stringify(choice.id)} is declared in the aihu registry but is ` +
          'not published to npm yet, so it cannot be scaffolded.',
      )
      break
    default:
      break
  }

  const nameArg = parseProjectName(argv)

  // ── npm template package path ───────────────────────────────────────────────
  // Runs the SAME pipeline as `aihu app --template <pkg>` (shared in
  // scaffold-pipeline.ts) — this is the tier npm users could not reach.
  if (choice.kind === 'package') {
    const projectName = nameArg && nameArg !== '.' ? nameArg : 'my-aihu-app'
    try {
      await scaffoldFromTemplatePackage({
        appName: projectName,
        templatePkg: choice.pkg,
        pm: pmFromArgv() ?? detected,
        noGit: hasFlag('no-git'),
        noInstall: hasFlag('no-install'),
        noAutoInstall: hasFlag('no-auto-install-template'),
      })
    } catch (err) {
      // Surface the real reason and exit non-zero. A scaffold that prints an
      // error and exits 0 is the failure mode that lets broken templates look
      // like successes in CI.
      process.stderr.write(`\n  ${c.red}error${c.reset} ${(err as Error).message}\n\n`)
      process.exit(1)
    }
    return
  }

  // ── Non-interactive path (--yes / -y or non-TTY stdin) ──────────────────────
  // Every unset option takes its documented default; NO prompts are issued.
  // This is the pipe-safe fix: `printf '' | create-aihu demo --yes` (or any
  // redirected stdin) deterministically scaffolds and exits 0 instead of
  // silently no-op'ing when readline loses its buffered lines at EOF.
  if (nonInteractive) {
    const projectName = nameArg && nameArg !== '.' ? nameArg : 'my-aihu-app'
    const opts = resolveCreateOptions({
      template: templateFromArgv(),
      pm: pmFromArgv(),
      css: cssFromArgv(),
      shadow: shadowFromArgv(),
      git: hasFlag('no-git') ? false : undefined,
      detected,
    })
    await scaffoldAndReport(projectName, opts)
    return
  }

  // ── Interactive (TTY) path ──────────────────────────────────────────────────
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // ── Project name ──────────────────────────────────────────────────────────
  let projectName: string
  if (nameArg && nameArg !== '.') {
    projectName = nameArg
    process.stdout.write(`${dim('  Project name:')} ${cyan(projectName)}\n`)
  } else {
    const answer = await prompt(rl, `${dim('  Project name:')} `)
    projectName = answer.trim() || 'my-aihu-app'
  }

  const targetDir = resolve(process.cwd(), projectName)

  if (existsSync(targetDir)) {
    const overwrite = await prompt(
      rl,
      `${yellow('  !')} Directory ${bold(projectName)} already exists. Overwrite? ${dim('[y/N]')} `,
    )
    if (!overwrite.trim().toLowerCase().startsWith('y')) {
      rl.close()
      process.stdout.write(dim('  Aborted.\n\n'))
      process.exit(0)
    }
  }

  // ── Template ──────────────────────────────────────────────────────────────
  // A `--template` flag short-circuits the prompt (mirrors `nameArg`).
  let template: AppTemplate
  const templateArg = templateFromArgv()
  if (templateArg !== undefined) {
    template = templateArg
    process.stdout.write(`${dim('  Template:')} ${cyan(template)}\n`)
  } else {
    process.stdout.write('\n')
    process.stdout.write(`${dim('  Select template:')}\n`)
    process.stdout.write(`    ${cyan('1)')} minimal  — signals + arbor, single SFC\n`)
    process.stdout.write(`    ${cyan('2)')} full     — signals, arbor, router, multi-page\n`)
    process.stdout.write(`    ${cyan('3)')} docs     — docs site starter\n`)
    process.stdout.write(
      `    ${cyan('4)')} agent    — agent-drivable component over the capability bridge\n`,
    )
    const templateAnswer = await prompt(rl, `  ${dim('Template [1]:')} `)
    const templateMap: Record<string, AppTemplate> = {
      '': 'minimal',
      '1': 'minimal',
      minimal: 'minimal',
      '2': 'full',
      full: 'full',
      '3': 'docs',
      docs: 'docs',
      '4': 'agent',
      agent: 'agent',
    }
    template = templateMap[templateAnswer.trim().toLowerCase()] ?? 'minimal'
  }

  // ── Package manager ───────────────────────────────────────────────────────
  // A `--pm` flag short-circuits the prompt.
  let pm: PkgManager
  const pmArg = pmFromArgv()
  if (pmArg !== undefined) {
    pm = pmArg
    process.stdout.write(`${dim('  Package manager:')} ${cyan(pm)}\n`)
  } else {
    process.stdout.write('\n')
    process.stdout.write(`${dim('  Package manager:')}\n`)
    process.stdout.write(`    ${cyan('1)')} bun   ${detected === 'bun' ? dim('(detected)') : ''}\n`)
    process.stdout.write(
      `    ${cyan('2)')} pnpm  ${detected === 'pnpm' ? dim('(detected)') : ''}\n`,
    )
    process.stdout.write(
      `    ${cyan('3)')} yarn  ${detected === 'yarn' ? dim('(detected)') : ''}\n`,
    )
    process.stdout.write(`    ${cyan('4)')} npm   ${detected === 'npm' ? dim('(detected)') : ''}\n`)
    const pmAnswer = await prompt(rl, `  ${dim(`Package manager [${detected}]:`)} `)
    const pmMap: Record<string, PkgManager> = {
      '': detected,
      '1': 'bun',
      bun: 'bun',
      '2': 'pnpm',
      pnpm: 'pnpm',
      '3': 'yarn',
      yarn: 'yarn',
      '4': 'npm',
      npm: 'npm',
    }
    pm = pmMap[pmAnswer.trim().toLowerCase()] ?? detected
  }

  // ── CSS engine (utility classes) ────────────────────────────────────────────
  // Argv flags (`--css engine|none`, `--css-engine`, `--shadow ...`) suppress the
  // corresponding prompt, mirroring how `nameArg` short-circuits the name prompt.
  let css: CssChoice
  const cssArg = cssFromArgv()
  if (cssArg !== undefined) {
    css = cssArg
    process.stdout.write(`${dim('  CSS engine:')} ${cyan(css === 'engine' ? 'yes' : 'no')}\n`)
  } else {
    const cssAnswer = await prompt(
      rl,
      `\n  Include ${bold('@aihu/css-engine')} (utility classes)? ${dim('[y/N]')} `,
    )
    css = cssAnswer.trim().toLowerCase().startsWith('y') ? 'engine' : 'none'
  }

  // Shadow mode only matters when css-engine is on.
  let shadowMode: ShadowChoice = 'shadow'
  if (css === 'engine') {
    const shadowArg = shadowFromArgv()
    if (shadowArg !== undefined) {
      shadowMode = shadowArg
      process.stdout.write(`${dim('  Shadow mode:')} ${cyan(shadowMode)}\n`)
    } else {
      process.stdout.write('\n')
      process.stdout.write(`${dim('  Shadow mode:')}\n`)
      process.stdout.write(
        `    ${cyan('1)')} shadow  ${dim('(default, scoped — utilities fold into the shadow style)')}\n`,
      )
      process.stdout.write(
        `    ${cyan('2)')} light   ${dim('(light DOM — global cascade; style slotted / external children)')}\n`,
      )
      const shadowAnswer = await prompt(rl, `  ${dim('Shadow mode [1]:')} `)
      const shadowMap: Record<string, ShadowChoice> = {
        '': 'shadow',
        '1': 'shadow',
        shadow: 'shadow',
        '2': 'light',
        light: 'light',
      }
      shadowMode = shadowMap[shadowAnswer.trim().toLowerCase()] ?? 'shadow'
    }
  }

  // ── Git init ──────────────────────────────────────────────────────────────
  // `--no-git` skips the prompt entirely (default remains git on).
  let initGit: boolean
  if (hasFlag('no-git')) {
    initGit = false
    process.stdout.write(`${dim('  Git:')} ${cyan('skipped')}\n`)
  } else {
    const gitAnswer = await prompt(rl, `\n  Initialize git repo? ${dim('[Y/n]')} `)
    initGit = !gitAnswer.trim().toLowerCase().startsWith('n')
  }

  rl.close()

  await scaffoldAndReport(projectName, { template, pm, css, shadowMode, initGit })
}

/** Shared scaffold + git + next-steps reporting, used by both the interactive
 * and non-interactive paths. */
async function scaffoldAndReport(
  projectName: string,
  resolved: ResolvedCreateOptions,
): Promise<void> {
  const { template, pm, css, shadowMode, initGit } = resolved
  const targetDir = resolve(process.cwd(), projectName)

  // ── Scaffold ──────────────────────────────────────────────────────────────
  process.stdout.write('\n')
  const cssLabel = css === 'engine' ? ` / css-engine:${shadowMode}` : ''
  process.stdout.write(
    `${dim('  Creating')} ${cyan(projectName)} ${dim(`(${template} / ${pm}${cssLabel})…`)}\n\n`,
  )

  const result = scaffoldApp(projectName, process.cwd(), { pm, template, css, shadowMode })

  for (const f of result.created) process.stdout.write(`  ${green('+')} ${f}\n`)
  for (const f of result.skipped)
    process.stdout.write(`  ${yellow('·')} ${f} ${dim('(skipped)')}\n`)

  // ── Git ───────────────────────────────────────────────────────────────────
  if (initGit) {
    spawnSync('git', ['init', targetDir], { stdio: 'ignore', shell: false })
    spawnSync('git', ['-C', targetDir, 'add', '-A'], { stdio: 'ignore', shell: false })
    spawnSync('git', ['-C', targetDir, 'commit', '-m', 'chore: initial aihu scaffold'], {
      stdio: 'ignore',
      shell: false,
    })
    process.stdout.write(`\n  ${green('✓')} git init\n`)
  }

  // ── Next steps ────────────────────────────────────────────────────────────
  const installCmd: Record<PkgManager, string> = {
    bun: 'bun install',
    pnpm: 'pnpm install',
    npm: 'npm install',
    yarn: 'yarn',
  }
  const devCmd: Record<PkgManager, string> = {
    bun: 'bun run dev',
    pnpm: 'pnpm dev',
    npm: 'npm run dev',
    yarn: 'yarn dev',
  }

  process.stdout.write(`\n  ${green(bold('✓'))} Done!\n\n`)
  process.stdout.write(`  Next steps:\n\n`)
  process.stdout.write(`    ${cyan(`cd ${projectName}`)}\n`)
  process.stdout.write(`    ${cyan(installCmd[pm])}\n`)
  process.stdout.write(`    ${cyan(devCmd[pm])}\n`)
  process.stdout.write('\n')
  process.stdout.write(`  ${dim('Docs:')} https://github.com/fellwork/aihu\n\n`)
}

/** True when this module is the process entry point (the `create-aihu` bin),
 * not when imported (e.g. by the unit tests for `resolveCreateOptions`). Uses
 * an argv[1] vs module-path comparison that works on both node and bun. */
function isCliEntry(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isCliEntry()) {
  main().catch((err: unknown) => {
    process.stderr.write(`\n  ${c.red}error${c.reset} ${String(err)}\n\n`)
    process.exit(1)
  })
}
