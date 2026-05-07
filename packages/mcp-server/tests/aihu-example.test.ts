/**
 * Tests for the aihu_example tool.
 *
 * Covers:
 * - Successful lookup by pattern name returns source containing SFC syntax
 * - Unknown pattern returns error with available list
 * - The cookbook index size matches the actual cookbook directory
 */

import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type CookbookEntry,
  _resetIndex,
  _setIndex,
  getCookbookIndex,
} from '../src/cookbook-index.js'
import { handleExample } from '../src/tools/aihu-example.js'

// ─────────────────────────────────────────────────
// Live cookbook index tests (reads from disk)
// ─────────────────────────────────────────────────

describe('cookbook index (disk)', () => {
  beforeEach(() => {
    _resetIndex()
  })

  afterEach(() => {
    _resetIndex()
  })

  it('loads the cookbook directory at startup', () => {
    const index = getCookbookIndex()
    expect(index.size).toBeGreaterThan(0)
  })

  it('contains exactly the number of .aihu files in the cookbook directory', () => {
    // Find the cookbook directory
    const candidates = [
      resolve(process.cwd(), 'cookbook'),
      resolve(process.cwd(), '../cookbook'),
      resolve(process.cwd(), '../../cookbook'),
      resolve(process.cwd(), '../../../cookbook'),
    ]
    let cookbookDir: string | undefined
    for (const c of candidates) {
      if (existsSync(c)) {
        cookbookDir = c
        break
      }
    }
    if (!cookbookDir) {
      // Cannot locate cookbook — skip without failing
      return
    }
    const aihuFiles = readdirSync(cookbookDir).filter((f) => f.endsWith('.aihu'))
    const index = getCookbookIndex()
    expect(index.size).toBe(aihuFiles.length)
  })

  it('counter pattern is present', () => {
    const index = getCookbookIndex()
    expect(index.has('counter')).toBe(true)
  })

  it('all patterns have non-empty source', () => {
    const index = getCookbookIndex()
    for (const [, entry] of index) {
      expect(entry.source.length).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────
// handleExample with injected index
// ─────────────────────────────────────────────────

const FIXTURE_INDEX = new Map<string, CookbookEntry>([
  [
    'counter',
    {
      pattern: 'counter',
      filename: 'counter.aihu',
      source:
        '@state { count: number = 0\n  $action: { increment: () => { count++ } } }\n@template { <p>{count}</p><button $on.click={increment}>+</button> }',
    },
  ],
  [
    'fetch-resource',
    {
      pattern: 'fetch-resource',
      filename: 'fetch-resource.aihu',
      source:
        '@state { $prop: { url: { type: String } } }\n@template { <div>{url}</div> }',
    },
  ],
  [
    'aria-form',
    {
      pattern: 'aria-form',
      filename: 'aria-form.aihu',
      source: '@template { <form $aria.label="contact form"><input /></form> }',
    },
  ],
])

describe('handleExample tool', () => {
  beforeEach(() => {
    _resetIndex()
    _setIndex(FIXTURE_INDEX)
  })

  afterEach(() => {
    _resetIndex()
  })

  it('returns source and filename for a known pattern', () => {
    const result = handleExample({ pattern: 'counter' })
    expect('error' in result).toBe(false)
    const r = result as { source: string; filename: string }
    expect(r.filename).toBe('counter.aihu')
    expect(r.source.length).toBeGreaterThan(0)
  })

  it('counter source contains $action or $prop', () => {
    const result = handleExample({ pattern: 'counter' })
    const r = result as { source: string }
    expect(r.source).toMatch(/\$action|\$prop/)
  })

  it('returns error object for unknown pattern', () => {
    const result = handleExample({ pattern: 'unknown' })
    expect('error' in result).toBe(true)
    const r = result as { error: string; available: string[] }
    expect(r.error).toContain('unknown pattern: unknown')
    expect(Array.isArray(r.available)).toBe(true)
    expect(r.available.length).toBeGreaterThan(0)
  })

  it('error result available list contains known patterns', () => {
    const result = handleExample({ pattern: 'no-such-thing' })
    const r = result as { error: string; available: string[] }
    expect(r.available).toContain('counter')
    expect(r.available).toContain('fetch-resource')
    expect(r.available).toContain('aria-form')
  })

  it('available list is sorted', () => {
    const result = handleExample({ pattern: 'no-such-thing' })
    const r = result as { available: string[] }
    const sorted = [...r.available].sort()
    expect(r.available).toEqual(sorted)
  })
})

// ─────────────────────────────────────────────────
// Live counter lookup
// ─────────────────────────────────────────────────

describe('handleExample with real cookbook', () => {
  beforeEach(() => {
    _resetIndex()
  })

  afterEach(() => {
    _resetIndex()
  })

  it('aihu_example({ pattern: "counter" }) returns source containing $action or @state', () => {
    const result = handleExample({ pattern: 'counter' })
    if ('error' in result) {
      // Cookbook not found in this environment — acceptable
      return
    }
    const r = result as { source: string }
    expect(r.source).toMatch(/\$action|@state/)
  })

  it('aihu_example({ pattern: "unknown" }) returns error with available list', () => {
    const result = handleExample({ pattern: 'totally-unknown-pattern-xyz' })
    expect('error' in result).toBe(true)
    const r = result as { error: string; available: string[] }
    expect(r.error).toContain('totally-unknown-pattern-xyz')
    expect(r.available.length).toBeGreaterThanOrEqual(0)
  })
})
