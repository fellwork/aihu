/**
 * Full docs-site build script.
 *
 * Steps:
 *   0. Fetch the latest aihu-compile-wasm.tar.gz from GitHub Releases
 *      and extract it to `dist/wasm/` (Directive 1 — homepage
 *      playground). Skipped silently if no release is available.
 *   1. Recursively read every `.md` under `src/content/docs/**`, keying
 *      each page by its IA slug path (e.g. `introduction`,
 *      `guides/reactivity`, `packages/context`).
 *   2. Render Markdown → HTML. The PRIMARY renderer is `@aihu-plugin/kindly-note`
 *      `renderMarkdown` (dogfooded at BUILD TIME): it bakes `kn-*` syntax-
 *      highlight spans for TypeScript/JSON fences directly into the HTML, so the
 *      docs need NO render-blocking client-side highlighter (cdnjs hljs is gone).
 *      `renderMarkdown` is CommonMark-only and cannot parse GFM pipe tables, so a
 *      build-time table pre-pass (`splitTables`) routes ONLY detected table
 *      blocks through `marked` (which emits real `<table>`), keeping prose on
 *      kindly-note. `marked` is retained solely for this documented fallback.
 *   3. Write `src/content.ts` with a `window.__DOCS__` map
 *   4. Run `rolldown -c rolldown.config.ts` to bundle the aihu components
 *
 * Usage:
 *   bun run build.ts
 */

import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// LanguageDefinition default exports — passed as actual lang objects (NOT
// strings) to renderMarkdown's `languages` option. Only typescript + json exist
// on the @kindly-note registry today; bash/css/html fences render as safe
// escaped text (uncolored) until those packs ship.
import json from '@kindly-note/lang-json'
import typescript from '@kindly-note/lang-typescript'
import { marked } from 'marked'
import { generateSitemapXml } from '../../packages/plugin-agent-readiness/src/sitemap.ts'
// PRIMARY markdown renderer — dogfood @aihu-plugin/kindly-note at build time.
// build.ts runs under bun and imports the workspace package SOURCE directly (the
// same pattern as the agent-readiness sitemap import above), so no dist build of
// the plugin is required. renderMarkdown lazily imports the @kindly-note/* peers
// (declared as devDependencies of apps/docs) and bakes kn-* highlight spans into
// the HTML.
import { renderMarkdown } from '../../packages/plugin-kindly-note/src/render-markdown.ts'

const __dir = fileURLToPath(new URL('.', import.meta.url))
const docsDir = join(__dir, 'src/content/docs')
const contentOut = join(__dir, 'src/content.ts')
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
  // Soft-fail: prebuild prints its own diagnostics. Build continues
  // and the playground renders the runtime fallback.
  console.warn(`WASM bundle fetch failed: ${(err as Error).message}`)
}

// Strip non-runtime files that land in dist/wasm/ from the tarball.
// Cloudflare Pages serves every file in dist/ — package.json, README, and
// .d.ts files should not be publicly reachable.
const wasmExtrasToRemove = [
  'package.json',
  'README.md',
  'aihu_compiler.d.ts',
  'aihu_compiler_bg.wasm.d.ts',
]
for (const extra of wasmExtrasToRemove) {
  await rm(join(wasmOutDir, extra), { force: true })
}

// ── 1. Collect all .md files recursively from src/content/docs/ ──
//
// Each page is keyed by its IA slug path: the file's location relative
// to `src/content/docs/`, minus the `.md` extension, with POSIX
// separators (e.g. `introduction`, `guides/reactivity`,
// `packages/context`). Consumers resolve pages by this slug.

async function collectMarkdown(dir: string, base = ''): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const slugs: string[] = []
  for (const ent of dirents) {
    const rel = base ? `${base}/${ent.name}` : ent.name
    if (ent.isDirectory()) {
      slugs.push(...(await collectMarkdown(join(dir, ent.name), rel)))
    } else if (extname(ent.name) === '.md') {
      slugs.push(rel.slice(0, -'.md'.length))
    }
  }
  return slugs
}

const slugs = (await collectMarkdown(docsDir)).sort()

console.log(`Found ${slugs.length} Markdown files in src/content/docs/`)

// ── 2. Render each file ──────────────────────────────────────────

interface DocPage {
  id: string
  title: string
  html: string
}

const pages: DocPage[] = []

// A markdown segment plus a flag for whether it is a GFM table block that must
// be routed through `marked` (renderMarkdown is CommonMark-only — see below).
interface Segment {
  text: string
  isTable: boolean
}

/**
 * Build-time GFM-table pre-pass.
 *
 * `renderMarkdown` (the primary renderer) is CommonMark-only and emits pipe
 * tables as literal `<p>| A | B |…</p>` (verified empirically). 21 of 25 docs
 * files use pipe tables, so we detect each table block here and hand only those
 * blocks to `marked` (which emits real `<table>` with inline markdown in cells).
 * Everything else stays on `renderMarkdown` so kn-* highlighting is baked into
 * every file's prose.
 *
 * A table block is: a header row matching `^\s*\|.*\|\s*$` immediately followed
 * by a delimiter row of pipes/dashes/colons containing at least one `-`
 * (e.g. `|---|:--:|`). The block extends through every following consecutive
 * line that still looks like a table row (starts/ends with `|`).
 *
 * TODO: drop the marked table-block fallback once @kindly-note/lang-markdown-gfm
 * is published (currently npm 404). renderMarkdown is CommonMark-only and does
 * not parse GFM tables; until that pack ships, `marked` is the only path to real
 * `<table>` output and is retained in package.json solely for this fallback.
 */
function splitTables(md: string): Segment[] {
  const lines = md.split('\n')
  const segments: Segment[] = []
  let prose: string[] = []
  const isRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l)
  const isDelimiter = (l: string): boolean =>
    /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('|')

  const flushProse = (): void => {
    if (prose.length > 0) {
      segments.push({ text: prose.join('\n'), isTable: false })
      prose = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && i + 1 < lines.length && isDelimiter(lines[i + 1])) {
      flushProse()
      const tableLines = [lines[i], lines[i + 1]]
      let j = i + 2
      while (j < lines.length && isRow(lines[j])) {
        tableLines.push(lines[j])
        j++
      }
      segments.push({ text: tableLines.join('\n'), isTable: true })
      i = j - 1
    } else {
      prose.push(lines[i])
    }
  }
  flushProse()
  return segments
}

/**
 * Render one markdown document. Prose goes through kindly-note `renderMarkdown`
 * (baking kn-* highlight spans); GFM table blocks go through `marked`. Segments
 * are reassembled in source order so headings/lists/tables stay interleaved.
 */
async function renderDoc(source: string): Promise<string> {
  const segments = splitTables(source)
  const parts: string[] = []
  for (const seg of segments) {
    if (seg.isTable) {
      parts.push((await marked.parse(seg.text, { gfm: true, breaks: false })).trim())
    } else {
      parts.push((await renderMarkdown(seg.text, { languages: [typescript, json] })).trim())
    }
  }
  return parts.filter((p) => p.length > 0).join('\n')
}

for (const slug of slugs) {
  const source = await readFile(join(docsDir, `${slug}.md`), 'utf8')
  const html = await renderDoc(source)

  // Extract title from first H1
  const titleMatch = source.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : slug

  // Escape template-literal special chars so the generated TS is valid
  const escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
  pages.push({ id: slug, title, html: escaped })
  console.log(`  ✓ ${slug}.md → "${title}"`)
}

// ── 3. Write src/content.ts ──────────────────────────────────────

// Biome noQuotedObjectKeys: only quote keys that aren't valid identifiers
const jsIdent = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
const entries = `${pages
  .map((p) => {
    const key = jsIdent.test(p.id) ? p.id : `'${p.id}'`
    return `  ${key}: {\n    title: '${p.title.replace(/'/g, "\\'")}',\n    html: \`${p.html}\`,\n  }`
  })
  .join(',\n')},`

const contentTs = `/**
 * Pre-rendered Markdown pages — generated by build.ts.
 * Do not edit directly; run \`bun run build\` to regenerate.
 */

declare global {
  interface Window {
    __DOCS__: Record<string, { title: string; html: string }>
  }
}

window.__DOCS__ = {
${entries}
}
`

await writeFile(contentOut, contentTs, 'utf8')
console.log(`\nWrote src/content.ts (${pages.length} pages)`)

// ── 4. Bundle client with rolldown ───────────────────────────────

console.log('\nBundling client with rolldown…')
// Use execFileSync with array args (no shell) to avoid injection risk
execFileSync(
  process.execPath, // bun
  ['x', 'rolldown', '-c', 'rolldown.config.ts'],
  { cwd: __dir, stdio: 'inherit' },
)
console.log('\n✓ Client build complete → dist/docs.js')

// ── 4b. Bundle Worker with rolldown ─────────────────────────────
//
// The Worker entry (`src/worker.ts`) imports from @aihu-plugin/agent-readiness
// and @aihu/server. Rolldown inlines all workspace deps so the output is a
// single self-contained ESM file Cloudflare Pages can load as `_worker.js`.

console.log('\nBundling Worker with rolldown…')
await mkdir(join(__dir, 'dist'), { recursive: true })
execFileSync(
  process.execPath,
  ['x', 'rolldown', '--input', 'src/worker.ts', '--format', 'esm', '--file', 'dist/_worker.js'],
  { cwd: __dir, stdio: 'inherit' },
)
console.log('✓ Worker build complete → dist/_worker.js')

// ── 4c. Bundle playground preview runtime as IIFE ────────────────
//
// Packages @aihu/arbor + @aihu/signals + @aihu/runtime as window.__aihu so
// the preview iframe can execute compiled component code without a bundler.

console.log('\nBundling playground preview runtime…')
execFileSync(process.execPath, ['x', 'rolldown', '-c', 'rolldown.preview.config.ts'], {
  cwd: __dir,
  stdio: 'inherit',
})
console.log('✓ Preview runtime build complete → dist/aihu-preview-bundle.js')

// ── 5. Copy static assets into dist/ ────────────────────────────

// index.html references ./dist/docs.js at development time (so the dev
// server at apps/docs/ root can find the bundle). When deployed, dist/ IS
// the root, so rewrite the path to ./docs.js in the copied file.
const indexSrc = await readFile(join(__dir, 'index.html'), 'utf8')
const runtimePkgJson = JSON.parse(
  await readFile(join(__dir, '../../packages/runtime/package.json'), 'utf8'),
)
const runtimeVersion: string = runtimePkgJson.version ?? '0'
const indexDist = indexSrc
  .replace('./dist/docs.js', './docs.js')
  .replace('>v0<', `>v${runtimeVersion}<`)
await writeFile(join(__dir, 'dist', 'index.html'), indexDist, 'utf8')

const staticFiles = ['style.css', 'favicon.svg', 'aihu-wordmark.svg']
for (const file of staticFiles) {
  await copyFile(join(__dir, file), join(__dir, 'dist', file))
}

// Copy public/ recursively (_headers, _redirects, .well-known/*, ai.txt, etc.)
const publicDir = join(__dir, 'public')
const distDir = join(__dir, 'dist')
async function copyDirRecursive(src: string, dest: string): Promise<void> {
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

// ── 6. Emit sitemap.xml ──────────────────────────────────────────
//
// Also served by the Worker route, but emitting it as a static asset
// means it's served from the CDN edge without a Worker invocation.

// Derived from the recursive IA scan (`slugs`) so the sitemap always tracks
// the content tree — no hand-maintained flat-hash list to drift out of sync.
// Top-level entry pages rank highest; guides next; everything else default.
const sitemapPriority = (slug: string): number => {
  if (slug === 'introduction' || slug === 'installation' || slug === 'getting-started') return 0.9
  if (slug.startsWith('guides/')) return 0.8
  return 0.7
}
const sitemapXml = generateSitemapXml({
  pages: [
    { url: 'https://aihu.dev/', lastmod: '2026-05-07', changefreq: 'weekly', priority: 1.0 },
    ...slugs.map((slug) => ({
      url: `https://aihu.dev/#${slug}`,
      changefreq: 'monthly' as const,
      priority: sitemapPriority(slug),
    })),
  ],
})
await writeFile(join(__dir, 'dist', 'sitemap.xml'), sitemapXml, 'utf8')
console.log('✓ sitemap.xml → dist/sitemap.xml')

// ── 7. Emit llms-full.txt — full docs concatenated for LLM consumption ──
//
// Concatenate every IA doc in logical reading order with H1 headers so the
// file is a self-contained LLM-optimised copy of the documentation. Slugs
// resolve against `src/content/docs/`. Any slug found by the recursive scan
// but not listed in `docOrder` is appended afterwards so nothing is dropped.

const docOrder = [
  'introduction',
  'installation',
  'getting-started',
  'guides/authoring-components',
  'guides/reactivity',
  'guides/authoring-agents',
  'guides/styling',
  'guides/theming',
  'guides/utility-classes',
  'guides/primitives',
  'guides/routing-layouts',
  'guides/data-fetching',
  'guides/ssr-hydration',
  'guides/agent-discovery',
  'guides/authoring-plugins',
  'packages/context',
  'packages/agent-a2a',
  'packages/agent-acp',
  'packages/cli',
  'migration',
  'api-reference',
  'guides/deployment',
]

// Append any slugs discovered by the scan that aren't in the explicit order.
const orderedSlugs = [...docOrder, ...slugs.filter((s) => !docOrder.includes(s))]

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

for (const id of orderedSlugs) {
  const mdPath = join(docsDir, `${id}.md`)
  try {
    const content = await readFile(mdPath, 'utf8')
    llmsFullParts.push(content.trim(), '', '---', '')
  } catch {
    // skip missing files silently
  }
}

await writeFile(join(__dir, 'dist', 'llms-full.txt'), llmsFullParts.join('\n'), 'utf8')
console.log('✓ llms-full.txt → dist/llms-full.txt')
