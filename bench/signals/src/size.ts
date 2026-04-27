import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

/**
 * Stretch deliverable: gzipped size of each competitor's main entry, alongside
 * `@scribe/signals`'s own dist. Reads from the bench's node_modules so the
 * pinned versions match RESULTS.md. Output prints to stdout as a markdown
 * table that can be pasted into RESULTS.md "Bundle size" section.
 *
 * Caveat: this measures the *main entry file* gzipped, which is *not* the
 * minified user-facing bundle. Each lib ships pre-built. For a fully fair
 * comparison we'd run each through terser+gzip; that's a future enhancement.
 * For Phase 2.5 the relative ordering is the signal users care about.
 */
const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..')
const BENCH_NM = resolve(HERE, '..', 'node_modules')

interface SizeRow {
  name: string
  path: string
  raw: number
  gz: number
}

const targets: Array<{ name: string; path: string }> = [
  // For scribe we use the built dist that size-limit gates on.
  { name: '@scribe/signals', path: resolve(ROOT, 'packages/signals/dist/index.js') },
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

function sizeOf(path: string): { raw: number; gz: number } | null {
  try {
    statSync(path)
  } catch {
    return null
  }
  const buf = readFileSync(path)
  const gz = gzipSync(buf, { level: 9 })
  return { raw: buf.byteLength, gz: gz.byteLength }
}

const rows: SizeRow[] = []
for (const t of targets) {
  const s = sizeOf(t.path)
  if (!s) {
    console.error(`MISSING: ${t.name} at ${t.path}`)
    continue
  }
  rows.push({ name: t.name, path: t.path, raw: s.raw, gz: s.gz })
}

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(2)} KB`
}

console.log('| Competitor | Raw | Gzipped |')
console.log('| --- | ---: | ---: |')
for (const r of rows) {
  console.log(`| ${r.name} | ${fmtBytes(r.raw)} | ${fmtBytes(r.gz)} |`)
}
