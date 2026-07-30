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
  _foldCssEngineStyles,
  type AihuCompilerPluginOptions,
  aihuCompilerPlugin,
} from '../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Point css-engine's bundled `compileToAst` (which spawns the compiler binary
// from a path relative to the css-engine package — that package does NOT ship
// the compiler binary) at this package's own compiler binary. Mirrors the
// plugin's own AIHU_COMPILE_BIN handshake so the test environment resolves
// identically to production.
const ext = process.platform === 'win32' ? '.exe' : ''
const compilerBin = resolve(__dirname, `../bin/aihu-compile${ext}`)
if (existsSync(compilerBin)) {
  process.env.AIHU_COMPILE_BIN ??= compilerBin
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

// `bg-primary` (a brand-token-referencing utility) is load-bearing for test
// #1's `:host` token assertion below — theme tokens are now tree-shaken to
// only what's referenced (light-DOM leaf flip prep, LDF §10 step 2 / D4 §8
// Slice 2), so a fixture with no color utility emits no token block at all.
const SFC_WITH_UTILITIES_AND_STYLE = `@template {
  <div class="flex gap-2 p-4 bg-primary">
    <span class="text-lg">hi</span>
  </div>
}

@style {
  .box { color: red; }
}`

const SFC_UTILITIES_ONLY = `@template {
  <div class="flex p-4"><span class="text-lg">hi</span></div>
}`

// Exact repro from #278: an `@style` block must NOT suppress the utility-class
// scanner. Both the scanned utilities (text-3xl, gap-4) and the authored
// `@style` rule (.__probe__) must coexist in the folded shadow stylesheet.
const SFC_278_UTILITIES_AND_PROBE_STYLE = `@template {
  <div class="text-3xl gap-4">x</div>
}

@style {
  .__probe__ { color: rgb(1,2,3); }
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
      expect(out).toContain('.bg-primary { background-color: var(--color-primary); }')

      // :host theme tokens come through too (proof the FULL scoped sheet
      // folds) — only the referenced one, tokens are tree-shaken (LDF §10
      // step 2 / D4 §8 Slice 2).
      expect(out).toContain(':host {')
      expect(out).toContain('--color-primary:')
    },
  )

  it.runIf(cssCoreBin)(
    'shadow mode omits unreferenced tokens (tree-shake, LDF §10 step 2)',
    async () => {
      // SFC_UTILITIES_ONLY has no color utility — no token is referenced, so
      // no :host block should be emitted at all (pre-flip this unconditionally
      // dumped all 16 brand tokens regardless of use).
      const out = await runPlugin(SFC_UTILITIES_ONLY, 'x-plain-tokens')
      expect(out).not.toContain(':host {')
      expect(out).not.toContain('--color-primary')
    },
  )

  it.runIf(cssCoreBin)('light mode emits tokens at :root, not :host (LDF §10 step 2)', async () => {
    // A layout-shaped id triggers DA4's implicit page/layout light default
    // (no @route block needed — `_isLayoutFile`'s default `src/layouts/`
    // path match, `index.ts:1377`, is the simplest way to hit
    // `impliedShadowDefault === 'light'` without fabricating a full @route
    // SFC).
    const tmp = mkdtempSync(join(tmpdir(), 'aihu-css-hook-light-'))
    try {
      const plugin = aihuCompilerPlugin()
      const transform = plugin.transform as unknown as TransformFn
      const res = await transform.call(
        {},
        SFC_WITH_UTILITIES_AND_STYLE,
        join(tmp, 'src', 'layouts', 'app.aihu'),
      )
      if (res == null) throw new Error('plugin returned no result')
      const out = res.code
      // Light mode (Bug 6) routes utility CSS through a virtual `.css`
      // import (id prefixed with a NUL char, `VIRTUAL_UTILITY_PREFIX`)
      // instead of inlining it in the module body — resolve it via the
      // plugin's own `load` hook rather than grepping `out` directly. Avoid
      // embedding a raw NUL byte in this source file: match the stable
      // `virtual:aihu-utility/<hash>.css` suffix and prepend `\0` ourselves.
      const virtualIdMatch = out.match(/(virtual:aihu-utility\/[^"' ]+)["']/)
      expect(virtualIdMatch).not.toBeNull()
      const virtualCss = await plugin.load!(`\0${virtualIdMatch![1]}`)
      expect(virtualCss).toContain('--color-primary:')
      expect(virtualCss).toContain(':root {')
      expect(virtualCss).not.toContain(':host {')
      expect(out).not.toContain(':host {')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it.runIf(cssCoreBin)('keeps the authored @style block — emitted exactly once (#2)', async () => {
    const out = await runPlugin(SFC_WITH_UTILITIES_AND_STYLE, 'x-widget')
    // Authored @style is now re-rendered through the css-engine @style parser
    // (enables @apply), so it is whitespace-normalized to multi-line rather than
    // byte-identical. Assert the rule is present and folded EXACTLY ONCE (the
    // css-engine output already folds @style, so the codegen body must have been
    // REPLACED, not appended, to avoid a dupe) — tolerant of the reformatting.
    expect(out).toContain('.box {')
    expect(out).toContain('color: red')
    const matches = out.match(/\.box\s*\{[^}]*color:\s*red/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it.runIf(cssCoreBin)(
    'an @style block does NOT suppress scanned template utilities (#278)',
    async () => {
      const out = await runPlugin(SFC_278_UTILITIES_AND_PROBE_STYLE, 'x-probe')

      // Scanned template utilities survive alongside the @style block.
      expect(out).toContain('.gap-4 { gap: 1rem; }')
      expect(out).toContain('.text-3xl { font-size: 1.875rem')
      // The authored @style rule is folded in too — both coexist, exactly once.
      // (Whitespace-normalized through the @style parser; assert selector +
      // declaration presence, tolerant of the reformatting.)
      expect(out).toContain('.__probe__ {')
      expect(out).toContain('color: rgb(1,2,3)')
      const probeMatches = out.match(/\.__probe__\s*\{[^}]*color:\s*rgb\(1,2,3\)/g) ?? []
      expect(probeMatches).toHaveLength(1)
    },
  )

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
})
