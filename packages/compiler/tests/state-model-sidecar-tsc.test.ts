/**
 * #487 Phase 1 — the @state reactive-declaration model: SIDECAR `tsc --strict`
 * end-to-end (state-model spec §5).
 *
 * The wrapper dialect is valid TypeScript checked IN PLACE (§5.4): the
 * sidecar inlines the authored declarations verbatim and declares the
 * identity-typed intrinsics (§5.1), so
 *
 *   - `const city = prop<string>({ default: 'London' })` types `city: string`
 *     (the §5.2 overload narrows away `undefined` when `default:` is present);
 *   - `prop<string>()` types `string | undefined` — unguarded access FAILS;
 *   - a wrong-typed `default:` errors on the AUTHORED line;
 *   - `let x = state(0)` + template reads/handler writes check as plain TS.
 *
 * Harness: `tests/b3b-sidecar-tsc.test.ts` (same tsc invocation, same
 * workspace-scratch discipline).
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { transform } from '../js/index.ts'

// Each test spawns a real `tsc` process (~1.3-1.5s in isolation), which can
// exceed vitest's 5000ms default under full-suite concurrent CPU load —
// a known flake, not a real failure (see vite-build-utility-css.e2e.test.ts
// for the same pattern with subprocess vite builds).
vi.setConfig({ testTimeout: 20_000 })

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRATCH = join(__dirname, '.scratch')
mkdirSync(SCRATCH, { recursive: true })

const fixturesDir = resolve(__dirname, 'fixtures/state-model')

function runTsc(sidecarPath: string): { code: number; stderr: string; stdout: string } {
  const repoRoot = resolve(__dirname, '../../..')
  const cfgPath = join(dirname(sidecarPath), 'tsconfig.json')
  writeFileSync(
    cfgPath,
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        target: 'esnext',
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        baseUrl: '.',
        paths: { '@aihu/*': [`${repoRoot}/packages/*/dist/index.d.ts`] },
      },
      files: [sidecarPath],
    }),
  )
  try {
    const stdout = execFileSync('bunx', ['tsc', '--noEmit', '-p', cfgPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }
    const stdout = typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString() ?? '')
    const stderr = typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString() ?? '')
    return { code: err.status ?? 1, stdout, stderr }
  }
}

function sidecarFor(fixture: string, tmp: string): string {
  const src = readFileSync(join(fixturesDir, fixture), 'utf8')
  const sidecarOut = join(tmp, `${fixture}.ts`)
  transform(src, join(tmp, fixture), { sidecarOut })
  return sidecarOut
}

describe('#487 — wrapper-dialect sidecars under tsc --strict', () => {
  it('types-good: identity typing threads; strict green', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-state-good-'))
    try {
      const sidecar = sidecarFor('types-good.aihu', tmp)
      const ts = readFileSync(sidecar, 'utf8')
      // The authored declarations are inlined VERBATIM — checked in place.
      expect(ts).toContain("const city = prop<string>({ default: 'London' })")
      expect(ts).toContain('let visits = state(0)')
      // `tsc --strict` green: `city` is `string` (default present), and the
      // defaultless `nickname` is guarded via `??`.
      const result = runTsc(sidecar)
      expect(result.code, `tsc must be clean:\n${result.stdout}\n${result.stderr}`).toBe(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('counter-new: state writes + handler writes strict green', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-state-counter-'))
    try {
      // Copy the fixture from its home so both suites share one source.
      const src = readFileSync(resolve(__dirname, 'fixtures/state-model/counter-new.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'counter-new.aihu.ts')
      transform(src, join(tmp, 'counter-new.aihu'), { sidecarOut })
      const result = runTsc(sidecarOut)
      expect(result.code, `tsc must be clean:\n${result.stdout}\n${result.stderr}`).toBe(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('wrong-typed default: tsc errors on the authored line', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-state-baddef-'))
    try {
      const sidecar = sidecarFor('types-bad-default.aihu', tmp)
      const result = runTsc(sidecar)
      expect(result.code).not.toBe(0)
      const combined = `${result.stdout}\n${result.stderr}`
      // The config value is checked against PropConfig<number>.
      expect(combined).toMatch(/'string' is not assignable to type 'number'|default/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('defaultless prop: unguarded access fails strict (T | undefined)', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-state-undef-'))
    try {
      const sidecar = sidecarFor('types-bad-defaultless.aihu', tmp)
      const result = runTsc(sidecar)
      expect(result.code).not.toBe(0)
      const combined = `${result.stdout}\n${result.stderr}`
      expect(combined).toMatch(/possibly 'undefined'/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
