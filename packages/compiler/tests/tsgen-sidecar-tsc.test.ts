/**
 * #485 — TS-generator steps 1–3 (template-grammar 40-spec §5), end-to-end
 * through the real pipeline (b3b harness shape): `transform(src, id,
 * { sidecarOut })` → the Rust binary writes the `.aihu.ts` sidecar → real
 * `tsc --noEmit --strict`. Each step is asserted in BOTH directions — the
 * documented authoring contract passes, and genuine type errors still fail
 * at the authored `.aihu` line.
 *
 *   Step 1 — rewrite-before-lift: a bare signal read (`{count > 0}`) checks
 *     at its authored VALUE type via the `__aihu_ctx` view, not as the getter
 *     function (was a false TS2365); `` `${count}` `` checks the value (was a
 *     false pass over the stringified function source).
 *   Step 2 — real `if`/`else` emission: `if={user}` guarding `{user.name}`
 *     narrows `User | null` (was a false "possibly null"); UNGUARDED access
 *     still errors.
 *   Step 3 — `for…of` + `__aihu_each`: `each={item of items}` binders carry
 *     inferred element types (were `any` params); a bad field errors at the
 *     `.aihu` loop line. Destructuring and index binder forms included.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const SCRATCH = join(__dirname, '.scratch')
mkdirSync(SCRATCH, { recursive: true })

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

function checkSidecar(
  name: string,
  src: string,
): {
  code: number
  combined: string
  sidecar: string
} {
  const tmp = mkdtempSync(join(SCRATCH, `aihu-tsgen-${name}-`))
  try {
    const sidecarOut = join(tmp, `${name}.aihu.ts`)
    transform(src, join(tmp, `${name}.aihu`), { sidecarOut })
    const sidecar = readFileSync(sidecarOut, 'utf8')
    const result = runTsc(sidecarOut)
    return { code: result.code, combined: `${result.stdout}\n${result.stderr}`, sidecar }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const STATE = `@state {
  import { signal } from '@aihu/signals'
  type User = { name: string }
  type Book = { title: string; year: number }
  const [count, setCount] = signal(0)
  const [items, setItems] = signal<string[]>([])
  const [user, setUser] = signal<User | null>(null)
  const [books, setBooks] = signal<Book[]>([])
  const [entries, setEntries] = signal<[string, number][]>([])
}
`

// Real `bunx tsc` subprocesses: give the suite headroom under full-suite worker load.
const TSC_SUITE = { timeout: 120_000 }

describe('#485 step 1 — rewrite-before-lift (authored value types)', TSC_SUITE, () => {
  it('bare reads pass tsc: {count > 0} and {items.join(", ")} (were false errors)', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step1-pass',
      `${STATE}@template {
  <p>{count > 0}</p>
  <p>{items.join(', ')}</p>
  <p>{\`Count: \${count}\`}</p>
}
`,
    )
    // The lift is the value view, not the getter function.
    expect(sidecar).toContain('void (__aihu_ctx.count > 0);')
    expect(sidecar).toContain("void (__aihu_ctx.items.join(', '));")
    expect(code, `bare reads must type-check at value types:\n${combined}`).toBe(0)
  })

  it('bare reads FAIL tsc when genuinely mistyped (no more false pass)', () => {
    const { code, combined } = checkSidecar(
      'step1-fail',
      `${STATE}@template {
  <p>{count.toUpperCase()}</p>
}
`,
    )
    // `count` is a number now — before #485 it was the getter function and
    // errors like this were unreachable.
    expect(code).not.toBe(0)
    expect(combined).toMatch(/toUpperCase' does not exist on type 'number'/)
  })

  it('the authored explicit-call form still checks (callee positions untouched)', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step1-call',
      `${STATE}@template {
  <p>{count()}</p>
  <p>{items().join(', ')}</p>
}
`,
    )
    expect(sidecar).toContain('void (count());')
    expect(code, `explicit getter calls must keep passing:\n${combined}`).toBe(0)
  })
})

describe('#485 step 2 — real if/else emission (narrowing)', TSC_SUITE, () => {
  it('if={user} narrows {user.name} (was a false "possibly null")', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step2-narrow',
      `${STATE}@template {
  <p if={user}>{user.name}</p>
}
`,
    )
    expect(sidecar).toContain('if (__aihu_ctx.user) { void (__aihu_ctx.user.name); }')
    expect(code, `guarded access must narrow:\n${combined}`).toBe(0)
  })

  it('unguarded {user.name} still errors, at the authored line', () => {
    const src = `${STATE}@template {
  <p>{user.name}</p>
}
`
    const { code, combined } = checkSidecar('step2-unguarded', src)
    expect(code).not.toBe(0)
    // The template line is .aihu line 12 (the @state block spans 1–10).
    expect(combined).toMatch(/\(12,\d+\): error TS18047: .* possibly 'null'/)
  })

  it('elseif/else chains emit one if/else-if/else chain and both branches check', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step2-chain',
      `${STATE}@template {
  <p if={user}>{user.name}</p>
  <p elseif={count > 0}>{count.toFixed(1)}</p>
  <p else>{items.length}</p>
}
`,
    )
    expect(sidecar).toContain('if (__aihu_ctx.user) {')
    expect(sidecar).toContain('} else if (__aihu_ctx.count > 0) {')
    expect(sidecar).toContain('} else {')
    expect(code, `the chain must type-check:\n${combined}`).toBe(0)
  })
})

describe('#485 step 3 — for…of + __aihu_each (loop binder inference)', TSC_SUITE, () => {
  it('each={item of items} types the alias as the element (Book)', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step3-infer',
      `${STATE}@template {
  <li each={item of books} key={item.title}>{item.title}: {item.year.toFixed(0)}</li>
}
`,
    )
    expect(sidecar).toContain('for (const [item] of')
    expect(sidecar).toContain('__aihu_each(__aihu_ctx.books)')
    expect(code, `loop aliases must carry the element type:\n${combined}`).toBe(0)
  })

  it('a bad field on the alias errors at the .aihu loop line', () => {
    const src = `${STATE}@template {
  <li each={item of books}>{item.tite}</li>
}
`
    const { code, combined } = checkSidecar('step3-bad-field', src)
    expect(code).not.toBe(0)
    // The loop sits on .aihu line 12; the misspelling is caught there.
    expect(combined).toMatch(
      /\(12,\d+\): error TS2551: Property 'tite' does not exist on type 'Book'/,
    )
  })

  it('destructuring + index binders get real element types', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step3-destructure',
      `${STATE}@template {
  <li each={[k, v], i of entries}>{k.toUpperCase()} {v.toFixed(1)} #{i.toFixed(0)}</li>
  <li each={item, i of books}>{item.title} #{i.toFixed(0)}</li>
}
`,
    )
    expect(sidecar).toContain('for (const [[k, v], i] of')
    expect(sidecar).toContain('for (const [item, i] of')
    expect(code, `binder patterns must destructure element types:\n${combined}`).toBe(0)
  })

  it('a wrongly-typed destructured binder use errors', () => {
    const { code, combined } = checkSidecar(
      'step3-destructure-bad',
      `${STATE}@template {
  <li each={[k, v] of entries}>{v.charAt(0)}</li>
}
`,
    )
    expect(code).not.toBe(0)
    expect(combined).toMatch(/charAt' does not exist on type 'number'/)
  })

  it('the alias-shadows-iterable intermediate const evaluates the list in the outer scope', () => {
    const { code, combined, sidecar } = checkSidecar(
      'step3-shadow',
      `${STATE}@template {
  <li each={items of items}>{items.toUpperCase()}</li>
}
`,
    )
    // svelte2tsx trick: the list is captured into `__each_N` BEFORE the
    // binder shadows it, so `items of items` reads the outer signal.
    expect(sidecar).toMatch(
      /const __each_\d+ = __aihu_each\(__aihu_ctx\.items\); for \(const \[items\] of __each_\d+\)/,
    )
    expect(code, `the alias shadow must not capture itself:\n${combined}`).toBe(0)
  })
})
