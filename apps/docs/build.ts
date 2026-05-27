/**
 * Slimmed docs-site build script — post-Vite-migration.
 *
 * Vite (`vite build`) handles the client bundle (src/main.ts → dist/).
 * This script runs AFTER `vite build` and handles:
 *
 *   0. Fetch the WASM playground bundle
 *   1. Bundle the CF Pages Worker (src/worker.ts → dist/_worker.js)
 *   2. Bundle the playground preview runtime (IIFE → dist/aihu-preview-bundle.js)
 *   3. Copy static assets into dist/ (style.css, favicon.svg, aihu-wordmark.svg, public/)
 *   4. Emit sitemap.xml
 *   5. Emit llms-full.txt
 *
 * Usage (called by the `build` script after `vite build`):
 *   bun run build.ts
 */

import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSitemapXml } from '../../packages/plugin-agent-readiness/src/sitemap.ts'

const __dir = fileURLToPath(new URL('.', import.meta.url))
const wasmFetcher = join(__dir, '../../scripts/fetch-wasm-bundle.ts')
const wasmOutDir = join(__dir, 'dist/wasm')

// ── 0. Fetch the WASM playground bundle ──────────────────────────

console.log('Fetching WASM playground bundle…')
try {
  execFileSync(process.execPath, [wasmFetcher, wasmOutDir], {
    cwd: __dir,
    stdio: 'inherit',
  })
} catch (err) {
  console.warn(`WASM bundle fetch failed: ${(err as Error).message}`)
}

// Strip non-runtime files from dist/wasm/
const wasmExtrasToRemove = [
  'package.json',
  'README.md',
  'aihu_compiler.d.ts',
  'aihu_compiler_bg.wasm.d.ts',
]
for (const extra of wasmExtrasToRemove) {
  await rm(join(wasmOutDir, extra), { force: true })
}

// ── 1. Bundle Worker with rolldown ──────────────────────────────
//
// src/worker.ts is hand-authored with agent-readiness routes, content-negotiation,
// and CORS headers. The @aihu/adapter-cloudflare adapter stub is NOT used here —
// we bundle the real worker entry directly. This step overwrites any stub
// _worker.js that the Vite adapter closeBundle hook may have emitted.

console.log('\nBundling Worker with rolldown…')
await mkdir(join(__dir, 'dist'), { recursive: true })
execFileSync(
  process.execPath,
  ['x', 'rolldown', '--input', 'src/worker.ts', '--format', 'esm', '--file', 'dist/_worker.js'],
  { cwd: __dir, stdio: 'inherit' },
)
console.log('✓ Worker build complete → dist/_worker.js')

// ── 2. Bundle playground preview runtime as IIFE ────────────────

console.log('\nBundling playground preview runtime…')
execFileSync(process.execPath, ['x', 'rolldown', '-c', 'rolldown.preview.config.ts'], {
  cwd: __dir,
  stdio: 'inherit',
})
console.log('✓ Preview runtime build complete → dist/aihu-preview-bundle.js')

// ── 3. Copy static assets into dist/ ────────────────────────────
//
// Vite already writes dist/index.html with the correct script reference.
// We copy only the supplementary static files and public/ directory here.

const distDir = join(__dir, 'dist')

const staticFiles = ['style.css', 'favicon.svg', 'aihu-wordmark.svg']
for (const file of staticFiles) {
  await copyFile(join(__dir, file), join(distDir, file))
}

// Copy public/ recursively (_headers, _redirects, .well-known/*, ai.txt, etc.)
const publicDir = join(__dir, 'public')
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(src, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true })
      await copyDirRecursive(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}
await copyDirRecursive(publicDir, distDir)

console.log('✓ Static assets copied → dist/')

// ── 4. Emit sitemap.xml ──────────────────────────────────────────
//
// URL scheme: real paths (/docs/<slug>) — matches the Vite router URL pattern.
// Nested slugs use full path segments (e.g. /docs/guides/authoring-components).

const sitemapXml = generateSitemapXml({
  pages: [
    { url: 'https://aihu.dev/', lastmod: '2026-05-07', changefreq: 'weekly', priority: 1.0 },
    { url: 'https://aihu.dev/docs/introduction', changefreq: 'weekly', priority: 0.9 },
    { url: 'https://aihu.dev/docs/installation', changefreq: 'weekly', priority: 0.9 },
    { url: 'https://aihu.dev/docs/getting-started', changefreq: 'weekly', priority: 0.9 },
    { url: 'https://aihu.dev/docs/guides/authoring-components', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/reactivity', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/authoring-agents', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/styling', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/theming', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/primitives', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/routing-layouts', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/guides/data-fetching', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/guides/ssr-hydration', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/guides/agent-discovery', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/authoring-plugins', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/migration', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/api-reference', changefreq: 'monthly', priority: 0.8 },
    { url: 'https://aihu.dev/docs/guides/deployment', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/packages/context', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/packages/agent-a2a', changefreq: 'monthly', priority: 0.7 },
    { url: 'https://aihu.dev/docs/packages/agent-acp', changefreq: 'monthly', priority: 0.7 },
  ],
})
await writeFile(join(__dir, 'dist', 'sitemap.xml'), sitemapXml, 'utf8')
console.log('✓ sitemap.xml → dist/sitemap.xml')

// ── 5. Emit llms-full.txt ────────────────────────────────────────
//
// Source: apps/docs/src/content/docs/**/*.md (the canonical 20-file set).
// Replaces the old docs/site/*.md read from the repo root.

const contentDocsDir = join(__dir, 'src/content/docs')

const docOrder = [
  'introduction',
  'installation',
  'getting-started',
  'guides/authoring-components',
  'guides/reactivity',
  'guides/authoring-agents',
  'guides/styling',
  'guides/theming',
  'guides/primitives',
  'guides/routing-layouts',
  'guides/data-fetching',
  'guides/ssr-hydration',
  'guides/agent-discovery',
  'guides/authoring-plugins',
  'migration',
  'api-reference',
  'guides/deployment',
  'packages/context',
  'packages/agent-a2a',
  'packages/agent-acp',
]

const llmsFullParts: string[] = [
  '# aihu — Full Documentation',
  '',
  '> A zero-dependency Web Components meta-framework. .aihu SFCs compile to vanilla custom elements',
  '> with sub-2 kB reactive primitives. Every component is agent-discoverable and callable as an MCP tool.',
  '',
  '> Source: https://aihu.dev | GitHub: https://github.com/fellwork/aihu',
  '',
  '---',
  '',
]

for (const id of docOrder) {
  const mdPath = join(contentDocsDir, `${id}.md`)
  try {
    const content = await readFile(mdPath, 'utf8')
    llmsFullParts.push(content.trim(), '', '---', '')
  } catch {
    // skip missing files silently
  }
}

await writeFile(join(__dir, 'dist', 'llms-full.txt'), llmsFullParts.join('\n'), 'utf8')
console.log('✓ llms-full.txt → dist/llms-full.txt')
