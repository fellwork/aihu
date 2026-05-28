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

// css-engine emits `.flex { display: flex }` (with or without trailing semicolon
// depending on minification). Match the rule head loosely.
const needle = /\.flex\s*\{\s*display\s*:\s*flex/

let found = false
let matchedFile = ''
for (const f of cssFiles) {
  const full = join(distAssets, f)
  if (!statSync(full).isFile()) continue
  const body = readFileSync(full, 'utf8')
  if (needle.test(body)) {
    found = true
    matchedFile = f
    break
  }
}

if (!found) {
  console.error(
    `[check-utility-css] FAIL — no \`.flex { display: flex }\` rule found in ${cssFiles.join(', ')}.\n` +
      `  This means \`@aihu/css-engine\`'s auto-fold did NOT run (or the css-core ` +
      `binary failed to resolve). Check the build log for \`[@aihu/compiler] ` +
      `@aihu/css-engine is installed but compileSfc() failed\`.`,
  )
  process.exit(1)
}

console.log(
  `[check-utility-css] PASS — \`.flex { display: flex }\` found in dist/assets/${matchedFile}.`,
)
process.exit(0)
