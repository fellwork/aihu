/**
 * @aihu/cli bin entry — parses argv and dispatches to commands.
 *
 * Usage:
 *   aihu app <name>            Scaffold a new application
 *   aihu page <route>          Scaffold a page file
 *   aihu component <name>      Scaffold a component file
 *   aihu plugin <name>         Scaffold a plugin package
 *   aihu dev [options]         Start development server (arch-4 §3)
 *   aihu build [options]       Production build (arch-4 §3)
 *   aihu migrate <files...>    Migrate legacy SFC syntax to v1.0+ canonical forms
 *   aihu add <names...>        Copy styled recipes from @aihu/ui (css-5 §9.6)
 *   aihu list [--installed]    List registry recipes (css-5 §9.6)
 */

import type { CssChoice, PkgManager, ShadowChoice } from './index.js'
import { scaffoldApp, scaffoldComponent, scaffoldPage, scaffoldPlugin } from './index.js'
import {
  printNextSteps,
  type ResolvedOptions,
  scaffoldFromTemplatePackage,
} from './scaffold-pipeline.js'
import { formatTemplateCatalog, selectTemplate } from './templates-registry.js'

const [, , cmd, ...rest] = process.argv

/**
 * Pull the value of `--<flag> <V>` (or `--<flag>=<V>`) out of an argv tail.
 * Returns `undefined` when the flag is absent.
 */
function extractFlag(args: ReadonlyArray<string>, flag: string): string | undefined {
  const long = `--${flag}`
  const longEq = `${long}=`
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === long) return args[i + 1]
    if (a.startsWith(longEq)) return a.slice(longEq.length)
  }
  return undefined
}

/** True when `--<flag>` (boolean) appears in argv. */
function hasFlag(args: ReadonlyArray<string>, flag: string): boolean {
  return args.includes(`--${flag}`)
}

/**
 * `--pm <bun|pnpm|npm|yarn>`, defaulting to bun.
 *
 * Shared by both scaffold paths because the built-in one used to parse it
 * nowhere at all: `aihu app x --pm pnpm` dropped the flag on the floor and
 * scaffolded with the `pm` default, so the emitted package.json carried
 * `"packageManager": "bun@…"` and `pnpm install` refused to run before
 * resolving a single dependency — `ERROR: This project is configured to use
 * bun`. The interactive `create-aihu` path always threaded it correctly, which
 * is why the hole survived: the two entry points disagreed about the same flag.
 */
function resolvePmFlag(args: ReadonlyArray<string>): PkgManager {
  const flag = extractFlag(args, 'pm')
  return flag === 'pnpm' || flag === 'npm' || flag === 'yarn' || flag === 'bun' ? flag : 'bun'
}

function extractTemplateFlag(args: ReadonlyArray<string>): string | undefined {
  return extractFlag(args, 'template')
}

/**
 * Parse the OOTB css-engine flags for the legacy `aihu app` scaffold path.
 *
 *   --css <engine|none>     include @aihu/css-engine OOTB (default: none)
 *   --css-engine            boolean alias for `--css engine`
 *   --shadow <light|shadow>       explicit shadow mode when css-engine is on
 *
 * `shadowMode` is `undefined` unless the user explicitly chose one — the
 * scaffold then emits no plugin-global `css: { shadowMode }` block and the
 * DA4 framework defaults apply (pages/layouts light, leaves shadow). A
 * fabricated default written into vite.config.ts would silently pin the
 * framework default at scaffold time (FEL-425).
 *
 * `--shadow` is only meaningful with css-engine; passed without it, we warn and
 * ignore so the semantics stay clear. Invalid values are ignored (framework
 * defaults) with a stderr note rather than aborting the scaffold.
 */
function parseCssOptions(args: ReadonlyArray<string>): {
  css: CssChoice
  shadowMode: ShadowChoice | undefined
} {
  const cssRaw = extractFlag(args, 'css')
  const cssEngineAlias = hasFlag(args, 'css-engine')
  let css: CssChoice = 'none'
  if (cssEngineAlias || cssRaw === 'engine') {
    css = 'engine'
  } else if (cssRaw !== undefined && cssRaw !== 'none') {
    process.stderr.write(`  ! Unknown --css value '${cssRaw}'; using 'none'.\n`)
  }

  const shadowRaw = extractFlag(args, 'shadow')
  let shadowMode: ShadowChoice | undefined
  if (shadowRaw === 'light' || shadowRaw === 'shadow') {
    shadowMode = shadowRaw
  } else if (shadowRaw !== undefined) {
    process.stderr.write(
      `  ! Unknown --shadow value '${shadowRaw}'; ignoring (framework defaults apply).\n`,
    )
  }

  if (css !== 'engine' && shadowRaw !== undefined) {
    process.stderr.write('  ! --shadow has no effect without --css engine; ignoring.\n')
    shadowMode = undefined
  }

  return { css, shadowMode }
}

function usage(): never {
  process.stderr.write(
    [
      'Usage:',
      '  aihu app <name> [--template=<id>]  Scaffold a new application (default: client-only SPA; e.g. --template=cf-team for the Cloudflare stack)',
      '      [--css engine|none]            Include @aihu/css-engine OOTB (utility classes); default none',
      '      [--shadow light|shadow]        Force one shadow mode project-wide when --css engine is set; default: framework defaults (light-DOM pages/layouts, shadow-DOM leaves)',
      '  aihu page <route>       Scaffold a page file (e.g. /about)',
      '  aihu component <name>   Scaffold a component file',
      '  aihu plugin <name>      Scaffold a plugin package',
      '  aihu dev [options]      Start dev server',
      '  aihu build [options]    Production build',
      '  aihu migrate <files...> Migrate legacy SFC syntax to v1.0+ (--v2: also v1→v2 macros; --dry-run to preview)',
      '  aihu add <names...>     Copy styled recipes from @aihu/ui into ui.target',
      '      [--prefix p]            Override the custom-element tag prefix',
      '      [--dry-run]             Print the plan; write nothing',
      '      [--diff]                Show a diff against existing target files',
      '      [--force]               Overwrite on collision',
      '  aihu list [--installed] List registry recipes (--installed: only copied ones)',
      '  aihu mcp serve          Start the MCP stdio server',
      '',
      'Templates for `aihu app --template <id>`:',
      formatTemplateCatalog('  '),
    ].join('\n'),
  )
  process.exit(1)
}

/**
 * Parse `--options-json '<JSON>'` into a record of override values. Returns
 * `{}` when the flag is absent. Throws on invalid JSON.
 */
function parseOptionsJson(raw: string | undefined): Record<string, string | boolean> {
  if (raw === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`--options-json: invalid JSON: ${(err as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--options-json: must be a JSON object')
  }
  const out: Record<string, string | boolean> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string' && typeof v !== 'boolean') {
      throw new Error(`--options-json.${k}: value must be string or boolean`)
    }
    out[k] = v
  }
  return out
}

/**
 * Pipeline dispatcher for `aihu app <name> --template <T>`. Replaces the
 * B1.1 stub: drives the 6 pure pipeline functions through the
 * realFileSystem + realSpawner injection seam.
 *
 * Backward-compat flags honored:
 *   --no-interactive    (interactive prompts not yet implemented; default)
 *   --use-defaults      (skip prompts; emit manifest defaults)
 *   --options-json <S>  (overrides for the manifest's `overridable` cells)
 *   --no-git                     (skip git-init post-install step)
 *   --no-install                 (skip pm-install + lint-fix post-install steps;
 *                                 useful for harness tests + offline scaffolding)
 *   --pm <bun|pnpm|...>         (package manager for pm-install + emitted scripts)
 *   --no-auto-install-template  (skip auto-install when template package is missing;
 *                                 surface the original error immediately)
 */
async function dispatchTemplate(args: {
  appName: string
  templatePkg: string
  rest: ReadonlyArray<string>
}): Promise<void> {
  const { appName, templatePkg, rest } = args

  // --- flag parsing ---
  const pm: ResolvedOptions['pm'] = resolvePmFlag(rest)
  // --use-defaults / --no-interactive: in B1.3 we don't yet drive interactive
  // prompts from bin.ts. Both flags currently mean "use manifest defaults
  // for unspecified overridable cells" — which mergeOptions() already does
  // when a key is absent from userOverrides. Reserved for B2+ wiring.
  const _useDefaults = hasFlag(rest, 'use-defaults')
  const _noInteractive = hasFlag(rest, 'no-interactive')
  void _useDefaults
  void _noInteractive

  // The 6-stage pipeline itself lives in scaffold-pipeline.ts so that
  // `create-aihu` drives the identical implementation (FEL-422).
  const result = await scaffoldFromTemplatePackage({
    appName,
    templatePkg,
    pm,
    noGit: hasFlag(rest, 'no-git'),
    noInstall: hasFlag(rest, 'no-install'),
    noAutoInstall: hasFlag(rest, 'no-auto-install-template'),
    userOverrides: parseOptionsJson(extractFlag(rest, 'options-json')),
  })

  // --- output summary ---
  for (const f of result.written) {
    process.stdout.write(`  created  ${f}\n`)
  }
  for (const f of result.skipped) {
    process.stdout.write(`  skipped  ${f} (already exists)\n`)
  }
  for (const step of result.post.ran) {
    process.stdout.write(`  ran      ${step.kind}\n`)
  }
  for (const step of result.post.skipped) {
    process.stdout.write(`  skipped  ${step.kind}\n`)
  }
  if (result.post.failures.length > 0) {
    for (const f of result.post.failures) {
      process.stderr.write(`  FAILED   ${f.step.kind}: ${f.error}\n`)
    }
    process.exit(1)
  }

  // --- 6. printNextSteps ---
  printNextSteps({ options: result.options, targetDir: result.targetDir })
}

async function main(): Promise<void> {
  if (!cmd) usage()

  // Async commands (dynamic-imported)
  if (cmd === 'dev') {
    const { default: dev } = await import('./commands/dev.js')
    await dev(rest)
    return
  }
  if (cmd === 'build') {
    const { default: build } = await import('./commands/build.js')
    await build(rest)
    return
  }
  if (cmd === 'migrate') {
    // Bug 9c — wire the existing migrate command into the dispatcher so the
    // `Run: npx aihu migrate <file>` guidance emitted by C304/C305/C306 is
    // actually reachable. `migrate.ts` is a complete, tested implementation;
    // here we only parse argv and call its file-driving entry.
    const { migrateFiles } = await import('./commands/migrate.js')
    const dryRun = hasFlag(rest, 'dry-run')
    // #425 — `--v2` chains the v1→v2 macro-simplification pass after the
    // v0→v1 passes, giving external devs a CLI path to the v2 vocabulary.
    const v2 = hasFlag(rest, 'v2')
    // #487 — `--state` runs the @state wrapper-model codemod (spec §7):
    // `$`-macros → wrappers, signal tuples → `state()` incl. call sites.
    const state = hasFlag(rest, 'state')
    const files = rest.filter((a) => !a.startsWith('--'))
    if (files.length === 0) {
      process.stderr.write(
        [
          'Usage:',
          '  aihu migrate <files...>   Migrate legacy SFC syntax to v1.0+ canonical forms',
          '  aihu migrate --v2 <files...>   Also migrate v1 macro forms to the v2 vocabulary',
          '  aihu migrate --state <files...>   Migrate @state to the wrapper model (#487)',
          '  aihu migrate --dry-run <files...>   Preview changes without writing',
          '',
        ].join('\n'),
      )
      process.exit(1)
    }
    migrateFiles(files, dryRun, process.cwd(), v2, state)
    return
  }
  if (cmd === 'add') {
    const { default: add } = await import('./commands/add.js')
    await add(rest)
    return
  }
  if (cmd === 'list') {
    const { default: list } = await import('./commands/list.js')
    await list(rest)
    return
  }
  if (cmd === 'mcp') {
    const subCmd = rest[0]
    if (subCmd === 'serve') {
      const { default: mcpServe } = await import('./commands/mcp-serve.js')
      await mcpServe(rest.slice(1))
      return
    }
    process.stderr.write(
      ['Usage:', '  aihu mcp serve    Start the MCP stdio server', ''].join('\n'),
    )
    process.exit(1)
  }

  // Scaffold commands (synchronous)
  const arg = rest[0]
  if (!arg) usage()

  let result: { created: ReadonlyArray<string>; skipped: ReadonlyArray<string> }
  switch (cmd) {
    case 'app': {
      // B1.3: when --template <T> resolves in the registry, drive the real
      // 6-stage scaffold pipeline (resolveTemplate → mergeOptions →
      // enumerateFiles → readSubstituteWrite → runPostInstall →
      // printNextSteps). When --template is absent OR T is not a known
      // template name, fall through to the legacy scaffoldApp() path
      // (preserves R-CT-06 backward compatibility).
      const tplFlag = extractTemplateFlag(rest)
      const selection = tplFlag !== undefined ? selectTemplate(tplFlag) : undefined
      if (selection?.kind === 'package') {
        await dispatchTemplate({ appName: arg, templatePkg: selection.pkg, rest })
        return
      }
      if (selection?.kind === 'unpublished') {
        // Previously this fell through to auto-install and died on an npm 404.
        // Say so up front instead.
        process.stderr.write(
          `\nERROR: template '${selection.id}' is declared in the aihu registry but is ` +
            `not published to npm yet, so it cannot be scaffolded.\n\n` +
            `Available templates:\n${formatTemplateCatalog('  ')}\n`,
        )
        process.exit(1)
      }
      // Legacy scaffold path — honor the OOTB css-engine flags. With no
      // css flags this stays byte-identical to the historical output
      // (css defaults to 'none', shadow to unset/framework defaults); the
      // legacy-snapshot golden gates that.
      const { css, shadowMode } = parseCssOptions(rest)
      result = scaffoldApp(arg, undefined, {
        pm: resolvePmFlag(rest),
        css,
        shadowMode,
        // A built-in `--template` value now actually selects that built-in;
        // it used to be swallowed here and silently produce `minimal`.
        ...(selection?.kind === 'builtin' ? { template: selection.id } : {}),
      })
      break
    }
    case 'page':
      result = scaffoldPage(arg)
      break
    case 'component':
      result = scaffoldComponent(arg)
      break
    case 'plugin':
      result = scaffoldPlugin(arg)
      break
    default:
      usage()
  }

  for (const f of result.created) {
    process.stdout.write(`  created  ${f}\n`)
  }
  for (const f of result.skipped) {
    process.stdout.write(`  skipped  ${f} (already exists)\n`)
  }

  if (result.created.length > 0) {
    process.stdout.write(`\nDone. ${result.created.length} file(s) created.\n`)
  } else {
    process.stdout.write('\nNothing to do — all files already exist.\n')
  }
}

main().catch((err: Error) => {
  process.stderr.write(`\nERROR: ${err.message}\n`)
  process.exit(1)
})
