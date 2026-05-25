#!/usr/bin/env bun
/**
 * gen-style-packs.ts — generate the shipped `styles/*.css` bundles from the
 * `src/packs.ts` `StylePack` objects (the source of truth).
 *
 * Each `styles/<name>.css` file is written as EXACTLY `pack.toCss()` — no
 * decorative header — so the two consumer access paths can never drift:
 *
 *   import { aihuDefault } from '@aihu/css-engine/packs'   // JS object
 *   import '@aihu/css-engine/styles/aihu-default.css'      // generated bundle
 *
 * `tests/style-pack.test.ts` asserts `pack.toCss()` byte-equals the file. The
 * human-readable token documentation lives in `src/packs.ts` (the source), not
 * in the generated CSS.
 *
 * Run: `bun run gen:style-packs` (wired into the package build before rolldown
 * and into `prepublishOnly`). Hand-edits to `styles/*.css` will be lost.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aihuDefault, aihuGraphite } from '../src/packs.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(__dirname, '../styles')

const packs = [aihuDefault, aihuGraphite]

for (const pack of packs) {
  const target = resolve(stylesDir, `${pack.name}.css`)
  writeFileSync(target, pack.toCss())
  console.log(`  generated ${pack.name}.css (${pack.toCss().length} bytes) → ${target}`)
}
