/**
 * #486 — TS-generator step 4 (template-grammar 40-spec §5): the
 * `--strict-templates` attribute + component-prop type layer, end-to-end
 * through the real pipeline (the tsgen/b3b harness shape): `transform(src,
 * id, { sidecarOut, strictTemplates })` → the Rust binary writes the
 * `.aihu.ts` sidecar → real `tsc --noEmit --strict`.
 *
 *   Dynamic HTML attributes — a reactive attribute expression checks against
 *     the element's DOM attribute type via the `document.createElement('tag')`
 *     trick (the Angular precedent): `<button disabled={n}>` with `n: number`
 *     FAILS; `disabled={b}` with `b: boolean` passes. Kebab/`data-*`/`aria-*`
 *     stay open (the JSX hole — spec §2.8).
 *   Static attributes — a static string checks AS A STRING LITERAL against
 *     the boolean attribute's type: `disabled="false"` is a type error under
 *     `--strict-templates` (Angular `strictAttributeTypes`; W602 already
 *     warns non-strict).
 *   Component props — a child component's `prop()` wrapper declarations
 *     derive its props interface (one authored type: the identity-typed
 *     intrinsic gives `T`, so the child sidecar registers
 *     `AihuComponentProps['my-widget'] = { count?: typeof count }` by global
 *     declaration merging — the `JSX.IntrinsicElements` analog). The parent's
 *     passed props check against it: wrong type fails, right type passes, a
 *     misspelled prop name fails. Tags no compiled component declares stay
 *     OPEN (`Record<string, any>`), so third-party custom elements are never
 *     over-constrained.
 *   Default-off — without `strictTemplates` the sidecar carries none of the
 *     check layer (no `__chk_`, no `AihuComponentProps`) and the fixture
 *     type-checks exactly as before (regression guard).
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

/** Same tsc harness as tsgen-sidecar-tsc.test.ts, over N sidecars at once. */
function runTsc(sidecarPaths: string[]): { code: number; stderr: string; stdout: string } {
  const cfgPath = join(dirname(sidecarPaths[0] as string), 'tsconfig.json')
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
      files: sidecarPaths,
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

/** Compile each named SFC to its sidecar (strict or not), then tsc them together. */
function checkSidecars(
  name: string,
  files: Array<{ stem: string; src: string }>,
  opts?: { strictTemplates?: boolean },
): { code: number; combined: string; sidecars: Record<string, string> } {
  const tmp = mkdtempSync(join(SCRATCH, `aihu-strict-${name}-`))
  try {
    const sidecarPaths: string[] = []
    const sidecars: Record<string, string> = {}
    for (const f of files) {
      const sidecarOut = join(tmp, `${f.stem}.aihu.ts`)
      transform(f.src, join(tmp, `${f.stem}.aihu`), {
        sidecarOut,
        strictTemplates: opts?.strictTemplates ?? false,
      })
      sidecars[f.stem] = readFileSync(sidecarOut, 'utf8')
      sidecarPaths.push(sidecarOut)
    }
    const result = runTsc(sidecarPaths)
    return { code: result.code, combined: `${result.stdout}\n${result.stderr}`, sidecars }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const STATE = `@state {
  import { signal } from '@aihu/signals'
  const [n, setN] = signal(0)
  const [b, setB] = signal(false)
  const [s, setS] = signal('')
}
`

/** Wrapper-dialect child — `prop<T>({…})` declarations ARE the props contract. */
const WIDGET = `@state {
  const count = prop<number>({ default: 0 })
  const label = prop<string>({ required: true })
}
@template {
  <p>{label}: {count}</p>
}
`

// Real `bunx tsc` subprocesses: give the suite headroom under full-suite worker load.
const TSC_SUITE = { timeout: 120_000 }

describe('#486 step 4 — dynamic HTML-attribute typing (strict only)', TSC_SUITE, () => {
  it('<button disabled={n}> with n: number FAILS under --strict-templates', () => {
    const { code, combined, sidecars } = checkSidecars(
      'attr-bad',
      [{ stem: 'attr-bad', src: `${STATE}@template {\n  <button disabled={n}>Go</button>\n}\n` }],
      { strictTemplates: true },
    )
    expect(sidecars['attr-bad']).toContain('document.createElement("button")')
    expect(sidecars['attr-bad']).toMatch(/__chk_\d+\.disabled = \(__aihu_ctx\.n\);/)
    expect(code).not.toBe(0)
    expect(combined).toMatch(/error TS2322: Type 'number' is not assignable to type 'boolean'/)
    // The diagnostic cites the authored `.aihu` line (template line 8).
    expect(combined).toMatch(/attr-bad\.aihu\.ts\(8,\d+\)/)
  })

  it('<button disabled={b}> with b: boolean passes under --strict-templates', () => {
    const { code, combined } = checkSidecars(
      'attr-ok',
      [{ stem: 'attr-ok', src: `${STATE}@template {\n  <button disabled={b}>Go</button>\n}\n` }],
      { strictTemplates: true },
    )
    expect(code, `boolean-typed attr must pass:\n${combined}`).toBe(0)
  })

  it('kebab-case, data-* and aria-* attributes stay open (the JSX hole)', () => {
    const { code, combined } = checkSidecars(
      'attr-open',
      [
        {
          stem: 'attr-open',
          src: `${STATE}@template {\n  <button data-count={n} aria-label={s} my-custom={n}>Go</button>\n}\n`,
        },
      ],
      { strictTemplates: true },
    )
    expect(code, `open attribute families must not be constrained:\n${combined}`).toBe(0)
  })
})

describe('#486 step 4 — static-attribute typing (strict only)', TSC_SUITE, () => {
  it('disabled="false" is a TYPE ERROR under --strict-templates (§2.2 normative)', () => {
    const { code, combined, sidecars } = checkSidecars(
      'static-bad',
      [
        {
          stem: 'static-bad',
          src: `${STATE}@template {\n  <button disabled="false">Go</button>\n}\n`,
        },
      ],
      { strictTemplates: true },
    )
    expect(sidecars['static-bad']).toMatch(/__chk_\d+\.disabled = \("false"\);/)
    expect(code).not.toBe(0)
    expect(combined).toMatch(
      /error TS2322: Type '(?:"false"|string)' is not assignable to type 'boolean'/,
    )
  })

  it('non-boolean static attributes are untouched (type="text" etc.)', () => {
    const { code, combined } = checkSidecars(
      'static-ok',
      [
        {
          stem: 'static-ok',
          src: `${STATE}@template {\n  <input type="text" placeholder="City name" />\n}\n`,
        },
      ],
      { strictTemplates: true },
    )
    expect(code, `ordinary static strings must pass:\n${combined}`).toBe(0)
  })
})

describe(
  '#486 step 4 — component-prop typing from prop() wrappers (strict only)',
  TSC_SUITE,
  () => {
    it('the child sidecar registers its props interface from the prop<T> declarations', () => {
      const { sidecars } = checkSidecars('child-decl', [{ stem: 'my-widget', src: WIDGET }], {
        strictTemplates: true,
      })
      expect(sidecars['my-widget']).toContain(
        'declare global { interface AihuComponentProps { "my-widget": { count?: typeof count; label?: typeof label } } }',
      )
    })

    it('<my-widget count={s}> with s: string FAILS against prop<number>', () => {
      const { code, combined } = checkSidecars(
        'prop-bad',
        [
          { stem: 'my-widget', src: WIDGET },
          {
            stem: 'parent-bad',
            src: `${STATE}@template {\n  <my-widget count={s} label={s}></my-widget>\n}\n`,
          },
        ],
        { strictTemplates: true },
      )
      expect(code).not.toBe(0)
      expect(combined).toMatch(/error TS2322: Type 'string' is not assignable to type 'number'/)
    })

    it('correctly-typed props pass', () => {
      const { code, combined } = checkSidecars(
        'prop-ok',
        [
          { stem: 'my-widget', src: WIDGET },
          {
            stem: 'parent-ok',
            src: `${STATE}@template {\n  <my-widget count={n} label={s} class="card" id="w1"></my-widget>\n}\n`,
          },
        ],
        { strictTemplates: true },
      )
      expect(code, `correct prop types (and global HTML attrs) must pass:\n${combined}`).toBe(0)
    })

    it('a misspelled prop name FAILS (unknown member of the derived interface)', () => {
      const { code, combined } = checkSidecars(
        'prop-typo',
        [
          { stem: 'my-widget', src: WIDGET },
          {
            stem: 'parent-typo',
            src: `${STATE}@template {\n  <my-widget cont={n} label={s}></my-widget>\n}\n`,
          },
        ],
        { strictTemplates: true },
      )
      expect(code).not.toBe(0)
      // TS2551 when the checker finds a near-miss suggestion; TS2339 otherwise.
      expect(combined).toMatch(/error TS25(?:51|39): Property 'cont' does not exist on type/)
    })

    it('a component tag NO compiled component declares stays open', () => {
      const { code, combined } = checkSidecars(
        'prop-unknown-tag',
        [
          {
            stem: 'parent-open',
            src: `${STATE}@template {\n  <x-legacy-widget anything={n} whatever={s}></x-legacy-widget>\n}\n`,
          },
        ],
        { strictTemplates: true },
      )
      expect(code, `undeclared component tags must stay open:\n${combined}`).toBe(0)
    })
  },
)

describe('#486 step 4 — default-off regression guard', TSC_SUITE, () => {
  const SRC = `${STATE}@template {
  <button disabled={n} class="x">Go</button>
  <input readonly="false" />
  <my-widget count={s}></my-widget>
}
`

  it('without --strict-templates the sidecar carries NO check layer and still passes', () => {
    const { code, combined, sidecars } = checkSidecars('default-off', [
      { stem: 'default-off', src: SRC },
    ])
    expect(sidecars['default-off']).not.toContain('__chk_')
    expect(sidecars['default-off']).not.toContain('AihuComponentProps')
    expect(sidecars['default-off']).not.toContain('document.createElement')
    expect(code, `default-off must not introduce new errors:\n${combined}`).toBe(0)
  })

  it('the same fixture FAILS only when the flag is on (the layer is opt-in)', () => {
    const { code } = checkSidecars('opt-in', [{ stem: 'opt-in', src: SRC }], {
      strictTemplates: true,
    })
    expect(code).not.toBe(0)
  })
})
