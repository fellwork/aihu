/**
 * `__aihu_referenced_tags__` — the server-target export for the DIAGNOSTIC tag
 * set (§22 of `docs/plans/2026-08-06-ssr-child-followups.md`), and the
 * `// @aihu:component-tags` marker it is parsed from.
 *
 * WHY A SECOND EXPORT AT ALL. `__aihu_child_tags__` (pinned in
 * `light-scope-export.test.ts`) is derived from the emitted `__aihu_schild(`
 * call sites, which makes it exactly the set of tags the compiled renderer will
 * look up — the right set for `buildChildRegistry`'s cycle check. It is the
 * WRONG set for "does anything reference this component?", because a reference
 * the emitter DECLINES under the v1 child boundaries (an attribute, children, a
 * root/dynamic path) produces no call site and therefore no tag. In `apps/docs`
 * that made `<weather-demo city="London">` invisible to both build diagnostics
 * while `weather-demo.aihu` genuinely failed to load under SSR.
 *
 * So the fixture below is built around a DECLINED reference: `<y-kid city=…>`
 * carries an attribute and is inlined verbatim, `<x-kid>` becomes a
 * `__aihu_schild` call. A test whose fixture had only renderable references
 * could not tell the two exports apart and would pass against the bug.
 *
 * Requires the compiler binary (`bin/aihu-compile`, or AIHU_COMPILE_BIN) —
 * mirrored from light-scope-export.test.ts.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { _parseComponentTagsMarker, aihuCompilerPlugin } from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ext = process.platform === 'win32' ? '.exe' : ''
const compilerBin = resolve(__dirname, `../bin/aihu-compile${ext}`)
if (existsSync(compilerBin)) {
  process.env.AIHU_COMPILE_BIN ??= compilerBin
}

type TransformFn = (
  this: unknown,
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | null | undefined>

const SERVER_ENV = { environment: { config: { consumer: 'server' } } }

/** `y-kid` is DECLINED by the child emitter (it carries an attribute); `x-kid`
 * is not. The two exports must therefore disagree on this exact fixture. */
const MIXED_SFC = `@template {
  <main class="page">
    <h1>Title</h1>
    <y-kid city="London"></y-kid>
    <x-kid></x-kid>
  </main>
}
`

/** No component reference at all — the "omitted entirely" case. */
const PLAIN_SFC = `@template {
  <div class="card">
    <p>hello</p>
  </div>
}
`

async function runWith(
  source: string,
  thisArg: unknown,
  options?: Parameters<typeof aihuCompilerPlugin>[0],
): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-component-tags-'))
  try {
    const plugin = aihuCompilerPlugin(options)
    const transform = plugin.transform as unknown as TransformFn
    const res = await transform.call(thisArg, source, join(tmp, 'x-page.aihu'))
    if (res == null) throw new Error('plugin returned no result')
    return res.code
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Read an exported string-array off the emitted module BY EVALUATING IT, not by
 * regex.
 *
 * A regex over emitted JS can match text inside a comment or a string literal,
 * so it can report an export that is not there. Importing the module answers
 * the only question that matters to a consumer — `ssrLoadModule` will read this
 * binding — and returns `undefined` for a genuinely absent export, which is the
 * same thing the consumer sees.
 */
async function exportedArray(code: string, name: string): Promise<string[] | undefined> {
  // The emitted module imports `@aihu/arbor` and registers a custom element on
  // a DOM-bearing host (vitest runs under jsdom, so its `typeof customElements`
  // guard PASSES). Strip the imports and stub the handful of names the emit
  // uses as globals: the exports under test are array literals appended at the
  // end that depend on none of it, and the point is to read the binding a
  // consumer would read rather than to run the component.
  const g = globalThis as unknown as Record<string, unknown>
  const noop = (): undefined => undefined
  for (const n of ['branch', 'leaf', 'slot', 'defineElement', 'defineComponent']) g[n] ??= noop
  const body = code
    .split('\n')
    .filter((l) => !/^\s*import\s/.test(l))
    .join('\n')
  const url = `data:text/javascript;base64,${Buffer.from(body, 'utf8').toString('base64')}`
  const mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>
  const v = mod[name]
  return v === undefined ? undefined : (v as string[])
}

describe('__aihu_referenced_tags__ export (server target)', () => {
  it('includes a reference the child emitter DECLINED', async () => {
    const code = await runWith(MIXED_SFC, SERVER_ENV)
    // Sorted + deduped by the Rust walk, so the order is the compiler's.
    expect(await exportedArray(code, '__aihu_referenced_tags__')).toEqual(['x-kid', 'y-kid'])
  })

  it('is a STRICT superset of __aihu_child_tags__ on the same module', async () => {
    // The whole reason both exist. If this ever comes out equal on this
    // fixture, one of the two derivations has changed meaning.
    const code = await runWith(MIXED_SFC, SERVER_ENV)
    const referenced = await exportedArray(code, '__aihu_referenced_tags__')
    const children = await exportedArray(code, '__aihu_child_tags__')
    expect(children).toEqual(['x-kid'])
    expect(referenced).toEqual(['x-kid', 'y-kid'])
    // Pin the containment as a property, not just as these two literals.
    for (const t of children ?? []) expect(referenced).toContain(t)
    expect((referenced ?? []).length).toBeGreaterThan((children ?? []).length)
  })

  it('is omitted when the template references no component', async () => {
    // "No export" and "empty" must mean the same thing to a consumer — the rule
    // `__aihu_child_tags__` already follows.
    const code = await runWith(PLAIN_SFC, SERVER_ENV)
    expect(await exportedArray(code, '__aihu_referenced_tags__')).toBeUndefined()
  })

  it('is absent from a client build', async () => {
    // Diagnostics are a build-time server concern; the client resolves children
    // by upgrading elements and would only carry the bytes.
    //
    // Asserted by absence of the NAME rather than by evaluating: the client
    // path does not TS-strip outside a real Vite host, so the emitted text is
    // not always executable here. `not.toContain` fails safe — a mention of the
    // name anywhere, comment included, fails the test.
    const code = await runWith(MIXED_SFC, {})
    expect(code).not.toContain('__aihu_referenced_tags__')
  })
})

describe('_parseComponentTagsMarker', () => {
  it('parses the marker the Rust codegen emits', () => {
    expect(_parseComponentTagsMarker('// @aihu:component-tags a-one,b-two\nconst x = 1\n')).toEqual(
      ['a-one', 'b-two'],
    )
  })

  it('returns [] when the marker is absent', () => {
    expect(_parseComponentTagsMarker('const x = 1\n')).toEqual([])
  })

  it('does NOT re-sort — the Rust walk already ordered the list', () => {
    // Re-normalising here would put the rule in two places, and the two would
    // drift. Given an out-of-order marker the parser must hand it back as-is.
    expect(_parseComponentTagsMarker('// @aihu:component-tags z-one,a-two')).toEqual([
      'z-one',
      'a-two',
    ])
  })

  it('only matches at the start of a line, so a mention in code is not a marker', () => {
    // The marker is a line comment the codegen owns. Text that merely CONTAINS
    // the phrase — a string literal, an indented quotation — is not one.
    expect(_parseComponentTagsMarker('const s = "// @aihu:component-tags evil-tag"')).toEqual([])
    expect(_parseComponentTagsMarker('  // @aihu:component-tags evil-tag')).toEqual([])
  })
})
