#!/usr/bin/env node
/**
 * aihu-tsc — type-check a project containing .aihu SFCs.
 *
 *   aihu-tsc [-p <tsconfig|dir>] [--strict-templates] [--target <client|server|universal>]
 *
 * Exits non-zero when there are type errors, so it drops straight into a
 * `typecheck` script in place of `tsc --noEmit`.
 *
 * `--strict-templates`/`--target` are OR'd with (never override-to-off) the
 * project's own `vite.config.ts` (`AihuConfig.typecheck.strictTemplates` /
 * `AihuConfig.compiler.target`) — invoked bare (`"typecheck": "aihu-tsc"` is
 * the scaffolded default, no flags at all), this is the only chance to see
 * that config: `run()` has no other caller threading it in. See
 * `loadTscProjectConfig`'s doc comment for why this exists.
 */
import { loadTscProjectConfig, run } from '../dist/index.js'

const argv = process.argv.slice(2)
const projectFlag = argv.findIndex((a) => a === '-p' || a === '--project')
const targetFlag = argv.indexOf('--target')
const cliTarget = targetFlag >= 0 ? argv[targetFlag + 1] : undefined

const fromConfig = await loadTscProjectConfig(process.cwd())

process.exit(
  run({
    project: projectFlag >= 0 ? argv[projectFlag + 1] : undefined,
    strictTemplates: argv.includes('--strict-templates') || (fromConfig.strictTemplates ?? false),
    target: cliTarget ?? fromConfig.target,
  }),
)
