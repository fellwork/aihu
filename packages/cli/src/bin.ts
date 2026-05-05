#!/usr/bin/env node
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
 */

import { scaffoldApp, scaffoldComponent, scaffoldPage, scaffoldPlugin } from './index.js'
import { resolveTemplateName } from './templates-registry.js'

const [, , cmd, ...rest] = process.argv

/**
 * Pull the value of `--template <T>` (or `--template=<T>`) out of an argv
 * tail. Returns `undefined` when the flag is absent, the literal `'true'`
 * when the flag was passed without a value (we still treat that as an
 * "intent" signal and fall through to legacy), or the supplied value.
 */
function extractTemplateFlag(args: ReadonlyArray<string>): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--template') return args[i + 1]
    if (a.startsWith('--template=')) return a.slice('--template='.length)
  }
  return undefined
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
      '',
    ].join('\n'),
  )
  process.exit(1)
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

  // Scaffold commands (synchronous)
  const arg = rest[0]
  if (!arg) usage()

  let result: { created: ReadonlyArray<string>; skipped: ReadonlyArray<string> }
  switch (cmd) {
    case 'app': {
      // B1.1: when --template <T> is passed AND T resolves in the registry,
      // emit a stub message and exit 0. The new pipeline gets wired in B1.2.
      // When --template is absent OR T is not a known template name, fall
      // through to the legacy scaffoldApp() path (preserves R-CT-06).
      const tplFlag = extractTemplateFlag(rest)
      if (tplFlag !== undefined && resolveTemplateName(tplFlag) !== undefined) {
        process.stderr.write('STUB: new pipeline not yet wired in B1.1\n')
        process.exit(0)
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
