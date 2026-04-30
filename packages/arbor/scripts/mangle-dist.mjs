/**
 * Post-build property mangler for @scribe/arbor.
 *
 * rolldown v1.0.0-rc.17's mangle.properties API is not wired through in the
 * rc.17 output config. This script applies safe post-minification property
 * renames to shave ~50 gz bytes from the StructuralNode + ChildScope
 * internal fields, keeping @scribe/arbor within the 2048 B gz budget.
 *
 * Only @internal properties are renamed. Public API properties (kind, tag,
 * attrs, children, value, leafKind) are excluded.
 *
 * Renames applied:
 *   StructuralNode: structuralKind→sk, condition→cn, listGrow→lg, keyFn→kf
 *   ChildScope:     appendedNodes→an, disposers→ds, anchor→ac
 *
 * Applied AFTER minification so all renames hit the single-char parameter
 * forms (e.g. condition:e from the when() factory).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(here, '../dist/index.js')

let code = readFileSync(distPath, 'utf8')

const replacements = [
  // StructuralNode fields (longer names first to avoid partial matches)
  [/\.structuralKind\b/g, '.sk'],
  [/structuralKind:/g, 'sk:'],
  [/\.listGrow\b/g, '.lg'],
  [/listGrow:/g, 'lg:'],
  [/\.keyFn\b/g, '.kf'],
  [/keyFn:/g, 'kf:'],
  [/\.condition\b/g, '.cn'],
  [/condition:/g, 'cn:'],
  // ChildScope fields
  [/\.appendedNodes\b/g, '.an'],
  [/appendedNodes:/g, 'an:'],
  [/\.disposers\b/g, '.ds'],
  [/disposers:/g, 'ds:'],
  // anchor: must come after appendedNodes to avoid false matches
  [/\.anchor\b/g, '.ac'],
  [/anchor:/g, 'ac:'],
]

for (const [regex, replacement] of replacements) {
  code = code.replace(regex, replacement)
}

writeFileSync(distPath, code, 'utf8')
console.log('mangle-dist: property mangling applied to dist/index.js')
