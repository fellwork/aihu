/**
 * Bug 6 — end-to-end Vite-build assertion for utility-CSS bundle emission.
 *
 * The original `css-engine-hook.test.ts` only inspects the COMPILED JS STRING
 * returned by the plugin's `transform()` hook in isolation. That is necessary
 * but NOT sufficient — Bug 6 shipped because the JS string contained the right
 * `__style__.replaceSync(...)` content while the bundled CSS asset contained
 * NONE of those rules (the `host.adoptedStyleSheets` target is silently
 * dropped on an element with no shadow root).
 *
 * This test runs Vite's `build()` API programmatically against an in-fixture
 * `.aihu` source under `examples/css-engine-utility/src/` (which has all the
 * arbor / runtime / signals peer-deps already linked) and asserts that the
 * emitted CSS asset (`dist/assets/*.css`) contains the utility rules. That is
 * the user-visible contract.
 *
 * Implementation note: Vite's `build()` is invoked through a subprocess (bun
 * spawned from this test), NOT in-process. Reason: vitest's own runtime
 * intercepts `await import('vite')` + the deprecated `transformWithEsbuild`
 * path in a way that prevents TS-stripping in the compiler plugin output
 * (the same plugin works perfectly when invoked from a stock bun runtime).
 * Spawning a subprocess gives us the exact same execution context as
 * `bun run build` in a consumer project — which is the contract we are
 * actually validating.
 *
 * Skipped (with a clear `it.runIf` note) when the native `aihu-css-compile`
 * binary is not built, mirroring `css-engine-hook.test.ts`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ext = process.platform === 'win32' ? '.exe' : ''
const compilerBin = resolve(__dirname, `../bin/aihu-compile${ext}`)
const cssCoreBin =
  existsSync(resolve(__dirname, `../../../target/release/aihu-css-compile${ext}`)) ||
  existsSync(resolve(__dirname, `../../../target/debug/aihu-css-compile${ext}`))

// Bug 6 follow-up — fail loudly in CI when the native binary is missing.
// Previously this test used `it.runIf(cssCoreBin)` and silently skipped when
// the binary was absent, which is exactly the false-confidence pattern that
// let the prior Bug 2 fix ship a non-working feature. In CI (`process.env.CI`
// is set on all major providers including GitHub Actions), a missing binary
// is a build setup error, not a "skip me" signal — we want a red bar so the
// CI lane is fixed, not a silent green. Locally, the soft-skip still applies.
if (process.env.CI && !cssCoreBin) {
  throw new Error(
    'Bug 6 e2e test cannot run in CI without the native aihu-css-compile binary. ' +
      'Build it with `cargo build --release -p aihu-css-core` in the CI prep step, ' +
      'or add the platform optional dep (e.g. @aihu/css-engine-linux-x64-gnu) to the workflow install step. ' +
      'Soft-skipping in CI hides the same class of bug this test exists to catch.',
  )
}

// Re-use the example workspace as the build root. It has the right peer
// dependencies (arbor, runtime, signals) installed by `bun install` at the
// repo root, the right `viteAihuPlugin` + css-engine wiring, and a known-good
// vite version (^6) pinned in its package.json.
const EXAMPLE_ROOT = resolve(__dirname, '../../../examples/css-engine-utility')
const TEST_DIST = 'dist-test-bug6'
const TEST_FIXTURE_SFC = resolve(EXAMPLE_ROOT, 'src', '__bug6_test_widget.aihu')
const TEST_FIXTURE_ENTRY = resolve(EXAMPLE_ROOT, 'src', '__bug6_test_main.ts')
const TEST_VITE_CONFIG = resolve(EXAMPLE_ROOT, '__bug6_test_vite.config.ts')

describe("Bug 6 — Vite build emits utility CSS into bundle when shadowMode='none'", () => {
  it.runIf(cssCoreBin && existsSync(EXAMPLE_ROOT) && existsSync(compilerBin))(
    'emits `.flex { display: flex }` into a CSS asset in dist/',
    () => {
      try {
        // Minimal SFC with utility classes — the same classes the bigger
        // example index.aihu uses, just isolated so the assertion is precise.
        writeFileSync(
          TEST_FIXTURE_SFC,
          `@template {
  <section class="flex gap-6 p-4">
    <span class="text-lg">hi</span>
  </section>
}
`,
          'utf8',
        )
        writeFileSync(TEST_FIXTURE_ENTRY, `import './__bug6_test_widget.aihu'\n`, 'utf8')

        // A minimal vite.config.ts that wires JUST the compiler plugin with
        // `shadowMode: 'none'` + `islands: false` — the exact production
        // shape forwarded by `viteAihuPlugin({ css: { shadowMode: 'none' }})`.
        writeFileSync(
          TEST_VITE_CONFIG,
          `import { defineConfig } from 'vite'
import { aihuCompilerPlugin } from '@aihu/compiler'

export default defineConfig({
  plugins: [aihuCompilerPlugin({ islands: false, shadowMode: 'none' })],
  build: {
    outDir: '${TEST_DIST}',
    emptyOutDir: true,
    cssMinify: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: 'src/__bug6_test_main.ts',
      output: { format: 'es' },
    },
  },
})
`,
          'utf8',
        )

        // Spawn bun + vite. This is the consumer-side `bun run build` path.
        const r = spawnSync('bunx', ['vite', 'build', '--config', '__bug6_test_vite.config.ts'], {
          cwd: EXAMPLE_ROOT,
          encoding: 'utf8',
          env: { ...process.env, SCRIBE_COMPILE_BIN: compilerBin },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        if (r.status !== 0) {
          throw new Error(
            `vite build failed (exit ${r.status}):\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`,
          )
        }

        // Locate the emitted CSS asset(s) and assert the utility rules.
        const distAssets = resolve(EXAMPLE_ROOT, TEST_DIST, 'assets')
        expect(existsSync(distAssets), `dist assets dir at ${distAssets}`).toBe(true)
        const files = readdirSync(distAssets)
        const cssFiles = files.filter((f) => f.endsWith('.css'))
        expect(cssFiles.length, 'a CSS asset should be emitted').toBeGreaterThan(0)

        const combinedCss = cssFiles
          .map((f) => readFileSync(resolve(distAssets, f), 'utf8'))
          .join('\n')

        // The user-visible contract: utility rules must be in the bundled CSS
        // asset (NOT a JS template literal targeting `host.adoptedStyleSheets`,
        // which was the original Bug 6 failure mode).
        expect(combinedCss).toMatch(/\.flex\s*\{\s*display\s*:\s*flex/)
        expect(combinedCss).toMatch(/\.gap-6\s*\{[^}]*gap\s*:\s*1\.5rem/)
        expect(combinedCss).toMatch(/\.text-lg\s*\{[^}]*font-size\s*:\s*1\.125rem/)

        // The compiled JS should NOT contain the utility classes inside a
        // `__style__.replaceSync(...)` call — that was the broken path that
        // wrote rules to an inert `host.adoptedStyleSheets` setter.
        const jsFiles = files.filter((f) => f.endsWith('.js'))
        const combinedJs = jsFiles
          .map((f) => readFileSync(resolve(distAssets, f), 'utf8'))
          .join('\n')
        expect(combinedJs).not.toMatch(/__style__\.replaceSync\([^)]*\.flex/)
      } finally {
        rmSync(TEST_FIXTURE_SFC, { force: true })
        rmSync(TEST_FIXTURE_ENTRY, { force: true })
        rmSync(TEST_VITE_CONFIG, { force: true })
        // Drop the sidecar `.ts` the compiler writes adjacent to the SFC.
        rmSync(`${TEST_FIXTURE_SFC}.ts`, { force: true })
        rmSync(resolve(EXAMPLE_ROOT, TEST_DIST), { recursive: true, force: true })
      }
    },
    120_000,
  )
})
