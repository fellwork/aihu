/**
 * Bundle-size reporter for `bench/arbor` competitors. Informational only —
 * not gated. Prints minified+gzipped size for each competitor's main ESM entry.
 *
 * Run with: `bun bench/arbor/src/size.ts`
 *
 * Methodology: read the dist/ESM entry, minify with esbuild (level 9 gzip).
 * Same approach as bench/signals/src/size.ts.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { transformSync } from 'esbuild'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..')
const BENCH_NM = resolve(HERE, '..', 'node_modules')

interface SizeRow {
  name: string
  raw: number
  minified: number
  gz: number
}

const targets: Array<{ name: string; path: string }> = [
  {
    name: '@scribe/arbor',
    path: resolve(ROOT, 'packages/arbor/dist/index.js'),
  },
  {
    name: 'lit-html',
    path: resolve(BENCH_NM, 'lit-html/lit-html.js'),
  },
  {
    name: 'solid-js (dom)',
    path: resolve(BENCH_NM, 'solid-js/dist/solid.js'),
  },
  {
    name: '@vue/runtime-dom',
    path: resolve(BENCH_NM, '@vue/runtime-dom/dist/runtime-dom.esm-bundler.js'),
  },
  {
    name: 'preact',
    path: resolve(BENCH_NM, 'preact/dist/preact.module.js'),
  },
]

function sizeOf(path: string): { raw: number; minified: number; gz: number } | null {
  try {
    const source = readFileSync(path, 'utf8')
    let minCode: string
    try {
      minCode = transformSync(source, {
        minify: true,
        target: 'es2022',
        format: 'esm',
        legalComments: 'none',
      }).code
    } catch {
      // If esbuild can't minify (e.g. already minified with syntax issues), use raw
      minCode = source
    }
    const gz = gzipSync(Buffer.from(minCode, 'utf8'), { level: 9 })
    return {
      raw: Buffer.byteLength(source, 'utf8'),
      minified: Buffer.byteLength(minCode, 'utf8'),
      gz: gz.byteLength,
    }
  } catch {
    return null
  }
}

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(2)} KB`
}

const rows: SizeRow[] = []
for (const t of targets) {
  const s = sizeOf(t.path)
  if (!s) {
    console.error(`MISSING: ${t.name} at ${t.path}`)
    continue
  }
  rows.push({ name: t.name, raw: s.raw, minified: s.minified, gz: s.gz })
}

console.log('# @scribe/arbor — competitor bundle sizes (minified + gzipped)')
console.log('')
console.log('| Competitor | Raw | Minified | Gzipped |')
console.log('| --- | ---: | ---: | ---: |')
for (const r of rows) {
  console.log(`| ${r.name} | ${fmtBytes(r.raw)} | ${fmtBytes(r.minified)} | ${fmtBytes(r.gz)} |`)
}
console.log('')
console.log('Note: vanilla DOM has no bundle size — it is built into the browser.')
