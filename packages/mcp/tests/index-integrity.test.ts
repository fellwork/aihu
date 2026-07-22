/**
 * Integrity tests for the COMMITTED cookbook index — the artifact the
 * `aihu_example` MCP tool actually serves.
 *
 * These are the package-local companion to scripts/check-cookbook-index.ts
 * (which diffs the committed artifacts against a fresh corpus build). Here we
 * assert invariants of the committed JSON itself, so `bun run test` in
 * packages/mcp catches a fossilized or hand-mangled index even when run in
 * isolation:
 *
 *  - every entry mirrors a real cookbook/ file (the pre-P0 fossil index had
 *    21 entries whose filenames matched NOTHING in cookbook/)
 *  - the full frontmatter schema is present (id/type/granularity/constructs/…)
 *  - no entry carries the retired pre-#497 `$action:`-collection dialect
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { CookbookEntry } from '../src/cookbook.js'

const here = dirname(fileURLToPath(import.meta.url))
const indexPath = resolve(here, '../src/cookbook-index.json')
const cookbookDir = resolve(here, '../../../cookbook')

const entries = JSON.parse(readFileSync(indexPath, 'utf-8')) as CookbookEntry[]

describe('committed cookbook-index.json', () => {
  it('is non-empty (an empty index is the failure mode, not a valid state)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(20)
  })

  it('mirrors real cookbook/ files — no fossil filenames', () => {
    for (const e of entries) {
      expect(existsSync(join(cookbookDir, e.filename)), `${e.filename} missing in cookbook/`).toBe(
        true,
      )
    }
  })

  it('is sorted by filename (deterministic regeneration)', () => {
    const filenames = entries.map((e) => e.filename)
    expect(filenames).toEqual([...filenames].sort())
  })

  it('carries the full frontmatter schema on every entry', () => {
    for (const e of entries) {
      expect(e.id, `${e.filename}: id`).toBeTruthy()
      expect(e.type, `${e.filename}: type`).toBeTruthy()
      expect(e.granularity, `${e.filename}: granularity`).toMatch(/^(block|recipe)$/)
      expect(e.description, `${e.filename}: description`).toBeTruthy()
      expect(e.constructs?.length, `${e.filename}: constructs`).toBeGreaterThan(0)
      expect(e.concerns?.length, `${e.filename}: concerns`).toBeGreaterThan(0)
      expect(e.since, `${e.filename}: since`).toMatch(/^\d+\.\d+\.\d+$/)
      expect(e.tags.length, `${e.filename}: tags`).toBeGreaterThan(0)
      expect(e.source, `${e.filename}: source`).toContain('@template')
    }
  })

  it('contains no retired pre-#497 @state collection dialect', () => {
    const retired =
      /\$(prop|computed|action|resource|effect|lifecycle|aria|form|context|controller|event|stream|extract)\s*:/
    for (const e of entries) {
      expect(retired.test(e.source), `${e.filename}: retired $-collection form in source`).toBe(
        false,
      )
    }
  })

  it('resolves every related: id within the index', () => {
    const ids = new Set(entries.map((e) => e.id))
    for (const e of entries) {
      for (const rel of e.related ?? []) {
        expect(ids.has(rel), `${e.filename}: dangling related id '${rel}'`).toBe(true)
      }
    }
  })

  it('has at least one playground-labeled recipe with unique labels', () => {
    const labels = entries.filter((e) => e.playground).map((e) => e.playground)
    expect(labels.length).toBeGreaterThan(0)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
