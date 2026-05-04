/**
 * `scribe migrate [files...]` — convert HTML-tag SFCs to @blockname {} syntax.
 *
 * Conversion rules (applied in order):
 *   <script setup>...</script>  =>  @state { ... }
 *   <template>...</template>    =>  @template { ... }
 *   <style>...</style>          =>  @style { ... }
 *   <agent>...</agent>          =>  @agent { ... }
 *
 * Zero external dependencies -- uses only Node/Bun builtins (fs).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

type BlockConversion = {
  readonly open: RegExp
  readonly close: string
  readonly blockName: string
}

const CONVERSIONS: ReadonlyArray<BlockConversion> = [
  { open: /<script\s+setup\s*>/i, close: '</script>', blockName: '@state' },
  { open: /<template\s*>/i, close: '</template>', blockName: '@template' },
  { open: /<style\s*>/i, close: '</style>', blockName: '@style' },
  { open: /<agent\s*>/i, close: '</agent>', blockName: '@agent' },
]

/**
 * Convert a single SFC file content from HTML-tag syntax to @blockname{} syntax.
 * Pure function -- does not perform any I/O.
 *
 * Blocks that are already in @blockname {} form are left untouched.
 */
export function migrateFile(content: string): string {
  let result = content

  for (const { open, close, blockName } of CONVERSIONS) {
    let match: RegExpExecArray | null
    while ((match = open.exec(result)) !== null) {
      const openTag = match[0]
      const openIdx = match.index

      const closeIdx = result.indexOf(close, openIdx + openTag.length)
      if (closeIdx === -1) break

      const body = result.slice(openIdx + openTag.length, closeIdx)
      const replacement = `${blockName} {${body}}`

      result = result.slice(0, openIdx) + replacement + result.slice(closeIdx + close.length)
    }
  }

  return result
}

/**
 * Read each file in `files`, convert it, then either write it back in-place
 * or print a diff-like preview if `dryRun` is true.
 */
export function migrateFiles(files: ReadonlyArray<string>, dryRun: boolean, cwd: string): void {
  for (const file of files) {
    const filePath = isAbsolute(file) ? file : join(cwd, file)
    const original = readFileSync(filePath, 'utf8')
    const converted = migrateFile(original)

    if (converted === original) {
      process.stdout.write(`  (unchanged) ${file}\n`)
      continue
    }

    if (dryRun) {
      process.stdout.write(`--- ${file} (original)\n+++ ${file} (converted)\n`)
      const origLines = original.split('\n')
      const convLines = converted.split('\n')
      const maxLen = Math.max(origLines.length, convLines.length)
      for (let i = 0; i < maxLen; i++) {
        const o = origLines[i]
        const c = convLines[i]
        if (o !== c) {
          if (o !== undefined) process.stdout.write(`- ${o}\n`)
          if (c !== undefined) process.stdout.write(`+ ${c}\n`)
        }
      }
    } else {
      writeFileSync(filePath, converted, 'utf8')
      process.stdout.write(`✓ Migrated ${file}\n`)
    }
  }
}
