/**
 * `__aihu_light_scope__` — the server-target scope-id export (LDF §10 step 3).
 *
 * The plugin's transform computes a light-DOM component's `data-a` scope id
 * (`_lightScopeId(rawId)`) and (a) injects it into the client's
 * `defineElement` options — the runtime stamps the host at
 * `connectedCallback` — and (b) writes it into the emitted
 * `@scope([data-a="…"])` CSS. Server-side renders need the SAME id to stamp
 * prerendered roots (`SsrOptions.lightScopeId`), so the SERVER-consumer
 * transform additionally exports it from the compiled module. These tests pin
 * that export: present exactly when the component resolves to light mode AND
 * the transform runs for a server consumer; absent otherwise (client bundles
 * carry no extra bytes; shadow components have no scope id at all).
 *
 * Requires the compiler binary (`bin/aihu-compile`, or AIHU_COMPILE_BIN) —
 * mirrored from css-engine-hook.test.ts.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { _lightScopeId, aihuCompilerPlugin } from '../js/index.ts'

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

const SFC = `@template {
  <div class="card">
    <p>hello</p>
  </div>
}
`

/** Run the plugin transform with a given hook `this` (Vite environment). */
async function runPlugin(
  thisArg: unknown,
  options?: Parameters<typeof aihuCompilerPlugin>[0],
): Promise<{ code: string; id: string }> {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-light-scope-'))
  try {
    const plugin = aihuCompilerPlugin(options)
    const transform = plugin.transform as unknown as TransformFn
    const id = join(tmp, 'x-card.aihu')
    const res = await transform.call(thisArg, SFC, id)
    if (res == null) throw new Error('plugin returned no result')
    return { code: res.code, id }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const SERVER_ENV = { environment: { config: { consumer: 'server' } } }

describe('__aihu_light_scope__ export (server target)', () => {
  it('server consumer + light mode → exports the module’s _lightScopeId', async () => {
    const { code, id } = await runPlugin(SERVER_ENV, { shadowMode: 'light' })
    // The transform's TS-strip normalizes quote style — assert quote-agnostic.
    expect(code).toMatch(
      new RegExp(`export const __aihu_light_scope__ = ["']${_lightScopeId(id)}["']`),
    )
  })

  it('server consumer + light mode → fills the __AIHU_LIGHT_SCOPE_ID__ placeholder', async () => {
    // The Rust string renderer emits `const __AIHU_LIGHT_SCOPE_ID__ = undefined`
    // and defaults `__ssrString`'s `lightScopeId` from it — `_injectLightScopeId`
    // must replace the literal so a compiled component stamps `data-a` on its
    // own root with no caller cooperation.
    const { code, id } = await runPlugin(SERVER_ENV, { shadowMode: 'light' })
    expect(code).toMatch(new RegExp(`const __AIHU_LIGHT_SCOPE_ID__ = ["']${_lightScopeId(id)}["']`))
    expect(code).not.toContain('__AIHU_LIGHT_SCOPE_ID__ = undefined')
  })

  it('client consumer never carries the export (the runtime stamps the host instead)', async () => {
    const { code } = await runPlugin({}, { shadowMode: 'light' })
    expect(code).not.toContain('__aihu_light_scope__')
  })

  it('shadow mode has no scope id — no export even for a server consumer', async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'shadow' })
    expect(code).not.toContain('__aihu_light_scope__')
    expect(code).not.toMatch(/__AIHU_LIGHT_SCOPE_ID__ = ["']/)
  })
})

/**
 * `__aihu_shadow__` — the server-target shadow-mode export.
 *
 * An SSR caller rendering a NESTED custom element must emit two different
 * shapes: a light component's tree is the host's own children, a shadow
 * component's tree belongs inside `<template shadowrootmode="open">`. Guessing
 * wrong is not cosmetic — light children under a host that later calls
 * `attachShadow` are discarded on upgrade, so the content paints and vanishes.
 *
 * These assert aihu's OWN vocabulary crosses the wire ('light' | 'shadow'),
 * never the DOM's ShadowRootMode ('open' | 'closed'). Those are different enums
 * sharing the word "mode"; the translation happens once, in the renderer.
 */
describe('__aihu_shadow__ export (server target)', () => {
  it("exports 'light' when the component resolves to light DOM", async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'light' })
    expect(code).toMatch(/export const __aihu_shadow__ = ["']light["']/)
  })

  it("exports 'shadow' when the component resolves to shadow DOM", async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'shadow' })
    expect(code).toMatch(/export const __aihu_shadow__ = ["']shadow["']/)
  })

  // The DOM's vocabulary must not leak into the module contract.
  it('never emits the DOM ShadowRootMode vocabulary', async () => {
    for (const mode of ['light', 'shadow'] as const) {
      const { code } = await runPlugin(SERVER_ENV, { shadowMode: mode })
      expect(code).not.toMatch(/__aihu_shadow__ = ["'](open|closed)["']/)
    }
  })

  // A lie a consumer would branch on: `'undefined'` is a truthy string, so an
  // unguarded emission would read as a real mode.
  it("never emits the string 'undefined'", async () => {
    const { code } = await runPlugin(SERVER_ENV, { shadowMode: 'shadow' })
    expect(code).not.toContain("__aihu_shadow__ = 'undefined'")
  })

  // Client target stamps its mode into defineElement options directly and needs
  // no export — same rule the scope-id export follows.
  it('is absent from the client target', async () => {
    const { code } = await runPlugin(
      { environment: { config: { consumer: 'client' } } },
      { shadowMode: 'shadow' },
    )
    expect(code).not.toContain('__aihu_shadow__')
  })
})

// ─── __aihu_child_tags__ ─────────────────────────────────────────────────────
//
// The edges of the component graph. `buildChildRegistry` indexes every
// discovered component once — it does NOT walk this transitively per page —
// and uses these edges to DETECT cycles, which it reports as a warning rather
// than rejecting: the derivation cannot see a guarded reference, so an ordinary
// recursive component (tree, nested menu, comment thread) would otherwise fail
// its build. See `@aihu/server`'s `child-registry.ts`.
//
// The export is DERIVED from the emitted `__aihu_schild` call sites rather than
// recomputed from the template, because the set that matters is exactly the set
// of tags the compiled renderer will look up at runtime. The parity test below
// is what keeps that true: if the derivation and the emission ever disagree, a
// registry built from this export would miss a lookup and that child would
// silently render empty.

const CHILD_SFC = `@template {
  <main class="page">
    <h1>Title</h1>
    <y-kid></y-kid>
    <x-kid></x-kid>
    <x-kid></x-kid>
  </main>
}
`

async function runWith(
  source: string,
  thisArg: unknown,
  options?: Parameters<typeof aihuCompilerPlugin>[0],
): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-child-tags-'))
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

/** The declared child-tag set, parsed out of the emitted module. */
function childTagsOf(code: string): string[] {
  const m = /__aihu_child_tags__\s*=\s*(\[[^\]]*\])/.exec(code)
  if (!m) return []
  // Quote-agnostic: oxc decides the final quote style, and this test is about
  // the tag set, not the formatter.
  return (m[1].match(/["']([^"']+)["']/g) ?? []).map((q) => q.slice(1, -1)).sort()
}

/** The tags the emitted renderer will actually look up at runtime. */
function calledTagsOf(code: string): string[] {
  return [
    ...new Set(
      Array.from(code.matchAll(/__aihu_schild\(\s*["']([^"']+)["']/g), (m) => m[1] as string),
    ),
  ].sort()
}

describe('__aihu_child_tags__ export (server target)', () => {
  it('lists every referenced component tag, deduped and sorted', async () => {
    const code = await runWith(CHILD_SFC, SERVER_ENV)
    // Parsed, not string-matched: the emitted module goes through oxc after
    // this export is appended, which renormalises quotes and spacing. Asserting
    // on the literal text would pin a formatter, not the contract.
    expect(childTagsOf(code)).toEqual(['x-kid', 'y-kid'])
  })

  it('agrees exactly with the emitted __aihu_schild call sites', async () => {
    // The parity check the derivation rests on. A registry built from the
    // export must cover every lookup the renderer performs; anything the
    // renderer looks up but the export omits renders empty with no error.
    const code = await runWith(CHILD_SFC, SERVER_ENV)
    const called = calledTagsOf(code)
    expect(childTagsOf(code)).toEqual(called)
    // Guard against the whole check passing because BOTH sides are empty —
    // agreeing on nothing is the failure mode this test exists to catch.
    expect(called.length).toBeGreaterThan(0)
  })

  it('is omitted when the template references no component', async () => {
    // "No export" and "empty" must mean the same thing to a consumer, so the
    // empty array is never emitted.
    const code = await runWith(SFC, SERVER_ENV)
    expect(code).not.toContain('__aihu_child_tags__')
  })

  it('is absent from a client build', async () => {
    // Same reasoning as the sibling exports: the registry is a server-side
    // build input, and the client resolves children by upgrading elements.
    const code = await runWith(CHILD_SFC, {})
    expect(code).not.toContain('__aihu_child_tags__')
  })
})

// ─── _injectShadowMode must not corrupt the module it edits ─────────────────

const COND_SFC = `@state {
  const [n, setN] = signal(9)
}

@template {
  <div><span if={n > 5}>big</span></div>
}
`

// A `(` in TEXT CONTENT lands in the emitted module as a string literal —
// `leaf('(open ')` on the client target, where the whole setup body sits
// INSIDE `defineComponent(...)`'s argument span.
const PAREN_TEXT_SFC = `@state {
  const [n, setN] = signal(1)
}

@template {
  <p>(open {n}</p>
}
`

// $form is the one shape whose Rust emit ALREADY carries a third defineElement
// argument: `defineComponent(...), { formAssociated: true })`.
const FORM_SFC = `@state {
  const [name, setName] = signal('')
  $form: { value: name }
}

@template {
  <div><em if={name() !== ''}>set</em></div>
}
`

describe('_injectShadowMode anchors on defineElement, not the last paren', () => {
  // The corruption the SSR-child review reported is REAL and these tests
  // reproduce it: the original greedy anchor (`defineComponent\([^]*\)\s*\)` —
  // `[^]` crosses newlines) matched the LAST `)\s*)` pair in the module, and
  // on a server-target module the string renderer is emitted AFTER the
  // registration, so for a component with an `if=` the injection landed in the
  // emitted condition: `if ((n() > 5), { shadowMode: 'light', … })` — comma
  // operator, always truthy, dead branch renders.
  //
  // The first repro attempt concluded the old anchor was clean because its
  // probe, `/if \([^)]*shadowMode/`, can NEVER match the real corruption:
  // the emitted condition `(n() > 5)` contains `)`, which `[^)]` forbids.
  // The detection below is line-scoped (`.` stops at newline) instead, and
  // DOES fail against the old anchor.
  //
  // The first replacement (a bare balanced-paren count) had the opposite
  // failure: it read parens inside string literals — `leaf('(')` — drifted,
  // and silently bailed on client/universal modules, stripping the injection
  // entirely (no shadowMode, no lightScopeId). The PAREN_TEXT_SFC test fails
  // against that version. The current implementation lexes strings, template
  // literals, and comments while matching, and merges into `$form`'s existing
  // options object rather than bailing on it.
  it('server target: options land on defineElement, never in the string renderer’s if-condition', async () => {
    const code = await runWith(COND_SFC, SERVER_ENV, { shadowMode: 'light' })
    expect(code).not.toMatch(/if\s*\(.*shadowMode/)
    expect(code).toMatch(/defineComponent\(__aihu_setup__\)\s*,\s*\{\s*shadowMode:\s*["']light["']/)
  })

  it('client build: injects too, outside any condition', async () => {
    const code = await runWith(COND_SFC, {}, { shadowMode: 'light' })
    expect(code).toMatch(/,\s*\{\s*shadowMode:\s*["']light["']/)
    expect(code).not.toMatch(/if\s*\(.*shadowMode/)
  })

  it('a `(` in text content must not starve the client injection', async () => {
    // A silent bail here costs the component its shadowMode AND lightScopeId —
    // strictly worse than the corruption the anchor change was fixing.
    const code = await runWith(PAREN_TEXT_SFC, {}, { shadowMode: 'light' })
    expect(code).toMatch(/,\s*\{\s*shadowMode:\s*["']light["']/)
  })

  it('…and on the server target the same shape stays uncorrupted', async () => {
    // The old anchor's other server casualty: the last `)\s*)` after an
    // interpolated text node is the `__aihu_stext(n())` call, which became
    // `__aihu_stext(n(), { shadowMode: … })`.
    const code = await runWith(PAREN_TEXT_SFC, SERVER_ENV, { shadowMode: 'light' })
    expect(code).toMatch(/defineComponent\(__aihu_setup__\)\s*,\s*\{\s*shadowMode:\s*["']light["']/)
    expect(code).not.toMatch(/__aihu_stext\(.*shadowMode/)
  })

  it('$form: merges into the existing formAssociated options, leaves setFormValue alone', async () => {
    // Old anchor: landed inside `setFormValue(name(), …)` on EVERY target.
    // Naive scan: bailed on the existing `, { formAssociated: true }` arg.
    for (const env of [SERVER_ENV, {}]) {
      const code = await runWith(FORM_SFC, env, { shadowMode: 'light' })
      expect(code).toMatch(/shadowMode:\s*["']light["'][^}]*formAssociated:\s*true/)
      expect(code).not.toMatch(/setFormValue\(.*shadowMode/)
    }
  })
})
