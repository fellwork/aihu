/**
 * scaffold-css-engine — OOTB `@aihu/css-engine` scaffold option.
 *
 * Covers the Director-specified acceptance for the legacy `scaffoldApp()`
 * css-engine path:
 *   - `{ css: 'engine' }` (default open) → `@aihu/css-engine` in deps, NO `css`
 *     block in vite.config (open is the compiler default), utility-class starter
 *     with no `@style` block.
 *   - `{ css: 'engine', shadowMode: 'none' | 'closed' }` → explicit
 *     `css: { shadowMode }` block emitted.
 *   - `{ css: 'engine', shadowMode: 'open' }` (explicit) → still NO `css` block.
 *   - Default (no opts) scaffold is byte-identical to the no-css path (the
 *     legacy-snapshot.golden test is the cross-process gate; here we assert the
 *     pure generators are unchanged).
 *   - The css-engine starter ACTUALLY EMITS utility CSS — proved by running the
 *     real compiler plugin transform and asserting the scoped declarations fold
 *     into the shadow `__style__` (open) / route to a virtual CSS import (none).
 *     Tests-pass-alone is insufficient (project lesson); this is the
 *     user-visible behavioural check.
 *   - Flag parsing for `--css engine|none`, `--css-engine`, `--shadow …`.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AihuCompilerPluginOptions, aihuCompilerPlugin } from '../../compiler/js/index.ts'
import { appIndexAihu, appPackageJson, appViteConfig, scaffoldApp } from '../src/index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

// ── Pure-generator assertions (deterministic, no I/O) ────────────────────────

describe('scaffold css-engine · package.json', () => {
  it('adds @aihu/css-engine to dependencies when css-engine is on', () => {
    const pkg = JSON.parse(appPackageJson('x', 'bun', true)) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBe('latest')
  })

  it('omits @aihu/css-engine when off (default)', () => {
    const pkg = JSON.parse(appPackageJson('x', 'bun')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBeUndefined()
  })
})

describe('scaffold css-engine · vite.config.ts', () => {
  it('open mode (default) emits NO css block but adds the clarifying comment', () => {
    const cfg = appViteConfig('demo', true, 'open')
    expect(cfg).not.toContain('      css: { shadowMode')
    expect(cfg).toContain('fold into each')
  })

  it('shadowMode: none emits an explicit css block', () => {
    const cfg = appViteConfig('demo', true, 'none')
    expect(cfg).toContain("css: { shadowMode: 'none' },")
  })

  it('shadowMode: closed emits an explicit css block', () => {
    const cfg = appViteConfig('demo', true, 'closed')
    expect(cfg).toContain("css: { shadowMode: 'closed' },")
  })

  it('css off (default) emits the base config: optimizeDeps + agentReadiness, no css block', () => {
    const cfg = appViteConfig('demo')
    // Gap 1: dev-server fix — @aihu/app must be excluded from esbuild pre-bundle.
    expect(cfg).toContain("optimizeDeps: { exclude: ['@aihu/app'] }")
    // Gap 2: the agent surface is enabled by default. Its skills are DERIVED
    // from the @aihu/agent registry at runtime, NOT a hand-written literal —
    // so the emitted config carries no `skills:` array (thesis §2, Derived).
    expect(cfg).toContain('viteAgentReadinessIntegration(')
    expect(cfg).toContain("from '@aihu-plugin/agent-readiness'")
    expect(cfg).toContain("name: 'demo'")
    expect(cfg).not.toContain('skills:')
    expect(cfg).not.toContain("name: 'increment'")
    expect(cfg).toContain("dir: { pages: 'src/pages' }")
    // css off → no shadowMode block and no css-engine comment.
    expect(cfg).not.toContain('      css: { shadowMode')
    expect(cfg).not.toContain('fold into each')
  })
})

describe('scaffold css-engine · index.aihu starter', () => {
  it('uses utility classes and drops the @style block when on', () => {
    const sfc = appIndexAihu('myapp', true)
    expect(sfc).toContain('class="flex flex-col gap-8 max-w-7xl mx-auto p-8"')
    expect(sfc).toContain('class="text-3xl font-bold"')
    expect(sfc).not.toContain('@style')
    // signal counter retained
    expect(sfc).toContain('const [count, setCount] = signal(0)')
    // the agent-surface section dramatizes the human + agent control panel
    expect(sfc).toContain('Agent surface')
  })

  it('keeps the hand-written @style starter byte-identical when off', () => {
    expect(appIndexAihu('myapp', false)).toBe(appIndexAihu('myapp'))
    expect(appIndexAihu('myapp')).toContain('@style {')
  })
})

// ── scaffoldApp end-to-end (writes files) ────────────────────────────────────

describe('scaffold css-engine · scaffoldApp() writes the right tree', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aihu-css-scaffold-'))
  })
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('css: engine (default open) — deps + no css block + utility starter', () => {
    scaffoldApp('app', dir, { css: 'engine' })
    const root = join(dir, 'app')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBe('latest')

    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8')
    expect(vite).not.toContain('      css: { shadowMode')

    const sfc = readFileSync(join(root, 'src/pages/index.aihu'), 'utf8')
    expect(sfc).toContain('class="flex flex-col gap-8 max-w-7xl mx-auto p-8"')
    expect(sfc).not.toContain('@style')
  })

  it('css: engine + shadowMode none — explicit css block', () => {
    scaffoldApp('app', dir, { css: 'engine', shadowMode: 'none' })
    const vite = readFileSync(join(dir, 'app', 'vite.config.ts'), 'utf8')
    expect(vite).toContain("css: { shadowMode: 'none' },")
  })

  it('default (no opts) does not emit css-engine — byte-stable plain path', () => {
    scaffoldApp('app', dir)
    const root = join(dir, 'app')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@aihu/css-engine']).toBeUndefined()
    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8')
    expect(vite).not.toContain('      css: { shadowMode')
    expect(vite).not.toContain('css-engine')
    const sfc = readFileSync(join(root, 'src/pages/index.aihu'), 'utf8')
    expect(sfc).toContain('@style {')
  })
})

// ── User-visible behaviour: the utilities actually emit ──────────────────────
//
// Gate on the css-core binary the same way css-engine-hook.test.ts does. When
// it resolves, run the REAL compiler plugin transform over the scaffolded
// open-mode starter and assert the scoped utility CSS folds into the shadow
// `__style__`; for `none`, assert it routes to a virtual CSS import instead.

const ext = process.platform === 'win32' ? '.exe' : ''
const compilerBin = resolve(HERE, `../../compiler/bin/aihu-compile${ext}`)
if (existsSync(compilerBin)) {
  process.env.SCRIBE_COMPILE_BIN ??= compilerBin
}
const cssCoreBin =
  existsSync(resolve(HERE, `../../../target/release/aihu-css-compile${ext}`)) ||
  existsSync(resolve(HERE, `../../../target/debug/aihu-css-compile${ext}`))

type TransformFn = (
  this: unknown,
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | null | undefined>

async function transformStarter(
  source: string,
  options?: AihuCompilerPluginOptions,
): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-css-emit-'))
  try {
    const plugin = aihuCompilerPlugin(options)
    const transform = plugin.transform as unknown as TransformFn
    // The starter now carries a `@route` block, which the compiler only accepts
    // under a `src/pages/` path (C500), so compile it at that path.
    const res = await transform.call({}, source, join(tmp, 'src', 'pages', 'index.aihu'))
    if (res == null) throw new Error('plugin returned no result')
    return res.code
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

describe('scaffold css-engine · utilities actually emit (compiler transform)', () => {
  const starter = appIndexAihu('myapp', true)

  it.runIf(cssCoreBin)(
    'open mode folds scoped utility CSS into the component shadow __style__',
    async () => {
      const out = await transformStarter(starter)
      expect(out).toContain('new CSSStyleSheet()')
      expect(out).toContain('adoptedStyleSheets')
      // flex → display: flex; p-8 → padding: 2rem; max-w-7xl → max-width: 80rem
      expect(out).toContain('display: flex')
      expect(out).toContain('padding: 2rem')
      expect(out).toContain('max-width: 80rem')
    },
  )

  it.runIf(cssCoreBin)('none mode routes utility CSS to a virtual CSS import', async () => {
    const out = await transformStarter(starter, { shadowMode: 'none' })
    expect(out).toContain('virtual:aihu-utility')
  })
})
