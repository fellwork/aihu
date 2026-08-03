/**
 * Build-time generator: scans `cookbook/*.aihu`, parses + validates the
 * `<!-- @cookbook -->` frontmatter schema (see cookbook-lib.ts), and writes
 * every generated consumption surface:
 *
 *   1. packages/mcp/src/cookbook-index.json   — the @aihu/mcp `aihu_example` index
 *   2. llms-cookbook.txt (repo root)          — agent-consumable text export
 *   3. apps/docs/playground/presets.generated.ts      — playground presets
 *   4. apps/docs-next/playground/presets.generated.ts — ditto, docs-next's port
 *      of the playground. Two apps carry the playground during the docs-next →
 *      docs promotion, and BOTH are written here (and diffed by
 *      scripts/check-cookbook-index.ts) so neither can fossilize: a hand-copied
 *      second artifact with no generator edge and no CI edge is precisely the
 *      drift this script exists to prevent. Drop the apps/docs row when it
 *      retires.
 *
 * FAIL-LOUD CONTRACT (the `-1` bundle-size doctrine): any recipe with
 * missing/invalid frontmatter, an unknown construct/type/concern, a duplicate
 * id, or an empty scan result exits 1 and lists every offender. This script
 * NEVER writes partial or empty artifacts.
 *
 * Usage: bun packages/mcp/scripts/build-cookbook-index.ts
 * (also runs as part of `bun run build` in packages/mcp)
 */

import { writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCorpus,
  renderIndexJson,
  renderLlmsCookbook,
  renderPresetsTs,
} from './cookbook-lib.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../../')

const cookbookDir = join(repoRoot, 'cookbook')
const indexPath = join(repoRoot, 'packages/mcp/src/cookbook-index.json')
const llmsPath = join(repoRoot, 'llms-cookbook.txt')
const presetsPaths = [
  join(repoRoot, 'apps/docs/playground/presets.generated.ts'),
  join(repoRoot, 'apps/docs-next/playground/presets.generated.ts'),
]

const { entries, errors } = buildCorpus(cookbookDir)

if (errors.length > 0) {
  console.error(`[build-cookbook-index] REFUSING to write: ${errors.length} problem(s):`)
  for (const err of errors) console.error(`  ✗ ${err}`)
  console.error(
    '\nEvery cookbook recipe must carry a valid <!-- @cookbook --> frontmatter block.' +
      '\nSchema: packages/mcp/scripts/cookbook-lib.ts (header comment).',
  )
  process.exit(1)
}

if (entries.length === 0) {
  console.error('[build-cookbook-index] REFUSING to write an empty index (zero entries).')
  process.exit(1)
}

const presetCount = entries.filter((e) => e.playground).length
if (presetCount === 0) {
  console.error(
    '[build-cookbook-index] REFUSING to write: no recipe carries a `playground:` label — the playground would have zero presets.',
  )
  process.exit(1)
}

writeFileSync(indexPath, renderIndexJson(entries), 'utf-8')
console.log(`[build-cookbook-index] Wrote ${entries.length} entries to ${basename(indexPath)}`)

writeFileSync(llmsPath, renderLlmsCookbook(entries), 'utf-8')
console.log(`[build-cookbook-index] Wrote ${entries.length} recipes to ${basename(llmsPath)}`)

const presetsTs = renderPresetsTs(entries)
for (const presetsPath of presetsPaths) {
  writeFileSync(presetsPath, presetsTs, 'utf-8')
  console.log(
    `[build-cookbook-index] Wrote ${presetCount} playground presets to ${relative(repoRoot, presetsPath)}`,
  )
}
