/**
 * css-engine hook — end-to-end + no-op tests.
 *
 * The compiler's Vite plugin (`aihuCompilerPlugin`) optionally folds the
 * scoped utility CSS produced by `@aihu/css-engine`'s `compileSfc()` into a
 * compiled `.aihu` component's shadow `<style>`. css-engine is wired in via a
 * GUARDED, LAZY `await import('@aihu/css-engine')` so the compiler never
 * hard-depends on it (css-engine already depends on the compiler for the AST —
 * a hard edge back would be a dependency cycle). css-engine is an OPTIONAL
 * peerDependency.
 *
 * Coverage:
 *   1. css-engine PRESENT — an SFC with utility classes (`flex gap-2 p-4`,
 *      `text-lg`) produces a component whose `__style__` stylesheet contains
 *      the scoped CSS for those utilities + `:host` theme tokens.
 *   2. The authored `@style` block still emits — exactly once, alongside.
 *   3. css-engine ABSENT (import throws) — the build still succeeds and emits
 *      NO scoped utility CSS (`__style__` absent). Backward-compatible no-op.
 *   4. Unit: `_foldCssEngineStyles` no-ops on empty CSS.
 *
 * Requires the native compiler + css-core binaries:
 *   cargo build --release -p aihu-css-core   (repo root)
 * and the compiler's own `bin/aihu-compile` (postinstall, present in-repo).
 * If css-engine cannot resolve its binary (e.g. a CI runner that did not build
 * the css-core crate), the PRESENT-path assertions are skipped with a clear
 * note while the ABSENT-path + unit tests always run.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _createCssEmitter,
  _foldCssEngineStyles,
  _rewriteHostSelector,
  type AihuCompilerPluginOptions,
  aihuCompilerPlugin,
} from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Point css-engine's bundled `compileToAst` (which spawns the compiler binary
// from a path relative to the css-engine package — that package does NOT ship
// the compiler binary) at this package's own compiler binary. Mirrors the
// plugin's own SCRIBE_COMPILE_BIN handshake so the test environment resolves
// identically to production.
const ext = process.platform === 'win32' ? '.exe' : ''
const compilerBin = resolve(__dirname, `../bin/aihu-compile${ext}`)
if (existsSync(compilerBin)) {
  process.env.SCRIBE_COMPILE_BIN ??= compilerBin
}

// Does the css-core binary resolve in this environment? Mirror css-engine's
// dev-fallback path (repo target/release|debug). When neither the per-platform
// package nor the dev build exists, the PRESENT-path tests are skipped.
const cssCoreBin =
  existsSync(resolve(__dirname, `../../../target/release/aihu-css-compile${ext}`)) ||
  existsSync(resolve(__dirname, `../../../target/debug/aihu-css-compile${ext}`))

/** Minimal Vite transform-hook signature the plugin exposes. */
type TransformFn = (
  this: unknown,
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | null | undefined>

/**
 * Run the plugin transform over `source` using a real on-disk `.aihu` id in a
 * throwaway tmp dir — the plugin always writes a `<id>.ts` sidecar next to the
 * source, so a tmp path keeps the repo clean. The tmp dir is removed after.
 */
async function runPlugin(
  source: string,
  stem: string,
  options?: AihuCompilerPluginOptions,
): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-css-hook-'))
  try {
    const plugin = aihuCompilerPlugin(options)
    const transform = plugin.transform as unknown as TransformFn
    const res = await transform.call({}, source, join(tmp, `${stem}.aihu`))
    if (res == null) throw new Error('plugin returned no result')
    return res.code
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const SFC_WITH_UTILITIES_AND_STYLE = `@template {
  <div class="flex gap-2 p-4">
    <span class="text-lg">hi</span>
  </div>
}

@style {
  .box { color: red; }
}`

const SFC_UTILITIES_ONLY = `@template {
  <div class="flex p-4"><span class="text-lg">hi</span></div>
}`

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@aihu/css-engine')
})

describe('css-engine hook — present (e2e)', () => {
  it.runIf(cssCoreBin)(
    'folds scoped utility CSS into the component shadow <style> (#1)',
    async () => {
      const out = await runPlugin(SFC_WITH_UTILITIES_AND_STYLE, 'x-widget')

      // A single adopted stylesheet is emitted.
      expect(out).toContain('new CSSStyleSheet()')
      expect(out).toContain('__style__.replaceSync(`')
      expect(out).toContain('adoptedStyleSheets = [__style__]')

      // The scoped CSS for the template's utility classes is present.
      expect(out).toContain('.flex { display: flex; }')
      expect(out).toContain('.gap-2 { gap: 0.5rem; }')
      expect(out).toContain('.p-4 { padding: 1rem; }')
      expect(out).toContain('.text-lg { font-size: 1.125rem')

      // :host theme tokens come through too (proof the FULL scoped sheet folds).
      expect(out).toContain(':host {')
      expect(out).toContain('--color-primary:')
    },
  )

  it.runIf(cssCoreBin)('keeps the authored @style block — emitted exactly once (#2)', async () => {
    const out = await runPlugin(SFC_WITH_UTILITIES_AND_STYLE, 'x-widget')
    expect(out).toContain('.box { color: red; }')
    // Exactly one occurrence — the css-engine output already folds @style, so
    // the codegen body must have been REPLACED (not appended) to avoid a dupe.
    const matches = out.match(/\.box \{ color: red; \}/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it.runIf(cssCoreBin)('folds utilities even when the SFC has NO @style block (#3)', async () => {
    const out = await runPlugin(SFC_UTILITIES_ONLY, 'x-plain')
    // No @style → codegen emits no __style__; the hook injects a fresh one.
    expect(out).toContain('new CSSStyleSheet()')
    expect(out).toContain('.flex { display: flex; }')
    expect(out).toContain('.p-4 { padding: 1rem; }')
    expect(out).toContain('adoptedStyleSheets = [__style__]')
  })
})

describe('css-engine hook — absent (no-op, backward compatible)', () => {
  it('build succeeds and emits NO utility CSS when css-engine cannot resolve (#4)', async () => {
    // Simulate css-engine being uninstalled: its import throws (the same
    // observable behaviour a consumer without the optional peer would see).
    vi.resetModules()
    vi.doMock('@aihu/css-engine', () => {
      throw new Error("Cannot find package '@aihu/css-engine'")
    })

    // Re-import the plugin AFTER the mock so its module-scope css-engine cache
    // is fresh and the guarded dynamic import hits the throwing mock.
    const mod = await import('../js/index.ts')
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-css-hook-noop-'))
    let out: string
    try {
      const plugin = mod.aihuCompilerPlugin()
      const transform = plugin.transform as unknown as TransformFn
      const res = await transform.call({}, SFC_WITH_UTILITIES_AND_STYLE, join(tmp, 'x-widget.aihu'))
      expect(res).not.toBeNull()
      out = res!.code
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }

    // The build still succeeds and produces a valid component.
    expect(out).toContain('customElements.define')
    // The authored @style block STILL emits (codegen path, unaffected).
    expect(out).toContain('.box { color: red; }')
    // …but NO css-engine utility CSS is folded in (the no-op path).
    expect(out).not.toContain('.flex { display: flex; }')
    expect(out).not.toContain('.text-lg { font-size:')
    expect(out).not.toContain('--color-primary:')
  })
})

describe('_foldCssEngineStyles — unit', () => {
  const COMPILED_NO_STYLE = `import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-w', defineComponent((_ctx) => {
  return branch('div', { class: 'flex' }, [])
}))`

  it('no-ops on empty / whitespace CSS (#5)', () => {
    expect(_foldCssEngineStyles(COMPILED_NO_STYLE, '')).toBe(COMPILED_NO_STYLE)
    expect(_foldCssEngineStyles(COMPILED_NO_STYLE, '   \n  ')).toBe(COMPILED_NO_STYLE)
  })

  it('injects a fresh stylesheet + adoption when no @style exists (#6)', () => {
    const out = _foldCssEngineStyles(COMPILED_NO_STYLE, '.flex { display: flex; }')
    expect(out).toContain('const __style__ = new CSSStyleSheet();')
    expect(out).toContain('.flex { display: flex; }')
    // The setup param was renamed _ctx → ctx and the adoption injected.
    expect(out).toContain('defineComponent((ctx) => {')
    expect(out).toContain('(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];')
  })

  it('REPLACES the @style replaceSync body (no duplication) when @style exists (#7)', () => {
    const compiledWithStyle = `import { branch } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __style__ = new CSSStyleSheet();
__style__.replaceSync(\`.box { color: red; }\`);
defineElement('x-w', defineComponent((ctx) => {
  (ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
  return branch('div', { class: 'flex' }, [])
}))`
    // css-engine output already includes the authored @style block.
    const engineOut = '.flex { display: flex; }\n.box { color: red; }'
    const out = _foldCssEngineStyles(compiledWithStyle, engineOut)
    // Exactly one __style__ declaration + one adoption (reused, not added).
    expect(out.match(/new CSSStyleSheet\(\)/g) ?? []).toHaveLength(1)
    expect(out.match(/adoptedStyleSheets = \[__style__\]/g) ?? []).toHaveLength(1)
    // The body is the css-engine output — `.box` appears once.
    expect(out.match(/\.box \{ color: red; \}/g) ?? []).toHaveLength(1)
    expect(out).toContain('.flex { display: flex; }')
  })

  it('escapes backticks / dollar-curly so CSS cannot break out of the literal (#8)', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this is the literal CSS we want to escape-test
    const dangerCss = '.x::before { content: "`${danger}`"; }'
    const out = _foldCssEngineStyles(COMPILED_NO_STYLE, dangerCss)
    expect(out).toContain('\\`')
    expect(out).toContain('\\${')
  })

  it("skips Shape 2 injection when shadowMode: 'none' (#9 — emit-shape A)", () => {
    // shadowMode='none' + no @style → utility/theme CSS is emitted as a
    // global asset by the plugin, not folded into __style__. The compiled
    // module is returned unchanged so no adopted-stylesheet code ships.
    const out = _foldCssEngineStyles(COMPILED_NO_STYLE, '.flex { display: flex; }', {
      shadowMode: 'none',
    })
    expect(out).toBe(COMPILED_NO_STYLE)
    expect(out).not.toContain('__style__')
    expect(out).not.toContain('adoptedStyleSheets')
  })

  it("still runs Shape 1 (@style replace) when shadowMode: 'none' (#10)", () => {
    const compiledWithStyle = `import { branch } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __style__ = new CSSStyleSheet();
__style__.replaceSync(\`.box { color: red; }\`);
defineElement('x-w', defineComponent((ctx) => {
  (ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
  return branch('div', { class: 'flex' }, [])
}))`
    const engineOut = '.flex { display: flex; }\n.box { color: red; }'
    const out = _foldCssEngineStyles(compiledWithStyle, engineOut, { shadowMode: 'none' })
    // Shape 1 still fires — the authored @style intent is preserved.
    expect(out).toContain('.flex { display: flex; }')
    expect(out.match(/new CSSStyleSheet\(\)/g) ?? []).toHaveLength(1)
  })
})

describe('_rewriteHostSelector — unit (emit-shape A)', () => {
  it('rewrites `:host { … }` to `[data-aihu-tag="<tag>"] { … }` (#11)', () => {
    expect(_rewriteHostSelector(':host { --x: 1; }', 'x-foo')).toBe(
      '[data-aihu-tag="x-foo"] { --x: 1; }',
    )
  })

  it('handles `:host(...)` modifier — strips the modifier (#12)', () => {
    expect(_rewriteHostSelector(':host(.dark) { color: red; }', 'x-bar')).toBe(
      '[data-aihu-tag="x-bar"] { color: red; }',
    )
  })

  it('leaves other selectors untouched (#13)', () => {
    const css = ':host { --x: 1; }\n.flex { display: flex; }\n.dark { color: black; }'
    const out = _rewriteHostSelector(css, 'x-y')
    expect(out).toContain('[data-aihu-tag="x-y"] { --x: 1; }')
    expect(out).toContain('.flex { display: flex; }')
    expect(out).toContain('.dark { color: black; }')
  })

  it('no-ops on empty input (#14)', () => {
    expect(_rewriteHostSelector('', 'x-y')).toBe('')
  })
})

describe('_createCssEmitter — unit (emit-shape A)', () => {
  it('de-dups per-tag entries — last write wins (#15)', () => {
    const emitter = _createCssEmitter()
    emitter.add('x-a', '.flex { display: flex; }')
    emitter.add('x-a', '.flex { display: flex; }') // duplicate
    const entries = emitter.entries()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.tag).toBe('x-a')
    expect(entries[0]?.css).toBe('.flex { display: flex; }')
  })

  it('aggregates across multiple tags (#16)', () => {
    const emitter = _createCssEmitter()
    emitter.add('x-a', '.a {}')
    emitter.add('x-b', '.b {}')
    const flushed = emitter.flush()
    expect(flushed).toContain('.a {}')
    expect(flushed).toContain('.b {}')
    // Per-tag banner comment so the merged output is auditable.
    expect(flushed).toContain('/* aihu css-engine: x-a */')
    expect(flushed).toContain('/* aihu css-engine: x-b */')
  })

  it('flush() returns empty when nothing was added; ignores whitespace-only (#17)', () => {
    const emitter = _createCssEmitter()
    expect(emitter.flush()).toBe('')
    emitter.add('x-a', '   \n  ')
    expect(emitter.flush()).toBe('')
  })
})
