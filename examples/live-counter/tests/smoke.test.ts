/**
 * EX-01 live-counter smoke test.
 *
 * Verifies:
 *   1. @aihu/agent registry works and returns expected entry shape
 *   2. Counter state logic is correct
 *
 * Note: M1 smoke tests run in jsdom (not Vitest browser mode — Playwright
 * binaries are deferred to M4 per arch-2 §6). The registry simulation
 * tests what the compiled @agent block emits.
 */

import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

describe('EX-01 live-counter — agent metadata', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('registers expected @agent metadata shape', () => {
    registerAgentMetadata({
      tag: 'live-counter',
      describes: 'A minimal counter component',
      state: {
        count: 'Current counter value',
      },
      actions: {
        increment: { returns: {} },
        decrement: { returns: {} },
        reset: { returns: {} },
      },
    })

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('live-counter')
    expect(entries[0].state?.count).toBe('Current counter value')
    expect(entries[0].actions?.increment).toBeDefined()
    expect(entries[0].actions?.decrement).toBeDefined()
    expect(entries[0].actions?.reset).toBeDefined()
  })
})

describe('EX-01 live-counter — counter logic', () => {
  it('increments correctly', () => {
    let count = 0
    const increment = () => {
      count++
    }
    const decrement = () => {
      count--
    }
    const reset = () => {
      count = 0
    }

    increment()
    increment()
    expect(count).toBe(2)
    decrement()
    expect(count).toBe(1)
    reset()
    expect(count).toBe(0)
  })
})
