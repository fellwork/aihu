#!/usr/bin/env bun

/**
 * lint-node-bundle-leaks — assert no `node:*` builtin specifier survives
 * into a browser-eligible example's built JS bundle.
 *
 * Background: bug2.5-node-module-leak. `@aihu/router/src/router.ts` used
 * to import `renderToString` from the `@aihu/server` barrel; that barrel's
 * `renderToString` carries an `await import('./native.js')` whose dist
 * target statically imports `node:module`. Rolldown chased the dynamic
 * import during SPA builds and choked. We split `handle()` out to
 * `@aihu/router/server`, but a regression here would be invisible from
 * unit tests — only a real example build catches it. This script is the
 * CI gate.
 *
 * Strategy:
 *   1. For each example listed in EXAMPLES, run `vite build` (best
 *      effort — skipped silently if the example's deps are missing).
 *   2. Scan every emitted `dist/assets/*.js` for `from "node:` or
 *      `from 'node:` specifiers.
 *   3. Exit non-zero on any hit. Non-JS dist assets and HTML are ignored.
 *
 * Why grep the dist and not just resolve the package graph: dynamic
 * `await import('./native.js')` is what made Bug 2.5 invisible to the
 * static graph. We need to see what the bundler actually emitted.
 *
 * Run: `bun scripts/lint-node-bundle-leaks.ts`. Exits non-zero on
 * violation. Also runnable on a pre-built tree without invoking vite
 * (skips step 1) — useful when CI already built the examples.
 */

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

/**
 * Browser-eligible examples whose SPA bundles must stay free of
 * `node:*` builtin imports. New SPA examples should be added here.
 * (Examples that intentionally target Node SSR are NOT listed.)
 */
const EXAMPLES = ['blog-router', 'css-engine-utility']

/** Set BUILD=0 to skip the build step and lint a pre-built tree. */
const SHOULD_BUILD = process.env.BUILD !== '0'

type Offender = { file: string; match: string }
const offenders: Offender[] = []
const built: string[] = []
const skipped: string[] = []

function fileExists(p: string): boolean {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

function scanDir(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDir(p)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const content = readFileSync(p, 'utf-8')
    // Match `from "node:foo"` / `from 'node:foo'` / `import "node:foo"` /
    // `import('node:foo')`. All forms cover both ESM static + dynamic.
    const re = /(?:from|import\s*\(?)\s*["']node:[^"']+["']/g
    let m: RegExpExecArray | null = re.exec(content)
    while (m !== null) {
      offenders.push({ file: p, match: m[0] })
      m = re.exec(content)
    }
  }
}

for (const ex of EXAMPLES) {
  const exDir = join(root, 'examples', ex)
  if (!fileExists(join(exDir, 'package.json'))) {
    skipped.push(`${ex} (no package.json)`)
    continue
  }
  if (SHOULD_BUILD) {
    if (!fileExists(join(exDir, 'node_modules'))) {
      skipped.push(`${ex} (no node_modules — run bun install)`)
      continue
    }
    const build = spawnSync('bun', ['run', 'build'], {
      cwd: exDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (build.status !== 0) {
      console.error(`FAIL lint-node-bundle-leaks: ${ex} build failed`)
      console.error(build.stdout)
      console.error(build.stderr)
      process.exit(1)
    }
    built.push(ex)
  }
  const distAssets = join(exDir, 'dist', 'assets')
  if (!fileExists(distAssets)) {
    skipped.push(`${ex} (no dist/assets after build)`)
    continue
  }
  scanDir(distAssets)
}

if (offenders.length === 0) {
  console.log(
    `OK lint-node-bundle-leaks: no node:* specifiers in built SPA bundles ` +
      `(built: [${built.join(', ') || 'none'}], skipped: [${skipped.join(', ') || 'none'}])`,
  )
  process.exit(0)
}

console.error('FAIL lint-node-bundle-leaks: node:* import(s) survived into SPA bundle')
console.error('  A browser-eligible example bundle contains a `node:*` builtin specifier.')
console.error('  This means a browser-eligible @aihu/* package pulled a server-only entry')
console.error('  (or a transitive dynamic import) that statically requires `node:*`. See')
console.error('  .context/fw-agent/bug2.5-node-module-leak/investigation.md for the pattern.')
console.error('')
for (const o of offenders) {
  const rel = o.file.startsWith(root) ? o.file.slice(root.length + 1) : o.file
  console.error(`  ${rel}: ${o.match}`)
}
process.exit(1)
