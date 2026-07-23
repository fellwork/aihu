#!/usr/bin/env bun
/**
 * Data-driven build/smoke runner for the governed example set (proposal §6).
 *
 * The governed contract says every governed example is exercised under live
 * conditions on a qualifying PR — but the examples split into build tiers:
 *
 *   - ci: "build"          → `vite build` (leaf SPA / @aihu-app examples that
 *                            rollup can resolve). ssg-site also prerenders.
 *   - ci: "compile+smoke"  → NOT vite-buildable in the default lane (server /
 *                            SSR / dev-server-only wiring, e.g. storefront's
 *                            arbor alias, agent-hub's /@shared URL). Their SFC
 *                            compile is already gated by check:emit-parses; this
 *                            runner additionally runs their smoke suite when one
 *                            exists (tests/smoke.test.ts / tests/*.test.ts).
 *
 * The tier is read from each example's coverage.manifest.json `ci` field, so the
 * lane can never drift from the governed set — add a manifest, it's covered;
 * change a tier, the lane follows. Prerequisite (in CI): the workspace packages
 * and the aihu-compile binary are built/staged before this runs (see plan-a.yml
 * `governed-examples` job).
 *
 * Usage:
 *   bun scripts/build-governed-examples.ts            # all governed examples
 *   bun scripts/build-governed-examples.ts --tier build
 *   bun scripts/build-governed-examples.ts todo-mvc ssg-site
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const examplesDir = join(repoRoot, 'examples')

interface Manifest {
  example: string
  id: string
  ci?: 'build' | 'compile+smoke' | 'compile'
  /**
   * Content-level prerender assertion for `ci: "build"` examples (SSG /
   * `output: 'static'`). Maps a built HTML file (relative to the example's
   * `dist/`) to substrings its bytes MUST contain. `vite build` exiting 0 is
   * NOT proof an SSG prerender worked — the whole ssg-site bug was a
   * green-but-vacuous build that shipped an empty SPA shell. This turns the
   * lane into a real check: after the build we open the route HTML and assert
   * the rendered content (headings, list items) AND a hydration marker
   * (`data-aihu-path`) are present, so a regression back to the SPA shell is
   * RED, not silently green.
   */
  prerender?: Record<string, string[]>
}

const args = process.argv.slice(2)
let tierFilter: string | null = null
const only = new Set<string>()
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tier') tierFilter = args[++i]
  else only.add(args[i])
}

const manifests: Array<Manifest & { dir: string }> = []
for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const p = join(examplesDir, entry.name, 'coverage.manifest.json')
  if (!existsSync(p)) continue
  const m = JSON.parse(readFileSync(p, 'utf-8')) as Manifest
  manifests.push({ ...m, dir: join(examplesDir, entry.name) })
}

manifests.sort((a, b) => a.id.localeCompare(b.id))

const failures: string[] = []
let ran = 0

for (const m of manifests) {
  if (only.size > 0 && !only.has(m.example)) continue
  const tier = m.ci ?? 'compile'
  if (tierFilter && tier !== tierFilter) continue

  if (tier === 'build') {
    ran++
    console.log(`\n▶ ${m.id} ${m.example} — vite build`)
    const r = spawnSync('bun', ['run', 'build'], {
      cwd: m.dir,
      stdio: 'inherit',
      env: { ...process.env, SCRIBE_SKIP_POSTINSTALL: '1' },
    })
    if (r.status !== 0) {
      failures.push(`${m.example}: vite build exited ${r.status}`)
    } else if (m.prerender) {
      // Content-level prerender assertion — `vite build` exit 0 is necessary
      // but NOT sufficient for SSG (the succeed-vacuously trap). Open each
      // declared route HTML and assert the expected rendered content is
      // actually in the bytes.
      for (const [rel, needles] of Object.entries(m.prerender)) {
        const htmlPath = join(m.dir, 'dist', rel)
        if (!existsSync(htmlPath)) {
          failures.push(`${m.example}: prerender expected ${rel} but it was not written to dist/`)
          continue
        }
        const html = readFileSync(htmlPath, 'utf-8')
        const missing = needles.filter((n) => !html.includes(n))
        if (missing.length > 0) {
          failures.push(
            `${m.example}: ${rel} is missing prerendered content — did it degrade to a SPA shell? ` +
              `Absent: ${missing.map((n) => JSON.stringify(n)).join(', ')}`,
          )
        } else {
          console.log(`  ✓ prerender content asserted in ${rel} (${needles.length} needle(s))`)
        }
      }
    }
  } else if (tier === 'compile+smoke') {
    // SFC compile is covered by check:emit-parses; run the smoke suite if any.
    const hasSmoke =
      existsSync(join(m.dir, 'tests', 'smoke.test.ts')) ||
      existsSync(join(m.dir, 'vitest.config.ts'))
    if (hasSmoke) {
      ran++
      console.log(`\n▶ ${m.id} ${m.example} — smoke (compile guarded by check:emit-parses)`)
      const r = spawnSync('bun', ['run', 'test'], {
        cwd: m.dir,
        stdio: 'inherit',
        env: { ...process.env, SCRIBE_SKIP_POSTINSTALL: '1' },
      })
      if (r.status !== 0) failures.push(`${m.example}: smoke suite exited ${r.status}`)
    } else {
      console.log(
        `\n· ${m.id} ${m.example} — compile-only (no smoke suite; check:emit-parses covers it)`,
      )
    }
  } else {
    console.log(`\n· ${m.id} ${m.example} — compile-only (check:emit-parses covers it)`)
  }
}

if (ran === 0) {
  console.error('build:governed-examples — nothing ran (bad filter?); refusing a vacuous pass.')
  process.exit(1)
}

if (failures.length > 0) {
  console.error(`\nbuild:governed-examples — ${failures.length} failure(s):`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}

console.log(`\nbuild:governed-examples — ${ran} example(s) passed.`)
