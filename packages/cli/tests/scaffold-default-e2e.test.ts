/**
 * E2E test for the default `aihu app <name>` scaffold (no --template flag).
 *
 * Calls scaffoldApp() against a tmp dir, then shells out to the real package
 * manager + rolldown to verify the emitted project actually installs and
 * builds. Network-dependent: runs `bun install` against npm.
 *
 * Gated behind AIHU_SCAFFOLD_E2E=1 so it doesn't slow the default `bun test`
 * loop. CI runs it explicitly when validating cli releases.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffoldApp } from '../src/index.ts'

const RUN_E2E = process.env.AIHU_SCAFFOLD_E2E === '1'

describe.skipIf(!RUN_E2E)('default scaffold e2e', () => {
  let parentDir: string

  beforeEach(() => {
    parentDir = mkdtempSync(join(tmpdir(), 'aihu-default-e2e-'))
  })

  afterEach(() => {
    if (parentDir) rmSync(parentDir, { recursive: true, force: true })
  })

  it('emits a buildable project: install + typecheck + build all succeed', () => {
    const result = scaffoldApp('my-app', parentDir)

    // Sanity: every expected file landed (this also documents the contract).
    const want = [
      'package.json',
      'rolldown.config.ts',
      'tsconfig.json',
      'index.html',
      'src/main.ts',
      'src/pages/index.aihu',
      '.vscode/extensions.json',
      '.vscode/settings.json',
    ]
    for (const f of want) {
      expect(result.created).toContain(f)
    }

    const projectDir = join(parentDir, 'my-app')

    // package.json sanity: no aspirational `^1.0.0` for @aihu/* + no `bun@1`.
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
    for (const [dep, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (typeof dep === 'string' && dep.startsWith('@aihu/')) {
        expect(range, `${dep} should not be ^1.0.0 (no such version published)`).not.toBe('^1.0.0')
      }
    }
    if (pkg.packageManager) {
      expect(pkg.packageManager, 'packageManager must include a real version').toMatch(
        /^bun@\d+\.\d+\.\d+/,
      )
    }

    // Real install against npm.
    const installRes = spawnSync('bun', ['install'], {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    expect(installRes.status, `bun install failed:\n${installRes.stderr}`).toBe(0)

    // Typecheck.
    const tcRes = spawnSync('bun', ['run', 'typecheck'], {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    expect(tcRes.status, `typecheck failed:\n${tcRes.stderr}\n${tcRes.stdout}`).toBe(0)

    // Build.
    const buildRes = spawnSync('bun', ['run', 'build'], {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    expect(buildRes.status, `build failed:\n${buildRes.stderr}\n${buildRes.stdout}`).toBe(0)

    // Build output sanity: dist/ should exist with at least one .js.
    expect(existsSync(join(projectDir, 'dist'))).toBe(true)
  }, 180_000)
})
