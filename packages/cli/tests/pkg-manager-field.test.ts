/**
 * `packageManagerField` — the emitted `packageManager` pin, per `--pm`.
 *
 * The behaviour under test is a bug fix with a measured before-state: under the
 * published `#!/usr/bin/env node` binary, `aihu app x --pm bun` and
 * `aihu app x --pm pnpm` produced BYTE-IDENTICAL trees, because the old inline
 * expression required `pm === 'bun'` AND an in-process Bun version, and node
 * supplies neither. `--pm` was a complete no-op on that path.
 *
 * The spawn is injected here rather than probed, so the pnpm/yarn cases are
 * covered on a machine that has neither installed — which is exactly the
 * machine this was first reproduced on.
 */

import type { spawnSync as SpawnSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { packageManagerField, resetPackageManagerFieldCache } from '../src/pkg-manager-field.ts'

/** A fake `spawnSync` that answers `<pm> --version` from a table. */
function fakeSpawn(table: Record<string, { status?: number; stdout?: string }>) {
  const calls: string[] = []
  const fn = ((cmd: string) => {
    calls.push(cmd)
    const hit = table[cmd]
    if (hit === undefined) throw new Error(`ENOENT (fake): ${cmd}`)
    return { status: hit.status ?? 0, stdout: hit.stdout ?? '', stderr: '' }
  }) as unknown as typeof SpawnSync
  return { fn, calls }
}

beforeEach(() => {
  resetPackageManagerFieldCache()
})

describe('packageManagerField', () => {
  it('pins the probed version for every package manager, not just bun', () => {
    const { fn } = fakeSpawn({
      pnpm: { stdout: '10.4.1\n' },
      npm: { stdout: '10.9.0\n' },
      yarn: { stdout: '4.6.0\n' },
    })
    expect(packageManagerField('pnpm', fn)).toBe('pnpm@10.4.1')
    expect(packageManagerField('npm', fn)).toBe('npm@10.9.0')
    expect(packageManagerField('yarn', fn)).toBe('yarn@4.6.0')
  })

  it('emits NO field when the package manager is not installed', () => {
    // A wrong pin is worse than no pin: corepack enforces `packageManager` and
    // refuses to run when it disagrees with the invoked tool.
    const { fn } = fakeSpawn({})
    expect(packageManagerField('yarn', fn)).toBeUndefined()
  })

  it('emits NO field when the probe fails or answers with a non-version', () => {
    const { fn } = fakeSpawn({
      pnpm: { status: 1, stdout: 'ERROR: This version of pnpm requires Node.js v22.13\n' },
      yarn: { status: 0, stdout: 'not a version' },
    })
    expect(packageManagerField('pnpm', fn)).toBeUndefined()
    expect(packageManagerField('yarn', fn)).toBeUndefined()
  })

  it('probes each package manager at most once per process', () => {
    const { fn, calls } = fakeSpawn({ npm: { stdout: '10.9.0' } })
    packageManagerField('npm', fn)
    packageManagerField('npm', fn)
    packageManagerField('npm', fn)
    expect(calls).toEqual(['npm'])
  })

  it('caches the negative answer too', () => {
    const { fn, calls } = fakeSpawn({})
    expect(packageManagerField('yarn', fn)).toBeUndefined()
    expect(packageManagerField('yarn', fn)).toBeUndefined()
    expect(calls).toEqual(['yarn'])
  })

  it('bun prefers the in-process version and never spawns for it under bun', () => {
    // Under vitest-on-bun `process.versions.bun` is set, so no spawn happens;
    // under node it falls through to the probe. Assert whichever applies rather
    // than pretending the runtime is fixed.
    const { fn, calls } = fakeSpawn({ bun: { stdout: '1.3.8' } })
    const got = packageManagerField('bun', fn)
    expect(got).toMatch(/^bun@\d+\.\d+\.\d+/)
    if (process.versions.bun !== undefined) {
      expect(calls).toEqual([])
      expect(got).toBe(`bun@${process.versions.bun}`)
    } else {
      expect(calls).toEqual(['bun'])
    }
  })
})
