/**
 * B3b — AC12 sidecar consumer wiring (V3 NEEDS_FIX item).
 *
 * End-to-end test for the per-SFC `.aihu.ts` sidecar pipeline:
 *
 *   1. Vite plugin calls compiler `transform(source, id, { sidecarOut })`
 *   2. Compiler binary (`aihu-compile --sidecar-out <path>`) writes the
 *      sidecar to disk with typed `$emit`/`$event` declarations derived
 *      from the SFC's $event collection.
 *   3. `tsc --noEmit` over `**\/*.aihu.ts` type-checks template expressions.
 *      A deliberate type error in `$emit.<name>(payload)` payload shape
 *      surfaces as a tsc error citing the wrong type at the call site.
 *
 * This closes Scout D4's near-zero TS-coverage baseline at the per-SFC
 * level end-to-end (compiler emit → file write → tsc discovery → CI gate).
 *
 * Architect spec §7 path (i); §11.c.
 */

import { execFileSync, execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/b3b-sidecar')

function runTsc(sidecarPath: string): { code: number; stderr: string; stdout: string } {
  // Wrap tsc in --noEmit so it only type-checks. Use --skipLibCheck to keep
  // the run fast and isolated from project-wide lib types.
  try {
    const stdout = execFileSync(
      'bunx',
      [
        'tsc',
        '--noEmit',
        '--skipLibCheck',
        '--target',
        'esnext',
        '--module',
        'esnext',
        '--moduleResolution',
        'bundler',
        '--strict',
        sidecarPath,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }
    const stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString() ?? ''
    const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString() ?? ''
    return { code: err.status ?? 1, stdout, stderr }
  }
}

describe('B3b — AC12 sidecar tsc end-to-end', () => {
  it('writes a .ts sidecar to the sidecarOut path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-b3b-sidecar-'))
    try {
      const src = readFileSync(join(fixturesDir, 'good-emit-payload.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'good.aihu.ts')
      transform(src, join(tmp, 'good.aihu'), { sidecarOut })
      expect(existsSync(sidecarOut)).toBe(true)
      const ts = readFileSync(sidecarOut, 'utf8')
      expect(ts).toContain('declare const $emit')
      expect(ts).toContain('dayjump: (payload: { day: Date }) => void')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('catches a deliberate $emit payload type error via tsc', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-b3b-bad-'))
    try {
      const src = readFileSync(join(fixturesDir, 'bad-emit-payload.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'bad.aihu.ts')
      transform(src, join(tmp, 'bad.aihu'), { sidecarOut })
      const result = runTsc(sidecarOut)
      // tsc must surface a type error.
      expect(result.code).not.toBe(0)
      // The error message references the wrong-typed `day` at the call site.
      const combined = `${result.stdout}\n${result.stderr}`
      expect(combined).toMatch(/Type 'string'.*Date|day|payload/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('passes tsc on a well-typed $emit payload', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-b3b-good-'))
    try {
      const src = readFileSync(join(fixturesDir, 'good-emit-payload.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'good.aihu.ts')
      transform(src, join(tmp, 'good.aihu'), { sidecarOut })
      const result = runTsc(sidecarOut)
      // The sidecar is emitted with permissive `any`-shape framework
      // primitives, so the test passes whenever tsc surfaces no errors
      // about the `$emit.dayjump({ day: new Date() })` call site.
      expect(result.code).toBe(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// Suppress the unused-import warning when only some helpers are referenced.
void execFile
void writeFileSync
