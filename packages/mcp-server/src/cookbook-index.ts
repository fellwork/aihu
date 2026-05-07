/**
 * Cookbook index for @aihu/mcp-server.
 *
 * Reads all *.aihu files from the cookbook directory at server startup and
 * indexes them by pattern name (filename without .aihu extension).
 *
 * The cookbook directory is resolved from AIHU_COOKBOOK_PATH env var,
 * or falls back to the cookbook/ directory relative to the package root.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CookbookEntry {
  pattern: string
  filename: string
  source: string
}

let _index: Map<string, CookbookEntry> | null = null

function resolveCookbookPath(): string {
  // 1. Environment variable override
  if (process.env.AIHU_COOKBOOK_PATH) {
    return resolve(process.env.AIHU_COOKBOOK_PATH)
  }

  // 2. Relative to this module: packages/mcp-server/src/ → ../../cookbook/
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // From dist/: packages/mcp-server/dist → ../../cookbook
    resolve(here, '../../cookbook'),
    // From src/: packages/mcp-server/src → ../../../cookbook
    resolve(here, '../../../cookbook'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  // 3. CWD fallback (dev environment)
  return resolve('cookbook')
}

function buildIndex(): Map<string, CookbookEntry> {
  const cookbookDir = resolveCookbookPath()
  const index = new Map<string, CookbookEntry>()

  if (!existsSync(cookbookDir)) {
    return index
  }

  let files: string[]
  try {
    files = readdirSync(cookbookDir)
  } catch {
    return index
  }

  for (const file of files) {
    if (!file.endsWith('.aihu')) continue
    const pattern = file.slice(0, -5) // strip .aihu
    const filePath = join(cookbookDir, file)
    try {
      const source = readFileSync(filePath, 'utf-8')
      index.set(pattern, { pattern, filename: file, source })
    } catch {
      // skip unreadable files
    }
  }

  return index
}

/**
 * Get or initialize the cookbook index.
 * The index is built once at first access and cached for the lifetime of the process.
 */
export function getCookbookIndex(): Map<string, CookbookEntry> {
  if (_index === null) {
    _index = buildIndex()
  }
  return _index
}

/** Exposed for testing only */
export function _resetIndex(): void {
  _index = null
}

/** Exposed for testing only */
export function _setIndex(entries: Map<string, CookbookEntry>): void {
  _index = entries
}
