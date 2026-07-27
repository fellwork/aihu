/**
 * GH#503 — `__aihu_each` over an `any` iterable must type the loop var as `any`
 * (not `unknown`), a typed array must still infer its element EXACTLY, and a
 * genuine non-iterable must be a type ERROR (not silently widened).
 *
 * WHAT THIS TESTS, AND WHY IT IS SHAPED THIS WAY
 *   The declaration under test is the `__aihu_each` overload emitted by
 *   `sidecar_ts.rs`. Rather than hardcode a copy (which would drift the day the
 *   codegen changes and quietly stop testing the real thing), this test EXTRACTS
 *   the actual declaration string from the compiler source and type-checks it.
 *
 *   The fixture is built so a SINGLE green `tsc --noEmit` proves the whole
 *   contract at once:
 *     - two `Assert<…>` rows fail to compile if the any-case or the array-case
 *       regress (any→unknown, or array element widened);
 *     - two `@ts-expect-error` rows over a `boolean` and a plain object fail to
 *       compile (TS2578, unused directive) if those STOP being errors — i.e. if
 *       the parameter goes back to permissively accepting non-iterables.
 *   So `code === 0` ⇒ all four hold simultaneously.
 *
 *   The second test is the control that makes the negative meaningful: with the
 *   parameter loosened back to bare `list: T` (main's pre-fix shape), the two
 *   `@ts-expect-error` directives go unused and tsc fails with TS2578. An
 *   instrument is only trusted once watched failing.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRATCH = join(__dirname, '.scratch')
mkdirSync(SCRATCH, { recursive: true })

/** The real `declare function __aihu_each…;` string, straight from the codegen. */
function emittedEachDecl(): string {
  const src = readFileSync(
    resolve(__dirname, '../src/codegen/sidecar_ts.rs'),
    'utf8',
  )
  // The declaration is a single Rust string literal on one line.
  const m = src.match(/"(declare function __aihu_each<T>\(list:[\s\S]*?)"/)
  if (!m) throw new Error('could not find __aihu_each declaration in sidecar_ts.rs')
  return m[1].trim()
}

const CASES = `
type IsAny<T> = 0 extends (1 & T) ? true : false;
type ElemOf<F> = F extends ReadonlyArray<[infer E, number]> ? E : never;
type Assert<T extends true> = T;

declare const section: any;
declare const rows: { name: string }[];
declare const optRows: { name: string }[] | undefined;
declare const flag: boolean;
declare const obj: { a: number; b: string };

// MUST-PASS 1 — an \`any\` source types the loop var as \`any\`, not \`unknown\`.
type _AnyIsAny = Assert<IsAny<ElemOf<ReturnType<typeof __aihu_each<typeof section.data>>>>>;
for (const [it] of __aihu_each(section.data)) { void it.anything.goes; }

// MUST-PASS 2 — a typed array infers its element EXACTLY.
type _ExactElem = Assert<ElemOf<ReturnType<typeof __aihu_each<typeof rows>>> extends { name: string } ? true : false>;
for (const [r] of __aihu_each(rows)) { const s: string = r.name; void s; }

// PERMISSIVE — nullish source is a render-nothing no-op (v-for / #each semantics).
for (const [r] of __aihu_each(optRows)) { void r; }

// MUST-FAIL (negative) — a genuine non-iterable is a type ERROR, not widened.
// @ts-expect-error boolean is not a valid each source
for (const [x] of __aihu_each(flag)) { void x; }
// @ts-expect-error a plain object is not iterable — iterate Object.entries instead
for (const [y] of __aihu_each(obj)) { void y; }
`

function runTsc(fileContents: string): { code: number; stdout: string } {
  const tmp = mkdtempSync(join(SCRATCH, 'gh503-'))
  const file = join(tmp, 'each.ts')
  const cfg = join(tmp, 'tsconfig.json')
  writeFileSync(file, fileContents)
  writeFileSync(
    cfg,
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: 'es2020',
        lib: ['es2020', 'dom'],
      },
      files: [file],
    }),
  )
  try {
    const stdout = execFileSync('bunx', ['tsc', '--noEmit', '-p', cfg], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout }
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string }
    const stdout = typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString() ?? '')
    return { code: err.status ?? 1, stdout }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

describe('GH#503 — __aihu_each over any / typed / non-iterable sources', () => {
  it('any→any, array→exact element, and a non-iterable is a type error (one green tsc run)', () => {
    const { code, stdout } = runTsc(`${emittedEachDecl()}\n${CASES}`)
    expect(stdout).toBe('')
    expect(code).toBe(0)
  })

  it('control: loosening the parameter back to bare `list: T` fails the negative (TS2578)', () => {
    const permissive = emittedEachDecl().replace(
      /list: T & \([^)]*\)/,
      'list: T',
    )
    // Guard the guard: if the emitted decl ever loses its constraint, this
    // replacement is a no-op and the control would silently pass. Assert we
    // actually changed something.
    expect(permissive).not.toBe(emittedEachDecl())
    const { code, stdout } = runTsc(`${permissive}\n${CASES}`)
    expect(code).not.toBe(0)
    expect(stdout).toContain('TS2578') // unused @ts-expect-error: non-iterable no longer errors
  })
})
