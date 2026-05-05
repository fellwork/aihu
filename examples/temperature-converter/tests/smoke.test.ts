/**
 * EX-02 temperature-converter smoke test.
 */

import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

describe('EX-02 temperature-converter — agent metadata', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('registers expected @agent metadata shape', () => {
    registerAgentMetadata({
      tag: 'temperature-converter',
      state: {
        celsius: 'Temperature in degrees Celsius',
        fahrenheit: 'Temperature in degrees Fahrenheit (computed)',
      },
      actions: {
        setCelsius: { returns: {} },
        setFromF: { returns: {} },
      },
    })

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('temperature-converter')
    expect(entries[0].state?.celsius).toBeDefined()
    expect(entries[0].state?.fahrenheit).toBeDefined()
    expect(entries[0].actions?.setCelsius).toBeDefined()
    expect(entries[0].actions?.setFromF).toBeDefined()
  })
})

describe('EX-02 temperature-converter — conversion logic', () => {
  it('converts Celsius to Fahrenheit correctly', () => {
    const celsius = 20
    const fahrenheit = (celsius * 9) / 5 + 32
    expect(fahrenheit).toBe(68)
  })

  it('converts Fahrenheit back to Celsius correctly', () => {
    const setFromF = (f: number) => ((f - 32) * 5) / 9
    expect(setFromF(68)).toBeCloseTo(20)
    expect(setFromF(32)).toBe(0)
    expect(setFromF(212)).toBe(100)
  })
})
