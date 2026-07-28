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

import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Sidecars now INLINE the @state body, imports and all, so tsc must resolve
// `@aihu/signals` when checking one. Scratch dirs therefore live inside the
// workspace (where module resolution walks up to node_modules) rather than in the
// OS temp dir, where every sidecar with an import would false-fail on TS2307.
const SCRATCH = join(__dirname, '.scratch')
mkdirSync(SCRATCH, { recursive: true })

const fixturesDir = resolve(__dirname, 'fixtures/b3b-sidecar')

function runTsc(sidecarPath: string): { code: number; stderr: string; stdout: string } {
  // A sidecar now INLINES the @state body, imports and all, so type-checking one
  // means resolving `@aihu/signals`. The workspace packages are not symlinked into
  // a root `node_modules/@aihu/`, so tsc is given an explicit path mapping —
  // otherwise every sidecar with an import false-fails on TS2307 and the test would
  // be asserting the resolver's failure, not the sidecar's correctness.
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

describe('B3b — AC12 sidecar tsc end-to-end', () => {
  it('writes a .ts sidecar to the sidecarOut path', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-b3b-sidecar-'))
    try {
      const src = readFileSync(join(fixturesDir, 'good-emit-payload.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'aihu-aihu-good.aihu.ts')
      transform(src, join(tmp, 'aihu-good.aihu'), { sidecarOut })
      expect(existsSync(sidecarOut)).toBe(true)
      const ts = readFileSync(sidecarOut, 'utf8')
      expect(ts).toContain('declare const $emit')
      expect(ts).toContain('dayjump: (payload: { day: Date }) => void')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('catches a deliberate $emit payload type error via tsc', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-b3b-bad-'))
    try {
      const src = readFileSync(join(fixturesDir, 'bad-emit-payload.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'aihu-aihu-bad.aihu.ts')
      transform(src, join(tmp, 'aihu-bad.aihu'), { sidecarOut })
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

  it('passes tsc on template-literal, spread, and destructured-each reads (W4)', () => {
    // W4 — the AST harvest: reads inside `${…}` holes and after `...`, and
    // destructured `{#each}` aliases, must all be IN SCOPE for the lifted
    // expressions. Before W4 the token harvest missed every one of them and this
    // fixture failed tsc with false TS2304s.
    //
    // How a name gets into scope changed twice: @state bindings (`count`,
    // `nums`) are bound by the INLINED @state body, carrying their real types,
    // and (#485 step 3) the loop aliases (`i`, `k`, `v`) are bound by a real
    // `for…of` head over `__aihu_each`, carrying inferred element types. So the
    // check is "does tsc resolve it", not "is it in the parameter list" — the old
    // assertion pinned the sidecar to a shape in which every binding was `any` and
    // a type error in @state could never be caught.
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-w4-adv-'))
    try {
      const src = readFileSync(join(fixturesDir, 'w4-advanced-exprs.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'w4-advanced-exprs.aihu.ts')
      transform(src, join(tmp, 'w4-advanced-exprs.aihu'), { sidecarOut })
      const ts = readFileSync(sidecarOut, 'utf8')
      const sig = ts.split('\n').find((l) => l.includes('function __aihu_template')) ?? ''
      // #485 step 3: loop aliases are bound by the `for…of` head over the
      // `__aihu_each` helper — inferred element types, no `any` params left.
      expect(ts).toContain('for (const [[k, v], i] of')
      expect(sig).not.toContain(': any')
      // @state bindings come from the inlined body instead.
      expect(ts).toContain('count')
      expect(ts).toContain('nums')
      // The real check: tsc resolves every one of them. A missed harvest is a TS2304.
      const result = runTsc(sidecarOut)
      expect(result.code, `tsc must be clean:\n${result.stdout}\n${result.stderr}`).toBe(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('cites the real .aihu line for an error inside a template-literal hole (W4/#390)', () => {
    // Line-mapping proof: the undefined `nope` lives in a `${…}` hole on
    // .aihu line 11; the line-preserving sidecar makes tsc cite line 11.
    // The in-scope `count` in the SAME literal must NOT error (before W4 it
    // false-TS2304'd, drowning the genuine diagnostic).
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-w4-line-'))
    try {
      const src = readFileSync(join(fixturesDir, 'w4-bad-line-cite.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'w4-bad-line-cite.aihu.ts')
      transform(src, join(tmp, 'w4-bad-line-cite.aihu'), { sidecarOut })
      const result = runTsc(sidecarOut)
      expect(result.code).not.toBe(0)
      const combined = `${result.stdout}\n${result.stderr}`
      expect(combined).toMatch(/\(11,\d+\): error TS2304: Cannot find name 'nope'/)
      expect(combined).not.toMatch(/Cannot find name 'count'/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('passes tsc on a well-typed $emit payload', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-b3b-good-'))
    try {
      const src = readFileSync(join(fixturesDir, 'good-emit-payload.aihu'), 'utf8')
      const sidecarOut = join(tmp, 'aihu-aihu-good.aihu.ts')
      transform(src, join(tmp, 'aihu-good.aihu'), { sidecarOut })
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
