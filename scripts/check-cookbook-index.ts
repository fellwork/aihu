#!/usr/bin/env bun
/**
 * CI guard — cookbook corpus is the single source of truth; every consumption
 * surface is GENERATED from it and must never fossilize again.
 *
 * The failure this prevents actually happened: `packages/mcp/src/cookbook-index.json`
 * sat one grammar generation stale (pre-#497 `$action:`-collection sources,
 * filenames that matched nothing in cookbook/) while the builder silently
 * emitted an EMPTY index on rebuild — the same succeed-vacuously class as the
 * bundle-size `-1` incident (#510).
 *
 * What turns red, and when:
 *   1. A recipe without a valid `<!-- @cookbook -->` frontmatter block —
 *      missing/unknown fields, unknown construct/type/concern IDs, id ≠
 *      filename stem, duplicate ids/playground labels, dangling `related:`.
 *   2. Drift between the corpus and any committed generated artifact:
 *        - packages/mcp/src/cookbook-index.json
 *        - llms-cookbook.txt
 *        - apps/docs/playground/presets.generated.ts
 *        - apps/docs-next/playground/presets.generated.ts
 *      (edit a recipe without regenerating → red; hand-edit an artifact → red)
 *   3. An empty corpus, an empty index, or zero playground presets.
 *
 * Fix: `bun packages/mcp/scripts/build-cookbook-index.ts`, commit the diff.
 *
 * Like the other Slice-0-style checks, this runs a bidirectional self-test
 * (should-flag AND should-not-flag) before scanning the real tree, and exits
 * 1 on zero inputs rather than passing vacuously.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCorpus,
  parseFrontmatter,
  renderIndexJson,
  renderLlmsCookbook,
  renderPresetsTs,
} from '../packages/mcp/scripts/cookbook-lib.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── bidirectional self-test ─────────────────────────────────────────────────

const GOOD_FIXTURE = `<!-- @cookbook
id: fixture-good
type: display
granularity: block
description: Self-test fixture.
constructs: [state, on:click]
packages: []
concerns: [state]
since: 0.5.0
-->
@state { let x = state(0) }
@template { <p>{x}</p> }
`

const BAD_FIXTURE = `<!-- @cookbook
id: fixture-bad
type: not-a-type
granularity: block
description: Self-test fixture.
constructs: [definitely-not-a-construct]
concerns: [state]
since: 0.5.0
-->
@state { let x = state(0) }
`

const good = parseFrontmatter(GOOD_FIXTURE, 'fixture-good.aihu')
if (good.errors.length > 0 || good.meta === null) {
  console.error('check:cookbook self-test FAILED — valid fixture was flagged:')
  for (const e of good.errors) console.error(`    ${e}`)
  process.exit(1)
}
const bad = parseFrontmatter(BAD_FIXTURE, 'fixture-bad.aihu')
if (bad.errors.length === 0 || bad.meta !== null) {
  console.error('check:cookbook self-test FAILED — invalid fixture was NOT flagged.')
  process.exit(1)
}
const missing = parseFrontmatter('@state { }\n@template { <p>x</p> }\n', 'fixture-none.aihu')
if (missing.errors.length === 0) {
  console.error('check:cookbook self-test FAILED — missing frontmatter was NOT flagged.')
  process.exit(1)
}

// ── 1. validate the real corpus ─────────────────────────────────────────────

const { entries, errors } = buildCorpus(join(repoRoot, 'cookbook'))

if (errors.length > 0) {
  console.error(`check:cookbook — ${errors.length} frontmatter problem(s):`)
  for (const err of errors) console.error(`  ✗ ${err}`)
  console.error(
    '\nSchema: packages/mcp/scripts/cookbook-lib.ts (header comment). Every recipe' +
      '\nneeds a valid <!-- @cookbook --> block before the corpus can regenerate.',
  )
  process.exit(1)
}

if (entries.length === 0) {
  console.error('check:cookbook — zero cookbook entries; refusing a vacuous pass.')
  process.exit(1)
}

if (entries.filter((e) => e.playground).length === 0) {
  console.error(
    'check:cookbook — no recipe carries a playground: label; the playground would be empty.',
  )
  process.exit(1)
}

// ── 2. staleness diff against every committed generated artifact ────────────

const ARTIFACTS: ReadonlyArray<[string, string]> = [
  ['packages/mcp/src/cookbook-index.json', renderIndexJson(entries)],
  ['llms-cookbook.txt', renderLlmsCookbook(entries)],
  ['apps/docs/playground/presets.generated.ts', renderPresetsTs(entries)],
  // docs-next carries its own port of the playground during the docs-next →
  // docs promotion. The generator writes BOTH copies, so both are diffed here:
  // a hand-copied artifact with no CI edge is exactly the fossilization this
  // check exists to catch. Drop the apps/docs row when it retires.
  ['apps/docs-next/playground/presets.generated.ts', renderPresetsTs(entries)],
]

const stale: string[] = []
for (const [rel, fresh] of ARTIFACTS) {
  let committed: string
  try {
    committed = readFileSync(join(repoRoot, rel), 'utf-8')
  } catch {
    stale.push(`${rel} (missing)`)
    continue
  }
  if (committed !== fresh) {
    stale.push(rel)
  }
}

if (stale.length > 0) {
  console.error('check:cookbook — generated artifacts are STALE relative to cookbook/:')
  for (const s of stale) console.error(`  ✗ ${s}`)
  console.error('\nFix: bun packages/mcp/scripts/build-cookbook-index.ts  (then commit the diff)')
  process.exit(1)
}

console.log(
  `check:cookbook — corpus valid (${entries.length} recipes), all ${ARTIFACTS.length} generated artifacts in sync.`,
)
