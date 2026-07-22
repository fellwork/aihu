#!/usr/bin/env node
/**
 * aihu-tsc — type-check a project containing .aihu SFCs.
 *
 *   aihu-tsc [-p <tsconfig|dir>] [--strict-templates]
 *
 * Exits non-zero when there are type errors, so it drops straight into a
 * `typecheck` script in place of `tsc --noEmit`.
 */
import { run } from '../dist/index.js'

const argv = process.argv.slice(2)
const projectFlag = argv.findIndex((a) => a === '-p' || a === '--project')

process.exit(
  run({
    project: projectFlag >= 0 ? argv[projectFlag + 1] : undefined,
    strictTemplates: argv.includes('--strict-templates'),
  }),
)
