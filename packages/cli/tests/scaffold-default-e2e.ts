#!/usr/bin/env bun
/**
 * Standalone e2e harness for the default `aihu app` scaffold.
 *
 * Bypasses vitest while we iterate on the scaffold contents. Once the scaffold
 * is stable, the assertions move into scaffold-default-e2e.test.ts.
 *
 * Usage: bun packages/cli/tests/scaffold-default-e2e.ts
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldApp } from '../src/index.ts'

const parentDir = mkdtempSync(join(tmpdir(), 'aihu-default-e2e-'))
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

function run(label: string, cmd: string, args: string[], cwd: string): void {
  const res = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', shell: true })
  if (res.status !== 0) {
    throw new Error(
      `${label} exited ${res.status}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
    )
  }
}

try {
  let projectDir = ''

  step('scaffold', () => {
    const result = scaffoldApp('my-app', parentDir)
    projectDir = join(parentDir, 'my-app')
    const want = [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'src/pages/index.aihu',
      '.vscode/extensions.json',
      '.vscode/settings.json',
    ]
    for (const f of want) {
      if (!result.created.includes(f)) throw new Error(`expected file not emitted: ${f}`)
    }
    // src/main.ts is deliberately NOT scaffolded — viteAihuPlugin's
    // aihu-entry sub-plugin injects a virtual equivalent.
    if (result.created.includes('src/main.ts')) {
      throw new Error('src/main.ts should not be scaffolded (virtual entry covers it)')
    }
  })

  step('package.json sanity', () => {
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    for (const [dep, range] of Object.entries(all)) {
      if (dep.startsWith('@aihu/') && range === '^1.0.0') {
        throw new Error(`${dep} pinned to ^1.0.0 but no 1.x exists on npm`)
      }
    }
    if (pkg.packageManager && !/^bun@\d+\.\d+\.\d+/.test(pkg.packageManager)) {
      throw new Error(`packageManager malformed: ${pkg.packageManager}`)
    }
  })

  step('bun install', () => run('install', 'bun', ['install'], projectDir))
  step('bun run typecheck', () => run('typecheck', 'bun', ['run', 'typecheck'], projectDir))
  step('bun run build', () => run('build', 'bun', ['run', 'build'], projectDir))

  step('dist/ exists', () => {
    if (!existsSync(join(projectDir, 'dist'))) throw new Error('dist/ missing after build')
  })

  process.stdout.write('\nPASS — scaffold installs and builds.\n')
} catch (err) {
  process.stdout.write(`\nFAIL — ${(err as Error).message}\n`)
  exit = 1
} finally {
  rmSync(parentDir, { recursive: true, force: true })
  process.exit(exit)
}
