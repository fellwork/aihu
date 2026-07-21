/**
 * GX Phase 4 (#466) — G7g, the compile-side type contract
 * (70-governed-data-access §4.5, §6):
 *
 *   - the generated sidecar types `route.data` as the discriminated
 *     `__GxEntitled<T> | __GxWithheld<T, P>` union for a `data:`-declared
 *     route, with `__GxWithheld` carrying NO key of `T` beyond the declared
 *     `preview:` subset;
 *   - UNGUARDED `route.data` field access in a template FAILS `tsc` (the
 *     load-bearing half of G7g);
 *   - guard-shaped access — the authored `route.data.$gx.entitled` ternary /
 *     `{#if}` forms, rewritten onto the `__gxEntitled` narrowing predicate —
 *     PASSES `tsc` (so the contract is usable, not merely restrictive).
 *
 * End-to-end through the real pipeline, b3b-style: `transform(source, id,
 * { sidecarOut })` → Rust binary writes the `.aihu.ts` sidecar → `tsc
 * --noEmit`. (The runtime half of G7g — the serialized withheld payload
 * carrying only preview keys — is the generated loader's contract, asserted
 * in the server-runtime lane; the render-side byte check rides
 * tests/integration/server-emission-ssr.test.ts.)
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const SCRATCH = join(__dirname, '.scratch')
mkdirSync(SCRATCH, { recursive: true })

const GOVERNED_FIXTURE = join(repoRoot, 'bench/compiler-conformance/route/04-governed-data.aihu')

/** Same tsc harness as b3b-sidecar-tsc.test.ts (path-mapped workspace types). */
function runTsc(sidecarPath: string): { code: number; stderr: string; stdout: string } {
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

/** The governed fixture with its template's guards stripped — every branch of
 * the union accessed bare. Only the @template differs from the fixture. */
const UNGUARDED_SRC = `${readFileSync(GOVERNED_FIXTURE, 'utf8').split('@template')[0]}@template {
  <article>
    <h1>{route.data.headword}</h1>
    <section>{route.data.senses.join(', ')}</section>
  </article>
}
`

describe('GX P4 — G7g: the generated withheld-type contract under tsc', () => {
  it('guarded template access passes tsc (the contract is usable)', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-gx-guarded-'))
    try {
      const src = readFileSync(GOVERNED_FIXTURE, 'utf8')
      const sidecarOut = join(tmp, 'governed.aihu.ts')
      transform(src, join(tmp, 'src/pages/governed.aihu'), { sidecarOut })
      const ts = readFileSync(sidecarOut, 'utf8')

      // The generated contract, present and shaped as specified.
      expect(ts).toContain('type __GxEntitled<T>')
      expect(ts).toContain('type __GxWithheld<T, P extends PropertyKey = never>')
      expect(ts).toContain(
        "let route: __GxRoute<{ params: { slug: string }; data: { headword: string; senses: string[] } }, 'headword'> = null as any;",
      )
      // The authored nested discriminant is rewritten onto the predicate.
      expect(ts).toContain('__gxEntitled(route.data)')

      const result = runTsc(sidecarOut)
      expect(
        result.code,
        `guarded sidecar must be clean:\n${result.stdout}\n${result.stderr}`,
      ).toBe(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60_000)

  it('unguarded route.data field access fails tsc (G7g)', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-gx-unguarded-'))
    try {
      const sidecarOut = join(tmp, 'unguarded.aihu.ts')
      transform(UNGUARDED_SRC, join(tmp, 'src/pages/unguarded.aihu'), { sidecarOut })
      const result = runTsc(sidecarOut)
      expect(result.code).not.toBe(0)
      const combined = `${result.stdout}\n${result.stderr}`
      // The withheld variant is what makes bare access an error — the message
      // names it, so the failure is the contract, not an unrelated slip.
      expect(combined).toMatch(/TS2339: Property 'headword' does not exist/)
      expect(combined).toMatch(/__GxWithheld/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60_000)

  it('an ungoverned route keeps the pre-P4 sidecar (no GX types)', () => {
    const tmp = mkdtempSync(join(SCRATCH, 'aihu-gx-ungoverned-'))
    try {
      const src = readFileSync(GOVERNED_FIXTURE, 'utf8')
        .split('\n')
        .filter((l) => !l.includes('data: { type:'))
        .join('\n')
      const sidecarOut = join(tmp, 'plain.aihu.ts')
      transform(src, join(tmp, 'src/pages/plain.aihu'), { sidecarOut })
      const ts = readFileSync(sidecarOut, 'utf8')
      expect(ts).not.toContain('__Gx')
      expect(ts).toContain('let route: () => {')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// Referenced by the shared-harness shape (b3b precedent); keeps biome quiet if
// unused on some platforms.
void existsSync
