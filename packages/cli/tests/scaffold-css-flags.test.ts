/**
 * scaffold-css-flags — end-to-end flag parsing for the OOTB css-engine option
 * on the legacy `aihu app` bin path.
 *
 * Drives the real `bin.ts` via `bun` (mirrors legacy-snapshot.test.ts) and
 * inspects the emitted tree, since the flag parser runs inside the bin's
 * top-level `main()`. Covers:
 *   --css engine            → css-engine dep + utility starter + no css block
 *   --css-engine (alias)    → same as --css engine
 *   --shadow light|shadow   → explicit css block (binary vocabulary, DA4)
 *   --shadow without --css  → warned + ignored (plain output)
 *   no flags                → plain output (byte-stable path)
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_BIN = resolve(HERE, '..', 'src', 'bin.ts')

let parentDir: string
beforeEach(() => {
  parentDir = mkdtempSync(join(tmpdir(), 'aihu-css-flags-'))
})
afterEach(() => {
  if (parentDir) rmSync(parentDir, { recursive: true, force: true })
})

function run(args: ReadonlyArray<string>): { status: number | null; stderr: string } {
  const r = spawnSync('bun', [CLI_BIN, 'app', ...args], {
    cwd: parentDir,
    encoding: 'utf8',
    env: process.env,
  })
  return { status: r.status, stderr: r.stderr ?? '' }
}

function read(appName: string, rel: string): string {
  return readFileSync(join(parentDir, appName, rel), 'utf8')
}

describe('aihu app · OOTB css-engine flags', () => {
  it('--css engine: dep + utility starter + explicit shadow css block (DA4)', () => {
    const { status } = run(['a', '--css', 'engine'])
    expect(status).toBe(0)
    const pkg = JSON.parse(read('a', 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBe('latest')
    // DA4: pages default to light DOM, so the shadow wizard choice is carried
    // as an explicit plugin-global block (it outranks the page default).
    expect(read('a', 'aihu.config.ts')).toContain("css: { shadowMode: 'shadow' },")
    const sfc = read('a', 'src/pages/index.aihu')
    expect(sfc).toContain('class="flex flex-col gap-8 max-w-7xl mx-auto p-8"')
    expect(sfc).not.toContain('@style')
  })

  it('--css-engine alias behaves like --css engine', () => {
    const { status } = run(['b', '--css-engine'])
    expect(status).toBe(0)
    const pkg = JSON.parse(read('b', 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBe('latest')
  })

  it('--css engine --shadow light: explicit css block', () => {
    const { status } = run(['c', '--css', 'engine', '--shadow', 'light'])
    expect(status).toBe(0)
    expect(read('c', 'aihu.config.ts')).toContain("css: { shadowMode: 'light' },")
  })

  it('--css engine --shadow shadow: explicit css block', () => {
    const { status } = run(['d', '--css', 'engine', '--shadow', 'shadow'])
    expect(status).toBe(0)
    expect(read('d', 'aihu.config.ts')).toContain("css: { shadowMode: 'shadow' },")
  })

  it('a retired token (--shadow none) is rejected: falls back to the default', () => {
    const { status, stderr } = run(['g', '--css', 'engine', '--shadow', 'none'])
    expect(status).toBe(0)
    expect(stderr).toContain("Unknown --shadow value 'none'")
    expect(read('g', 'aihu.config.ts')).toContain("css: { shadowMode: 'shadow' },")
  })

  it('--shadow without --css engine: warns and ignores (plain output)', () => {
    const { status, stderr } = run(['e', '--shadow', 'light'])
    expect(status).toBe(0)
    expect(stderr).toContain('--shadow has no effect without --css engine')
    const pkg = JSON.parse(read('e', 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBeUndefined()
    expect(read('e', 'aihu.config.ts')).not.toContain('css: { shadowMode')
  })

  it('no flags: plain output (css-engine off)', () => {
    const { status } = run(['f'])
    expect(status).toBe(0)
    const pkg = JSON.parse(read('f', 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBeUndefined()
    expect(read('f', 'src/pages/index.aihu')).toContain('@style {')
  })
})
