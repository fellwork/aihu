/**
 * `create-aihu`'s process surface, driven as a real process with a non-TTY stdin.
 *
 * ## Why non-TTY specifically
 *
 * `isNonInteractive()` returns true when stdin is not a TTY, which is how every
 * scripted invocation and every CI job reaches this bin. That is also the path
 * on which the two defects below were destructive rather than merely wrong:
 * with no prompt to stop at, an unhandled flag falls straight through to
 * "scaffold with the documented defaults".
 *
 * ## What was wrong
 *
 * `create-aihu --version` handled `--help`/`-h` and nothing else, so `--version`
 * became "no project name given" and the wizard CREATED `my-aihu-app/` and
 * exited 0. A companion commit had added real `--version` to `bin.ts` and never
 * to `create.ts` — and `create-aihu` is the only bin npm users can actually
 * reach (this package's bins are `aihu` and `create-aihu`; `npx @aihu/cli app`
 * cannot work, as create.ts's own docblock explains). So the advertised flag was
 * unreachable where it mattered, and its invocation had a side effect.
 *
 * `--pm garbage` and a dangling `--pm` resolved to `undefined` — indistinguishable
 * from "the user did not pass --pm" — and the detected package manager got
 * pinned into `packageManager`. corepack enforces that field, so the `<pm>
 * install` the wizard prints as the next step refuses to run.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLI_VERSION } from '../src/cli-version.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const CREATE_BIN = resolve(HERE, '..', 'src', 'create.ts')

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'aihu-create-surface-'))
})

afterEach(() => {
  if (cwd !== '') rmSync(cwd, { recursive: true, force: true })
})

/** Runs the bin with stdin closed, i.e. the non-interactive path. */
function run(...args: string[]) {
  const r = spawnSync('bun', [CREATE_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    input: '',
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

describe('--version', () => {
  it('prints the version and creates NOTHING', () => {
    const r = run('--version')
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(CLI_VERSION)
    // The defect: this directory listing used to contain `my-aihu-app`.
    expect(readdirSync(cwd)).toEqual([])
  })

  it('-v behaves the same', () => {
    const r = run('-v')
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(CLI_VERSION)
    expect(readdirSync(cwd)).toEqual([])
  })

  it('reports the same version as `aihu --version`', () => {
    // Both read the build-time literal from this package's package.json, so
    // the two bins in one package cannot disagree about what they are.
    const binPath = resolve(HERE, '..', 'src', 'bin.ts')
    const bin = spawnSync('bun', [binPath, '--version'], { cwd, encoding: 'utf8' })
    expect(run('--version').stdout.trim()).toBe((bin.stdout ?? '').trim())
  })

  it('is not swallowed by a project name that precedes it', () => {
    const r = run('demo', '--version')
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(CLI_VERSION)
    expect(readdirSync(cwd)).toEqual([])
  })
})

describe('--help still works and still creates nothing', () => {
  it('prints usage, exits 0, writes no files', () => {
    const r = run('--help')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Usage:')
    expect(readdirSync(cwd)).toEqual([])
  })

  it('advertises --version, now that there is one', () => {
    expect(run('--help').stdout).toContain('--version')
  })
})

describe('--pm triage', () => {
  it('rejects an unknown value instead of pinning the detected pm', () => {
    const r = run('demo', '--pm', 'garbage', '--yes', '--no-git')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('unknown --pm value')
    expect(r.stderr).toContain('garbage')
    expect(r.stderr).toContain('bun | pnpm | npm | yarn')
    expect(readdirSync(cwd)).toEqual([])
  })

  it('rejects a dangling --pm', () => {
    const r = run('demo', '--pm', '--yes', '--no-git')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--pm needs a value')
    expect(readdirSync(cwd)).toEqual([])
  })

  it('does not print the TEMPLATE catalogue for a package-manager error', () => {
    // `--pm` errors route through `failUsage`, not `failWithCatalog`: listing
    // the templates in answer to a bad `--pm` is noise pointed the wrong way.
    const r = run('demo', '--pm', 'garbage', '--yes')
    expect(r.stderr).not.toContain('Available templates')
    expect(r.stderr).toContain('--help')
  })

  it('still accepts every valid value', () => {
    for (const pm of ['bun', 'pnpm', 'npm', 'yarn']) {
      const r = run(`demo-${pm}`, '--pm', pm, '--yes', '--no-git')
      expect(r.status, pm).toBe(0)
    }
  })
})

describe('project-name triage', () => {
  it('refuses to scaffold outside the current directory', () => {
    const r = run('../../ESCAPED', '--yes', '--no-git')
    expect(r.status).toBe(1)
    expect(readdirSync(cwd)).toEqual([])
  })
})
