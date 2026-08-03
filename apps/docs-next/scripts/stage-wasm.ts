#!/usr/bin/env bun
/**
 * Prebuild hook: stage the compiler WASM bundle for the in-browser playground.
 *
 * Thin wrapper over the shared `scripts/build-wasm-bundle.ts` (which owns the
 * real work: reuse-if-unchanged stamp → `wasm-pack build --target web` from the
 * WORKSPACE compiler → release-tarball fallback). This wrapper adds the two
 * app-specific concerns:
 *
 *   1. STRICT IN CI, SOFT LOCALLY. A missing wasm toolchain must never fail a
 *      local `bun run dev` — `<playground-embed>` already degrades to a clear
 *      "WASM bundle unavailable" notice at runtime. But a production deploy
 *      that silently ships a playground which cannot compile anything is the
 *      succeed-vacuously failure this repo keeps designing out, so under `CI`
 *      we pass `--strict` and the build goes red instead. apps/docs made the
 *      same call via its bespoke build.ts; docs-next has no build.ts, and an
 *      env gate keeps it out of package.json/workflow YAML entirely.
 *
 *   2. PRUNE NON-RUNTIME FILES. Everything under `public/` is copied verbatim
 *      to the dist root and served by Cloudflare Pages. `wasm-pack` emits
 *      `package.json`, `README.md`, and `.d.ts` files alongside the two files
 *      the browser actually loads; those should not be publicly reachable.
 *      (apps/docs/build.ts strips the identical list after its own staging.)
 *
 * Output (`public/wasm/`) is git-ignored — it is a build artifact, rebuilt from
 * the checkout so the playground grammar always matches this commit (#491).
 *
 * Usage: bun scripts/stage-wasm.ts   (run from apps/docs-next, via `prebuild`)
 */
import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '../..')
const outDir = join(appDir, 'public/wasm')

// Any non-empty CI value counts (GitHub Actions sets CI=true).
const strict = !!process.env.CI

const res = spawnSync(
  'bun',
  [join(repoRoot, 'scripts/build-wasm-bundle.ts'), outDir, ...(strict ? ['--strict'] : [])],
  { cwd: appDir, stdio: 'inherit' },
)

if (res.status !== 0) {
  console.error(`[stage-wasm] build-wasm-bundle failed (status=${res.status})`)
  process.exit(res.status ?? 1)
}

// wasm-pack emits these next to the runtime files; they must not ship.
for (const extra of [
  'package.json',
  'README.md',
  'aihu_compiler.d.ts',
  'aihu_compiler_bg.wasm.d.ts',
]) {
  await rm(join(outDir, extra), { force: true })
}

console.log('[stage-wasm] staged → public/wasm/ (aihu_compiler.js + aihu_compiler_bg.wasm)')
