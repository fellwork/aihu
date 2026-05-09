#!/usr/bin/env bun
/**
 * E2E harness against the PUBLISHED @aihu/cli on npm.
 *
 * Differs from scaffold-default-e2e.ts (which calls scaffoldApp() locally):
 * this drives the actual `bunx @aihu/cli@<version>` flow that real users hit,
 * so it catches issues in the published bin (shebang, dist contents, etc.)
 * that the local-source harness can miss.
 *
 * Usage:
 *   bun packages/cli/tests/scaffold-npm-e2e.ts            # uses @latest
 *   bun packages/cli/tests/scaffold-npm-e2e.ts 0.3.5      # specific version
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cliVersion = process.argv[2] ?? 'latest'
const cliSpec = `@aihu/cli@${cliVersion}`
const appName = 'smoke-test'

const parentDir = mkdtempSync(join(tmpdir(), 'aihu-npm-e2e-'))
let exit = 0

function step(name: string, fn: () => void): void {
  process.stdout.write(`▶  ${name}\n`)
  try {
    fn()
    process.stdout.write(`✓  ${name}\n`)
  } catch (err) {
    process.stdout.write(`✘  ${name}: ${(err as Error).message}\n`)
    exit = 1
    throw err
  }
}

function run(label: string, cmd: string, args: string[], cwd: string): string {
  const res = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', shell: true })
  if (res.status !== 0) {
    throw new Error(
      `${label} exited ${res.status}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
    )
  }
  return `${res.stdout}\n${res.stderr}`
}

try {
  process.stdout.write(`\nRunning npm e2e against ${cliSpec}\n`)
  process.stdout.write(`Tmp dir: ${parentDir}\n\n`)

  const projectDir = join(parentDir, appName)

  step(`bunx ${cliSpec} app ${appName}`, () => {
    run('bunx scaffold', 'bunx', [cliSpec, 'app', appName], parentDir)
    if (!existsSync(projectDir)) throw new Error('project directory not created')
  })

  step('emitted package.json sanity', () => {
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    for (const [dep, range] of Object.entries(all)) {
      if (dep.startsWith('@aihu/') && range === '^1.0.0') {
        throw new Error(`${dep} pinned to ^1.0.0 (no 1.x exists)`)
      }
    }
    if (pkg.packageManager && !/^bun@\d+\.\d+\.\d+/.test(pkg.packageManager)) {
      throw new Error(`packageManager malformed: ${pkg.packageManager}`)
    }
    if (!existsSync(join(projectDir, '.vscode/extensions.json'))) {
      throw new Error('.vscode/extensions.json not emitted')
    }
  })

  step('bun install', () => run('install', 'bun', ['install'], projectDir))
  step('bun run typecheck', () => run('typecheck', 'bun', ['run', 'typecheck'], projectDir))
  step('bun run build', () => run('build', 'bun', ['run', 'build'], projectDir))

  step('dist/ exists with output', () => {
    const dist = join(projectDir, 'dist')
    if (!existsSync(dist)) throw new Error('dist/ missing')
  })

  process.stdout.write(`\nPASS — ${cliSpec} produces a project that installs and builds.\n`)
} catch (err) {
  process.stdout.write(`\nFAIL — ${(err as Error).message}\n`)
  exit = 1
} finally {
  rmSync(parentDir, { recursive: true, force: true })
  process.exit(exit)
}
