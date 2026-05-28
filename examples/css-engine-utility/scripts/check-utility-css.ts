#!/usr/bin/env bun
/**
 * Acceptance check: after `vite build`, the bundled CSS must contain a
 * `.flex` rule produced by `@aihu/css-engine`. This proves the auto-fold
 * path (`viteAihuPlugin` → `aihuCompilerPlugin` → `@aihu/css-engine`) is
 * shipping utility classes into the build output — not silently swallowed.
 *
 * Exits 0 on success, 1 on failure (with a clear message).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distAssets = join(__dirname, '..', 'dist', 'assets')

let entries: string[]
try {
  entries = readdirSync(distAssets)
} catch (err) {
  console.error(
    `[check-utility-css] dist/assets not found at ${distAssets} — run \`bun run build\` first.`,
  )
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

const cssFiles = entries.filter((f) => f.endsWith('.css'))
if (cssFiles.length === 0) {
  console.error(`[check-utility-css] no CSS files emitted under ${distAssets}`)
  process.exit(1)
}

// Each check is a (label, regexp) pair. css-engine emits rules with or without
// a trailing semicolon depending on minification, so the patterns match the
// declaration head loosely. The `.flex` rule proves the auto-fold path runs;
// the rest prove the Round-1 utility families actually emit into the bundle.
const checks: ReadonlyArray<readonly [string, RegExp]> = [
  ['flex', /\.flex\s*\{\s*display\s*:\s*flex/],
  ['max-w-7xl', /max-width\s*:\s*80rem/],
  ['mx-auto', /margin-inline\s*:\s*auto/],
  [
    'grid-cols-3',
    /grid-template-columns\s*:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/,
  ],
  ['space-y-4', /margin-block-start\s*:\s*1rem/],
  ['border-2', /border-width\s*:\s*2px/],
  // Round 2: ring width + offset. The composed box-shadow ring at 2px and the
  // offset-width custom prop must both reach the bundle. `focus:ring-2` lands
  // under a `:focus` selector; the declaration substring still matches.
  ['ring-2', /calc\(\s*2px\s*\+\s*var\(--tw-ring-offset-width\)\s*\)/],
  ['ring-color', /--tw-ring-color\s*:\s*var\(--color-blue-500\)/],
  ['ring-offset-2', /--tw-ring-offset-width\s*:\s*2px/],
]

// Concatenate all emitted CSS so a rule split across files still matches.
let allCss = ''
const matchedFiles: string[] = []
for (const f of cssFiles) {
  const full = join(distAssets, f)
  if (!statSync(full).isFile()) continue
  allCss += `\n/* ${f} */\n` + readFileSync(full, 'utf8')
  matchedFiles.push(f)
}

const missing: string[] = []
for (const [label, re] of checks) {
  if (!re.test(allCss)) missing.push(label)
}

if (missing.length > 0) {
  console.error(
    `[check-utility-css] FAIL — missing expected declarations for: ${missing.join(', ')}\n` +
      `  Scanned: ${matchedFiles.join(', ')}.\n` +
      `  If \`.flex\` is among the misses, \`@aihu/css-engine\`'s auto-fold did NOT run ` +
      `(or the css-core binary failed to resolve). Check the build log for ` +
      `\`[@aihu/compiler] @aihu/css-engine is installed but compileSfc() failed\`.`,
  )
  process.exit(1)
}

console.log(
  `[check-utility-css] PASS — all expected declarations (${checks
    .map(([l]) => l)
    .join(', ')}) found in dist/assets/${matchedFiles.join(', ')}.`,
)
process.exit(0)
