/**
 * Wave 3c — island classification tests.
 *
 * Classification is now AUTHORITATIVE in the Rust codegen: the compiler emits
 * a `// @aihu:island static|interactive` marker computed from the IR, and the
 * Vite plugin reads it via `_parseIslandMarker`. This REPLACES the old
 * `_classifyIsland` regex post-pass (which re-scanned generated code for
 * `signal(`/`effect(`/… — a Derived-property violation).
 *
 * Four layers:
 *   1. `_parseIslandMarker` unit tests (pure JS, no binary).
 *   2. compiler-driven classification matrix (needs the Rust binary) — the
 *      authoritative source of truth across a representative component matrix.
 *   3. differential vs. the OLD regex classifier on the same matrix: the new
 *      metadata preserves every decision the old post-pass made on reactivity-
 *      primitive components, and is STRICTER (correctly) on reactive props.
 *   4. end-to-end: a static component drops the runtime (no hydration) yet
 *      renders; an interactive one keeps the full defineComponent path.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@aihu/arbor'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _buildStaticIsland, _parseIslandMarker } from '../js/index.ts'

// ── Layer 1: `_parseIslandMarker` unit ──────────────────────────────────────

describe('_parseIslandMarker — reads the compiler marker', () => {
  it('parses a static marker', () => {
    expect(_parseIslandMarker('// @aihu:island static\nimport { branch } from "@aihu/arbor"')).toBe(
      'static',
    )
  })

  it('parses an interactive marker', () => {
    expect(
      _parseIslandMarker('// @aihu:island interactive\nimport { signal } from "@aihu/signals"'),
    ).toBe('interactive')
  })

  it('tolerates preceding shadow / extract markers (marker is not required at line 1)', () => {
    const code = [
      '// @aihu:shadow-default light',
      '// @aihu:extract read=agents call=anonymous',
      '// @aihu:island static',
      "import { branch } from '@aihu/arbor'",
    ].join('\n')
    expect(_parseIslandMarker(code)).toBe('static')
  })

  it('defaults to interactive when the marker is absent (old binary / unknown shape)', () => {
    // Fail SAFE: never strip the runtime out from under a component whose
    // classification we cannot read.
    expect(_parseIslandMarker('import { branch } from "@aihu/arbor"\n')).toBe('interactive')
  })

  it('does not match a marker mentioned inside a string literal / trailing text', () => {
    // The anchored `^…$` line form only matches a standalone marker line.
    expect(_parseIslandMarker("const s = '// @aihu:island static is a marker'\n")).toBe(
      'interactive',
    )
  })
})

// ── Binary resolution (shared by layers 2–4) ────────────────────────────────

const _dir = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(_dir, '../../..')
const COMPILER =
  process.env.AIHU_COMPILE_BIN ??
  process.env.AIHU_COMPILE_BIN ??
  [
    resolve(REPO_ROOT, 'target/release/aihu-compile'),
    resolve(REPO_ROOT, 'target/debug/aihu-compile'),
    resolve(_dir, '../bin/aihu-compile'),
  ].find((p) => existsSync(p)) ??
  ''
const HAVE_COMPILER = COMPILER !== ''

function compile(src: string, tag: string, path?: string): string {
  const args = ['--stdin', '--tag', tag]
  if (path) args.push('--path', path)
  const out = spawnSync(COMPILER, args, { input: src, encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`aihu-compile failed (${out.status}): ${out.stderr}`)
  return out.stdout
}

/**
 * The OLD `_classifyIsland` regex post-pass, inlined verbatim as the reference
 * oracle for the differential test. It is deleted from the plugin; this copy
 * exists only so the differential can prove the new metadata preserves its
 * decisions on the reactivity-primitive cases.
 */
function oldRegexClassify(compiledCode: string): 'static' | 'interactive' {
  return /\b(?:signal|computed|effect|setSignal|onMount|onCleanup)\s*\(/.test(compiledCode)
    ? 'interactive'
    : 'static'
}

// The matrix. `expected` is the AUTHORITATIVE (new) classification.
const MATRIX: Array<{
  name: string
  tag: string
  src: string
  expected: 'static' | 'interactive'
}> = [
  {
    name: 'pure-static (declarative DOM only)',
    tag: 'x-pure-static',
    expected: 'static',
    src: '@template {\n  <p>Hello world</p>\n}\n',
  },
  {
    name: 'static-body interpolation (non-reactive const)',
    tag: 'x-static-text',
    expected: 'static',
    src: "@state {\n  const greeting = 'hello'\n}\n@template {\n  <p>{greeting}</p>\n}\n",
  },
  {
    name: 'handler-only (inert on:click, no reactive refs)',
    tag: 'x-handler',
    expected: 'static',
    src: "@template {\n  <button on:click={() => console.log('hi')}>Go</button>\n}\n",
  },
  {
    name: 'one-signal (state())',
    tag: 'x-counter',
    expected: 'interactive',
    src: '@state {\n  let count = state(0)\n}\n@template {\n  <span>{count}</span>\n}\n',
  },
  {
    name: 'effect-only',
    tag: 'x-effect',
    expected: 'interactive',
    src: "@state {\n  effect(() => { console.log('tick') })\n}\n@template {\n  <p>x</p>\n}\n",
  },
  {
    name: 'static-body but reactive PROPS (parent-driven inputs)',
    tag: 'x-prop',
    expected: 'interactive',
    src: "@state {\n  const name = prop({ default: 'x' })\n}\n@template {\n  <p>Hi {name}</p>\n}\n",
  },
  {
    name: 'agent/GX component (exposed action + state)',
    tag: 'x-agent',
    expected: 'interactive',
    src: [
      '@state {',
      "  const city = prop({ default: 'London', expose: 'read' })",
      "  let forecast = state('')",
      "  const fetchForecast = action(() => { forecast = 'sunny' })",
      '}',
      '@template {',
      '  <div>{city} — {forecast}</div>',
      '}',
    ].join('\n'),
  },
]

// ── Layer 2: compiler-driven classification matrix ──────────────────────────

describe('island classification — authoritative compiler marker', () => {
  for (const c of MATRIX) {
    it.skipIf(!HAVE_COMPILER)(`classifies ${c.name} as ${c.expected}`, () => {
      const js = compile(c.src, c.tag, `${c.tag}.aihu`)
      expect(_parseIslandMarker(js)).toBe(c.expected)
    })
  }
})

// ── Layer 3: differential vs. the OLD regex classifier ──────────────────────

describe('differential — new marker vs. OLD `_classifyIsland` regex', () => {
  // On components that reach for reactivity primitives, the compiler marker and
  // the old regex AGREE — the metadata preserves the old post-pass's decisions.
  const AGREE = MATRIX.filter((c) => c.tag !== 'x-prop')
  for (const c of AGREE) {
    it.skipIf(!HAVE_COMPILER)(`agrees with the old classifier on ${c.name}`, () => {
      const js = compile(c.src, c.tag, `${c.tag}.aihu`)
      expect(_parseIslandMarker(js)).toBe(oldRegexClassify(js))
    })
  }

  // The ONE deliberate divergence: a component whose own body is inert but which
  // declares `$prop`s. The old regex saw no `signal(` CALL (props synthesize
  // their signals in the runtime, not in the emitted module) and wrongly called
  // it `static` — which would ship it through the static-island shim that cannot
  // lower the options-form `defineComponent({ props, setup })`. The compiler,
  // knowing the props are reactive parent-driven inputs, correctly classifies it
  // `interactive`. This is a CORRECTNESS improvement, not a regression.
  it.skipIf(!HAVE_COMPILER)(
    'is STRICTER than the old regex on reactive props (documented correctness fix)',
    () => {
      const prop = MATRIX.find((c) => c.tag === 'x-prop')!
      const js = compile(prop.src, prop.tag, `${prop.tag}.aihu`)
      expect(oldRegexClassify(js)).toBe('static') // the old latent bug
      expect(_parseIslandMarker(js)).toBe('interactive') // the fix
      // Confirm the shape the old shim would have mangled is present.
      expect(js).toMatch(/defineComponent\(\{/)
    },
  )
})

// ── Layer 4: static components skip hydration; interactive ones keep it ──────

const TMP_DIR = resolve(_dir, '.tmp-classify-island')

describe('static island skips hydration and still renders; interactive keeps the runtime', () => {
  let jsdom: JSDOM

  beforeAll(() => {
    if (!HAVE_COMPILER) return
    _setMount(mount as never)
    _setSignal(signal)
    jsdom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true })
    const g = globalThis as unknown as Record<string, unknown>
    g.window = jsdom.window as unknown
    g.document = jsdom.window.document
    g.customElements = jsdom.window.customElements
    g.HTMLElement = jsdom.window.HTMLElement
    g.CustomEvent = jsdom.window.CustomEvent
    g.CSSStyleSheet = class {
      replaceSync(): void {}
    }
  })

  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it.skipIf(!HAVE_COMPILER)(
    'a static component ships the zero-runtime shim (no defineComponent walk) and renders',
    async () => {
      const src = '@template {\n  <p>Hello island</p>\n}\n'
      const js = compile(src, 'x-static-render', 'x-static-render.aihu')
      // The compiler classified it static → the plugin takes the shim path.
      expect(_parseIslandMarker(js)).toBe('static')
      const shimmed = _buildStaticIsland(js, 'x-static-render')

      // Skip-hydration proof: the runtime import + defineComponent owner walk
      // are GONE — there is no reactive hydration for the browser to perform.
      expect(shimmed).not.toMatch(/from\s*'@aihu\/runtime'/)
      expect(shimmed).not.toMatch(/\bdefineComponent\(/)
      expect(shimmed).toMatch(/AIHU_STATIC_ISLAND/)

      // …yet it still renders correctly once mounted.
      mkdirSync(TMP_DIR, { recursive: true })
      const modPath = resolve(TMP_DIR, 'x-static-render.ts')
      writeFileSync(modPath, shimmed, 'utf8')
      await import(/* @vite-ignore */ modPath)
      const el = jsdom.window.document.createElement('x-static-render')
      jsdom.window.document.body.appendChild(el)
      const sr = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot
      expect(sr?.querySelector('p')?.textContent?.trim()).toBe('Hello island')
    },
  )

  it.skipIf(!HAVE_COMPILER)(
    'an interactive component keeps the full defineComponent hydration path',
    () => {
      const src = '@state {\n  let count = state(0)\n}\n@template {\n  <span>{count}</span>\n}\n'
      const js = compile(src, 'x-live-counter', 'x-live-counter.aihu')
      expect(_parseIslandMarker(js)).toBe('interactive')
      // The interactive path retains defineComponent (the hydration entrypoint)
      // and the signals runtime — the shim must NOT be applied to it.
      expect(js).toMatch(/\bdefineComponent\(/)
      expect(js).toMatch(/from\s*'@aihu\/signals'/)
    },
  )
})
