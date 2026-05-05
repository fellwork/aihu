#!/usr/bin/env bun
/**
 * Pre-build hook: fetches the latest `aihu-compile-wasm.tar.gz` from
 * GitHub Releases and extracts to the given output dir.
 *
 * Used by `apps/docs` to embed the WASM playground bundle at build
 * time (Directive 1 — homepage interactive playground per
 * `docs/roadmap/_user-directives.md`).
 *
 * Behavior:
 *   - If the asset is reachable, downloads + extracts the tarball into
 *     `<outDir>/`. After extraction, `<outDir>/aihu_compiler.js` and
 *     `<outDir>/aihu_compiler_bg.wasm` exist.
 *   - If the asset is NOT reachable (release not yet published),
 *     prints a clear warning and exits 0 — the build proceeds without
 *     the WASM bundle and the playground surfaces a "WASM unavailable"
 *     message at runtime instead of failing CI.
 *   - The `--strict` flag converts the missing-bundle case into a
 *     non-zero exit (use this in production deploys).
 *
 * Usage:
 *   bun scripts/fetch-wasm-bundle.ts <outDir> [--strict]
 *
 * Spec: docs/roadmap/_user-directives.md Directive 1; arch-4 §4.6.
 */
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const outDirArg = args.find((a) => !a.startsWith('--'))
const strict = args.includes('--strict')

if (!outDirArg) {
  console.error('Usage: fetch-wasm-bundle.ts <output-dir> [--strict]')
  process.exit(1)
}

const outDir = resolve(outDirArg)
const url =
  process.env.AIHU_WASM_BUNDLE_URL ??
  'https://github.com/fellwork/aihu/releases/latest/download/aihu-compile-wasm.tar.gz'

console.log(`[fetch-wasm-bundle] target: ${outDir}`)
console.log(`[fetch-wasm-bundle] source: ${url}`)

const res = await fetch(url, { redirect: 'follow' })

if (!res.ok) {
  const msg = `[fetch-wasm-bundle] WASM bundle unavailable: ${res.status} ${res.statusText}`
  if (strict) {
    console.error(msg)
    console.error('  --strict was passed; failing the build.')
    console.error('  To unblock: tag v0.1.0 (or run release.yml workflow_dispatch).')
    process.exit(1)
  }
  console.warn(msg)
  console.warn('  Continuing build without WASM (playground will show fallback notice).')
  console.warn('  To unblock: tag v0.1.0 (or run release.yml workflow_dispatch).')
  // Still ensure outDir exists so later build steps don't fail on missing dir.
  await mkdir(outDir, { recursive: true })
  // Drop a marker file so the playground knows to render the fallback message.
  await writeFile(
    join(outDir, 'UNAVAILABLE'),
    `WASM bundle was not available at build time.\nURL: ${url}\nStatus: ${res.status} ${res.statusText}\n`,
    'utf8',
  )
  process.exit(0)
}

await mkdir(outDir, { recursive: true })
const tarPath = join(outDir, 'wasm-bundle.tar.gz')
const buf = Buffer.from(await res.arrayBuffer())
await writeFile(tarPath, buf)
console.log(`[fetch-wasm-bundle] downloaded ${buf.length} bytes`)

// Extract via the system tar binary. `--strip-components=1` drops the
// leading `pkg-wasm/` prefix so files land directly in <outDir>.
console.log(`[fetch-wasm-bundle] extracting to ${outDir}/`)
const tarRes = spawnSync(
  'tar',
  ['-xzf', tarPath, '-C', outDir, '--strip-components=1'],
  { stdio: 'inherit' },
)

if (tarRes.status !== 0) {
  console.error(`[fetch-wasm-bundle] tar extract failed (status=${tarRes.status})`)
  process.exit(1)
}

// Drop the tarball after extraction.
await rm(tarPath)

// Sanity check: confirm the two critical files landed.
const expected = ['aihu_compiler.js', 'aihu_compiler_bg.wasm']
for (const f of expected) {
  if (!existsSync(join(outDir, f))) {
    console.error(`[fetch-wasm-bundle] missing expected file after extract: ${f}`)
    process.exit(1)
  }
}

console.log('[fetch-wasm-bundle] done.')
