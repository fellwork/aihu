import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { transformSync } from 'esbuild'

/**
 * Bundle-size methodology: minify with esbuild (matches size-limit's internal
 * approach), then gzip at level 9. This makes `@aihu/signals` directly
 * comparable to `bun run size`'s 698 B reading. Pre-minified ESM builds
 * (Vue's reactivity.esm-browser.prod, Solid's solid.js) pass through esbuild
 * cleanly without re-minification artifacts.
 */
const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..')
const BENCH_NM = resolve(HERE, '..', 'node_modules')

interface SizeRow {
  name: string
  path: string
  raw: number
  minified: number
  gz: number
}

const targets: Array<{ name: string; path: string }> = [
  // For aihu we use the built dist that size-limit gates on.
  { name: '@aihu/signals', path: resolve(ROOT, 'packages/signals/dist/index.js') },
  // Competitors live in the bench workspace's node_modules (versions pinned).
  { name: 'alien-signals', path: resolve(BENCH_NM, 'alien-signals/esm/index.mjs') },
  {
    name: '@preact/signals-core',
    path: resolve(BENCH_NM, '@preact/signals-core/dist/signals-core.mjs'),
  },
  {
    name: '@vue/reactivity',
    path: resolve(BENCH_NM, '@vue/reactivity/dist/reactivity.esm-browser.prod.js'),
  },
  // Solid's reactive build (the same one the bench uses).
  { name: 'solid-js (reactive only)', path: resolve(BENCH_NM, 'solid-js/dist/solid.js') },
  { name: 's-js', path: resolve(BENCH_NM, 's-js/dist/es/S.js') },
]

function sizeOf(path: string): { raw: number; minified: number; gz: number } | null {
  try {
    statSync(path)
  } catch {
    return null
  }
  const source = readFileSync(path, 'utf8')
  const minified = transformSync(source, {
    minify: true,
    target: 'es2022',
    format: 'esm',
    legalComments: 'none',
  }).code
  const gz = gzipSync(minified, { level: 9 })
  return {
    raw: Buffer.byteLength(source, 'utf8'),
    minified: Buffer.byteLength(minified, 'utf8'),
    gz: gz.byteLength,
  }
}

const rows: SizeRow[] = []
for (const t of targets) {
  const s = sizeOf(t.path)
  if (!s) {
    console.error(`MISSING: ${t.name} at ${t.path}`)
    continue
  }
  rows.push({ name: t.name, path: t.path, raw: s.raw, minified: s.minified, gz: s.gz })
}

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(2)} KB`
}

console.log('| Competitor | Raw | Minified | Gzipped |')
console.log('| --- | ---: | ---: | ---: |')
for (const r of rows) {
  console.log(`| ${r.name} | ${fmtBytes(r.raw)} | ${fmtBytes(r.minified)} | ${fmtBytes(r.gz)} |`)
}
