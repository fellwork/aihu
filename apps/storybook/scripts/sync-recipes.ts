#!/usr/bin/env bun
/**
 * Sync @aihu/ui registry recipes into src/recipes/ for Storybook (Plan 6).
 *
 * The compiled custom-element tag derives from the `.aihu` FILE STEM, and the
 * registry's basenames (`button.aihu`) are not valid custom-element names (no
 * hyphen). The `aihu add` CLI solves this for consumers by letting the copy
 * destination control the stem; this script applies the SAME same-source copy
 * semantics for Storybook: `registry/<name>/<name>.aihu` is copied
 * byte-identical to `src/recipes/aihu-<name>.aihu` (stem = registered tag
 * `aihu-<name>` — the prefix the sources already author).
 *
 * src/recipes/ is generated + gitignored. Run via `bun run sync:recipes`
 * (wired into the `storybook` / `build-storybook` scripts).
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = join(APP_ROOT, '..', '..', 'packages', 'ui', 'registry')
const OUT = join(APP_ROOT, 'src', 'recipes')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const synced: string[] = []
for (const dir of readdirSync(REGISTRY, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const source = join(REGISTRY, dir.name, `${dir.name}.aihu`)
  const target = join(OUT, `aihu-${dir.name}.aihu`)
  copyFileSync(source, target)
  synced.push(`aihu-${dir.name}.aihu`)
}

console.log(`aihu-storybook: synced ${synced.length} recipes → src/recipes/ (${synced.join(', ')})`)
