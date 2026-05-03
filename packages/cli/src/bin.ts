#!/usr/bin/env node
/**
 * @scribe/cli bin entry — parses argv and dispatches to scaffold functions.
 *
 * Usage:
 *   scribe app <name>            Scaffold a new application
 *   scribe page <route>          Scaffold a page file
 *   scribe component <name>      Scaffold a component file
 *   scribe plugin <name>         Scaffold a plugin package
 */

import { scaffoldApp, scaffoldComponent, scaffoldPage, scaffoldPlugin } from './index.js'

const [, , cmd, arg] = process.argv

function usage(): never {
  process.stderr.write(
    [
      'Usage:',
      '  scribe app <name>         Scaffold a new application',
      '  scribe page <route>       Scaffold a page file (e.g. /about)',
      '  scribe component <name>   Scaffold a component file',
      '  scribe plugin <name>      Scaffold a plugin package',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

if (!cmd || !arg) usage()

let result: { created: ReadonlyArray<string>; skipped: ReadonlyArray<string> }

switch (cmd) {
  case 'app':
    result = scaffoldApp(arg)
    break
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
