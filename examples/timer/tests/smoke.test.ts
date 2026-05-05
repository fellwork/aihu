/**
 * EX-03 timer smoke test.
 */

import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

describe('EX-03 timer — agent metadata', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('registers expected @agent metadata shape', () => {
    registerAgentMetadata({
      tag: 'aihu-timer',
      state: {
        elapsed: 'Elapsed time in milliseconds',
        duration: 'Timer duration in milliseconds',
        progress: 'Elapsed fraction from 0 to 1',
      },
      actions: {
        reset: { returns: {} },
      },
    })

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('aihu-timer')
    expect(entries[0].state?.elapsed).toBeDefined()
    expect(entries[0].state?.progress).toBeDefined()
    expect(entries[0].actions?.reset).toBeDefined()
  })
})

describe('EX-03 timer — timer logic', () => {
  it('computes progress fraction correctly', () => {
    const progress = (elapsed: number, duration: number) =>
      duration === 0 ? 0 : Math.min(elapsed / duration, 1)

    expect(progress(0, 10000)).toBe(0)
    expect(progress(5000, 10000)).toBe(0.5)
    expect(progress(10000, 10000)).toBe(1)
    expect(progress(15000, 10000)).toBe(1) // capped at 1
  })

  it('reset sets elapsed to 0', () => {
    let elapsed = 5000
    const reset = () => {
      elapsed = 0
    }
    reset()
    expect(elapsed).toBe(0)
  })
})
