/**
 * EX-12 realtime-scores smoke test.
 *
 * Verifies (per m2-a2 round-3 brief):
 *   A5-1: The SFC source contains `$lifecycle`
 *   A5-2: The SFC source contains `mount`
 *   A5-3: The SFC source contains `dispose`
 *   A5-4: The SFC source contains `createResource`
 *   A5-5: The SFC source contains `@aihu-plugin/data`
 *   A5-6: The SFC source contains `@agent`
 *   A5-7: The SFC source contains `$expose`
 *   A5-8: registerAgentMetadata() can be called without throwing
 *          (registry simulation — same pattern as EX-06 weather-card and EX-09 blog-loader)
 *
 * Harness: source-text + registry simulation (same pattern as EX-06 weather-card
 * round-1 and EX-09 blog-loader round-2). DOM-mount assertions deferred to M4
 * per arch-2 §6. No live WebSocket connection. Offline-safe.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

const SFC_PATH = resolve(__dirname, '../src/realtime-scores.aihu')

// ---------------------------------------------------------------------------
// Source-text checks — A5-1 through A5-7
// ---------------------------------------------------------------------------

describe('EX-12 realtime-scores — SFC source-text checks', () => {
  const sfcSrc = readFileSync(SFC_PATH, 'utf8')

  it('A5-1: SFC source contains $lifecycle', () => {
    expect(sfcSrc).toContain('$lifecycle')
  })

  it('A5-2: SFC source contains mount', () => {
    expect(sfcSrc).toContain('mount')
  })

  it('A5-3: SFC source contains dispose', () => {
    expect(sfcSrc).toContain('dispose')
  })

  it('A5-4: SFC source contains createResource', () => {
    expect(sfcSrc).toContain('createResource')
  })

  it('A5-5: SFC source contains @aihu-plugin/data import', () => {
    expect(sfcSrc).toContain('@aihu-plugin/data')
  })

  it('A5-6: SFC source contains @agent block', () => {
    expect(sfcSrc).toContain('@agent')
  })

  it('A5-7: SFC source contains $expose', () => {
    expect(sfcSrc).toContain('$expose')
  })
})

// ---------------------------------------------------------------------------
// A5-8: Registry simulation — registerAgentMetadata() does not throw
// ---------------------------------------------------------------------------

describe('EX-12 realtime-scores — agent metadata registry', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('A5-8: registers realtime-scores agent metadata without throwing', () => {
    expect(() => {
      registerAgentMetadata({
        tag: 'realtime-scores',
        describes: 'EX-12: WebSocket live score board with createResource initial fetch overlay',
        state: {
          scores: 'Current live scores array: [{ id, team, score }]',
          connected: 'WebSocket connection state: true when connected, false otherwise',
        },
        actions: {
          getScores: { returns: {} },
        },
      })
    }).not.toThrow()

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('realtime-scores')
    expect(entries[0].state?.scores).toBeDefined()
    expect(entries[0].state?.connected).toBeDefined()
    expect(entries[0].actions?.getScores).toBeDefined()
  })
})
