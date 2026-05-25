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
 */

import { readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scaffoldApp, scaffoldComponent, scaffoldPage, scaffoldPlugin } from './index.js'
import {
  autoInstallTemplate,
  enumerateFiles,
  mergeOptions,
  printNextSteps,
  type ResolvedOptions,
  readSubstituteWrite,
  realFileSystem,
  realSpawner,
  resolveTemplate,
  runPostInstall,
} from './scaffold-pipeline.js'
import { resolveTemplateName } from './templates-registry.js'

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

function extractTemplateFlag(args: ReadonlyArray<string>): string | undefined {
  return extractFlag(args, 'template')
}

function usage(): never {
  process.stderr.write(
    [
      'Usage:',
      '  aihu app <name>         Scaffold a new application',
      '  aihu page <route>       Scaffold a page file (e.g. /about)',
      '  aihu component <name>   Scaffold a component file',
      '  aihu plugin <name>      Scaffold a plugin package',
      '  aihu dev [options]      Start dev server',
      '  aihu build [options]    Production build',
      '  aihu migrate <files...> Migrate legacy SFC syntax to v1.0+ (--dry-run to preview)',
      '  aihu mcp serve          Start the MCP stdio server',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

/**
 * Recursively enumerate every file under `root`. Returns POSIX-style relpaths
 * (forward slashes), suitable for `enumerateFiles({ templateFiles })`.
 */
function walkTemplateFiles(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const entry of readdirSync(cur)) {
      const abs = join(cur, entry)
      const st = statSync(abs)
      if (st.isDirectory()) {
        stack.push(abs)
      } else if (st.isFile()) {
        const rel = relative(root, abs).replace(/\\/g, '/')
        out.push(rel)
      }
    }
  }
  return out.sort()
}

/**
 * Resolve a template package's on-disk root directory. Tries (in order):
 *   1. Node ESM resolution: `import.meta.resolve(<pkg>)` — the production
 *      path used after `npm install <template-pkg>`.
 *   2. Workspace-relative fallback: walk up from this file looking for a
 *      sibling `packages/templates/<short>/template.config.*` — the dev
 *      path used inside the aihu monorepo before templates packages publish.
 *
 * Returns the directory containing `template.config.{ts,js,mjs}` and a
 * sub-directory `template/`. Throws if neither path resolves.
 */
async function resolveTemplatePackagePath(pkgName: string): Promise<string> {
  // Strategy 1: Node ESM resolution.
  try {
    // import.meta.resolve is sync since Node 20.6+; it returns a URL string.
    // We try to resolve `<pkg>/template.config.ts` first, falling back to
    // `<pkg>/template.config.js` and the package root.
    const candidates = [
      `${pkgName}/template.config.ts`,
      `${pkgName}/template.config.js`,
      `${pkgName}/template.config.mjs`,
      pkgName,
    ]
    for (const c of candidates) {
      try {
        const url = import.meta.resolve(c)
        const fsPath = fileURLToPath(url)
        // Normalize to the package root (parent of template.config.* file).
        if (/template\.config\.(ts|js|mjs)$/.test(fsPath)) {
          return dirname(fsPath)
        }
        return fsPath
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through to workspace fallback
  }

  // Strategy 2: workspace-relative fallback. The CLI source lives at
  // `<repo>/packages/cli/src/bin.ts` (or `dist/bin.js` after build). Walk up
  // until we find `packages/templates/`, then look for the short-name dir.
  const short = pkgName.startsWith('@aihu/templates-')
    ? pkgName.slice('@aihu/templates-'.length)
    : pkgName
  const here = fileURLToPath(import.meta.url)
  let dir = dirname(here)
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'packages', 'templates', short)
    try {
      const st = statSync(candidate)
      if (st.isDirectory()) {
        // Confirm a template.config.* file is present.
        for (const ext of ['ts', 'js', 'mjs']) {
          try {
            statSync(join(candidate, `template.config.${ext}`))
            return candidate
          } catch {
            // try next ext
          }
        }
      }
    } catch {
      // not here; walk up
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  throw new Error(
    `Could not resolve template package ${JSON.stringify(pkgName)}: ` +
      'not installed via npm and not found in workspace fallback. ' +
      `Run 'npm install ${pkgName}' first, or invoke the CLI from inside the aihu monorepo.`,
  )
}

/**
 * Load a template package's manifest. Reads the package directory listing
 * to find any `template.config.{ts,js,mjs,cjs}` file (more robust than
 * stat'ing fixed filenames — handles bunx temp-dir layouts where stat can
 * misbehave). Then dynamic-imports it; expects either a default export or
 * a named export `config` shaped per TemplateManifest.
 */
async function loadTemplateConfig(pkgRoot: string): Promise<unknown> {
  let entries: string[]
  try {
    entries = readdirSync(pkgRoot)
  } catch (e) {
    throw new Error(`Could not read template package root ${pkgRoot}: ${(e as Error).message}`)
  }
  // Prefer .ts (Bun-native), fall through to compiled forms.
  const ordered = ['.ts', '.js', '.mjs', '.cjs']
  let lastImportError: Error | undefined
  for (const ext of ordered) {
    const match = entries.find((f) => f === `template.config${ext}`)
    if (!match) continue
    const candidate = join(pkgRoot, match)
    try {
      // Use file:// URL so dynamic import works on Windows.
      const mod = (await import(`file://${candidate.replace(/\\/g, '/')}`)) as Record<
        string,
        unknown
      >
      return mod.default ?? mod.config ?? mod
    } catch (e) {
      // import failed — record and try next extension (e.g. .ts fails under
      // Node.js, fall through to compiled .js)
      lastImportError = e as Error
    }
  }
  const importHint = lastImportError ? ` Last import error: ${lastImportError.message}` : ''
  throw new Error(
    `No template.config.{ts,js,mjs,cjs} found under ${pkgRoot}. ` +
      `Directory contains: ${entries.slice(0, 20).join(', ')}${entries.length > 20 ? ', …' : ''}.${importHint}`,
  )
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
  const noGit = hasFlag(rest, 'no-git')
  const noInstall = hasFlag(rest, 'no-install')
  const noAutoInstall = hasFlag(rest, 'no-auto-install-template')
  const pmFlag = extractFlag(rest, 'pm')
  const pm: ResolvedOptions['pm'] =
    pmFlag === 'pnpm' || pmFlag === 'npm' || pmFlag === 'yarn' || pmFlag === 'bun' ? pmFlag : 'bun'
  const userOverrides = parseOptionsJson(extractFlag(rest, 'options-json'))
  // --use-defaults / --no-interactive: in B1.3 we don't yet drive interactive
  // prompts from bin.ts. Both flags currently mean "use manifest defaults
  // for unspecified overridable cells" — which mergeOptions() already does
  // when a key is absent from userOverrides. Reserved for B2+ wiring.
  const _useDefaults = hasFlag(rest, 'use-defaults')
  const _noInteractive = hasFlag(rest, 'no-interactive')
  void _useDefaults
  void _noInteractive

  // --- 1. resolveTemplate (with auto-install on first-resolve failure) ---
  let pkgRoot: string
  try {
    pkgRoot = await resolveTemplatePackagePath(templatePkg)
  } catch (firstErr) {
    // Auto-install is disabled — surface the original error immediately.
    if (noAutoInstall) throw firstErr

    // Attempt to auto-install the template package, then retry resolution.
    const installResult = autoInstallTemplate({ pkgName: templatePkg, pm })
    if (!installResult.success) {
      throw new Error(
        `Failed to install template package; please install manually: ` +
          `${installResult.pm} add ${templatePkg}\n` +
          (installResult.stderr.trim() ? `Install stderr: ${installResult.stderr.trim()}` : ''),
      )
    }

    // Retry resolution after successful install.
    try {
      pkgRoot = await resolveTemplatePackagePath(templatePkg)
    } catch (retryErr) {
      throw new Error(
        `Failed to install template package; please install manually: ` +
          `${installResult.pm} add ${templatePkg}\n` +
          `Resolution after install failed: ${(retryErr as Error).message}`,
      )
    }
  }

  const manifest = await resolveTemplate({
    loader: () => loadTemplateConfig(pkgRoot),
  })

  // --- 2. mergeOptions ---
  const options = mergeOptions(manifest, {
    appName,
    pm,
    noGit,
    userOverrides,
  })

  // --- 3. enumerateFiles ---
  const templateRoot = join(pkgRoot, 'template')
  const templateFiles = walkTemplateFiles(templateRoot)
  const files = enumerateFiles(manifest, options, { templateFiles })

  // --- 4. readSubstituteWrite ---
  const targetDir = resolve(process.cwd(), appName)
  const written = readSubstituteWrite(files, {
    templateRoot: posix.normalize(templateRoot.replace(/\\/g, '/')),
    targetDir,
    manifest,
    options,
    fs: realFileSystem,
  })

  // --- 5. runPostInstall ---
  // When --no-install is set, filter out pm-install + lint-fix (lint-fix
  // requires the toolchain installed). git-init still honors --no-git via
  // mergeOptions/runPostInstall's existing skip path. This keeps the
  // pipeline contract intact while letting the harness drive scaffolding
  // without depending on the npm registry state of unpublished peer deps.
  const filteredManifest = noInstall
    ? {
        ...manifest,
        postInstall: manifest.postInstall.filter(
          (s) => s.kind !== 'pm-install' && s.kind !== 'lint-fix',
        ),
      }
    : manifest
  const postResult = runPostInstall({
    manifest: filteredManifest,
    options,
    targetDir,
    spawner: realSpawner,
  })

  // --- output summary ---
  for (const f of written.written) {
    process.stdout.write(`  created  ${f}\n`)
  }
  for (const f of written.skipped) {
    process.stdout.write(`  skipped  ${f} (already exists)\n`)
  }
  for (const step of postResult.ran) {
    process.stdout.write(`  ran      ${step.kind}\n`)
  }
  for (const step of postResult.skipped) {
    process.stdout.write(`  skipped  ${step.kind}\n`)
  }
  if (postResult.failures.length > 0) {
    for (const f of postResult.failures) {
      process.stderr.write(`  FAILED   ${f.step.kind}: ${f.error}\n`)
    }
    process.exit(1)
  }

  // --- 6. printNextSteps ---
  printNextSteps({ options, targetDir })
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
    const files = rest.filter((a) => !a.startsWith('--'))
    if (files.length === 0) {
      process.stderr.write(
        [
          'Usage:',
          '  aihu migrate <files...>   Migrate legacy SFC syntax to v1.0+ canonical forms',
          '  aihu migrate --dry-run <files...>   Preview changes without writing',
          '',
        ].join('\n'),
      )
      process.exit(1)
    }
    migrateFiles(files, dryRun, process.cwd())
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
      const resolved = tplFlag !== undefined ? resolveTemplateName(tplFlag) : undefined
      if (resolved !== undefined) {
        await dispatchTemplate({ appName: arg, templatePkg: resolved, rest })
        return
      }
      result = scaffoldApp(arg)
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
