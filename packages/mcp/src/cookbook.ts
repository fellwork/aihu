/**
 * Cookbook index loader and intent matcher for aihu_example.
 *
 * At build time, scripts/build-cookbook-index.ts generates cookbook-index.json
 * from the cookbook/*.aihu files. This module loads that index and provides
 * keyword-based intent matching.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CookbookEntry {
  filename: string
  description: string
  tags: string[]
  source: string
}

// Load the pre-built index. The embedded source field is our fallback.
// The index is bundled into dist/ alongside the compiled JS.
let _index: CookbookEntry[] | null = null

function loadIndex(): CookbookEntry[] {
  if (_index !== null) return _index

  const here = dirname(fileURLToPath(import.meta.url))

  const candidates = [
    // AIHU_COOKBOOK_PATH env override (path to cookbook-index.json)
    ...(process.env.AIHU_COOKBOOK_PATH ? [resolve(process.env.AIHU_COOKBOOK_PATH)] : []),
    join(here, 'cookbook-index.json'),
    join(here, '..', 'src', 'cookbook-index.json'),
    resolve('packages/mcp/src/cookbook-index.json'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const raw = readFileSync(candidate, 'utf-8')
      _index = JSON.parse(raw) as CookbookEntry[]
      return _index
    }
  }

  _index = []
  return _index
}

/**
 * Tokenize an intent string into lowercase tokens.
 * Splits on whitespace and punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.\-_/\\:;!?'"()[\]{}]+/)
    .filter((t) => t.length > 0)
}

/**
 * Score a cookbook entry against an array of intent tokens.
 * Counts how many tokens appear in the entry's tags or description.
 */
function scoreEntry(entry: CookbookEntry, tokens: string[]): number {
  const descTokens = tokenize(entry.description)
  const allTerms = new Set([...entry.tags, ...descTokens])

  let score = 0
  for (const token of tokens) {
    if (allTerms.has(token)) {
      score++
    }
    // Also give partial credit if any term starts with the token (prefix match)
    for (const term of allTerms) {
      if (term !== token && term.startsWith(token) && token.length >= 3) {
        score += 0.5
        break
      }
    }
  }
  return score
}

export interface MatchResult {
  entry: CookbookEntry
  score: number
}

/**
 * Find the best matching cookbook entry for the given intent string.
 * Returns null if no entries score above zero.
 */
export function findBestMatch(intent: string, tags?: string[]): MatchResult | null {
  const index = loadIndex()
  if (index.length === 0) return null

  // Combine intent tokens with any explicitly provided tags
  const intentTokens = tokenize(intent)
  const tagTokens = (tags ?? []).map((t) => t.toLowerCase().trim())
  const allTokens = [...new Set([...intentTokens, ...tagTokens])]

  let best: MatchResult | null = null

  for (const entry of index) {
    const score = scoreEntry(entry, allTokens)
    if (best === null || score > best.score) {
      best = { entry, score }
    }
  }

  if (best === null || best.score === 0) return null
  return best
}

/**
 * Get all available tags from the cookbook index.
 */
export function getAllTags(): string[] {
  const index = loadIndex()
  const tagSet = new Set<string>()
  for (const entry of index) {
    for (const tag of entry.tags) {
      tagSet.add(tag)
    }
  }
  return [...tagSet].sort()
}

/**
 * Get the source for a cookbook entry.
 * The embedded source in the index is always the authoritative fallback.
 */
export function getEntrySource(entry: CookbookEntry): string {
  return entry.source
}

/** Exposed for testing only */
export function _resetIndex(): void {
  _index = null
}

/** Exposed for testing only */
export function _setIndex(entries: CookbookEntry[]): void {
  _index = entries
}
